from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import sqlite3
import serial
import serial.tools.list_ports

app = Flask(__name__)
CORS(app)


def encontrar_porta_esp_unused():
    portas = serial.tools.list_ports.comports()
    for p in portas:
        desc = (p.description or "").lower()
        if "ch340" in desc or "ch9102" in desc or "cp210" in desc or "uart" in desc or "esp" in desc or "single serial" in desc:
            return p.device
  
    if portas:
        return portas[0].device
    return None

esp_serial = None

def conectar_esp():
    global esp_serial
    try:
        porta = "COM5"
        if porta:
            esp_serial = serial.Serial(porta, 115200, timeout=1)
            print(f"ESP32 conectado em {porta}")
        else:
            print("ESP32 nao encontrado. Rode sem ele ou verifique o cabo.")
    except Exception as e:
        print(f"Erro ao conectar ESP32: {e}")
        esp_serial = None

conectar_esp()

def enviar_esp(cmd):
    global esp_serial
    try:
        if esp_serial and esp_serial.is_open:
            esp_serial.write(cmd.encode())
        else:
            print(f"[SEM ESP32] Comando: {cmd}")
    except Exception as e:
        print(f"Erro ao enviar para ESP32: {e}")
        esp_serial = None  # reseta para nao travar nas proximas chamadas

def criar_banco():
    conn = sqlite3.connect("banco.db")
    cursor = conn.cursor()
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS historico (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pedido TEXT,
        itens TEXT,
        horario TEXT
    )
    """)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS produtos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sku TEXT,
        nome TEXT,
        estoque INTEGER
    )
    """)
    conn.commit()
    conn.close()

criar_banco()


@app.route("/")
def home():
    return send_from_directory(".", "index.html")

@app.route("/script.js")
def script():
    return send_from_directory(".", "script.js")

@app.route("/style.css")
def style():
    return send_from_directory(".", "style.css")

@app.route("/logo.png")
def logo():
    return send_from_directory(".", "logo.png")


@app.route("/comando", methods=["POST"])
def comando():
    dados = request.json
    cmd = dados.get("cmd", "")
    enviar_esp(cmd)
    return jsonify({"ok": True})


@app.route("/produto", methods=["POST"])
def produto():
    dados = request.json
    conn = sqlite3.connect("banco.db")
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO produtos (sku, nome, estoque) VALUES (?, ?, ?)",
        (dados["sku"], dados["nome"], dados["estoque"])
    )
    conn.commit()
    conn.close()
    return jsonify({"ok": True})

@app.route("/definir", methods=["POST"])
def definir():
    dados = request.json
    conn = sqlite3.connect("banco.db")
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE produtos SET estoque = ? WHERE sku = ?",
        (dados["quantidade"], dados["sku"])
    )
    conn.commit()
    conn.close()
    return jsonify({"ok": True})

@app.route("/baixar", methods=["POST"])
def baixar():
    dados = request.json
    conn = sqlite3.connect("banco.db")
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE produtos SET estoque = estoque - 1 WHERE sku = ?",
        (dados["sku"],)
    )
    conn.commit()
    conn.close()
    return jsonify({"ok": True})

@app.route("/repor", methods=["POST"])
def repor():
    dados = request.json
    conn = sqlite3.connect("banco.db")
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE produtos SET estoque = estoque + ? WHERE sku = ?",
        (dados["quantidade"], dados["sku"])
    )
    conn.commit()
    conn.close()
    return jsonify({"ok": True})

@app.route("/estoque")
def estoque():
    conn = sqlite3.connect("banco.db")
    cursor = conn.cursor()
    cursor.execute("SELECT sku, nome, estoque FROM produtos ORDER BY nome")
    dados = cursor.fetchall()
    conn.close()
    return jsonify(dados)


@app.route("/finalizar", methods=["POST"])
def finalizar():
    dados = request.json
    conn = sqlite3.connect("banco.db")
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO historico (pedido, itens, horario) VALUES (?, ?, datetime('now', 'localtime'))",
        (dados["pedido"], str(dados["itens"]))
    )
    for item in dados["itens"]:
        cursor.execute(
            "UPDATE produtos SET estoque = estoque - 1 WHERE sku = ?",
            (item,)
        )
    conn.commit()
    conn.close()
    return jsonify({"ok": True})

@app.route("/historico")
def historico():
    conn = sqlite3.connect("banco.db")
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM historico ORDER BY id DESC")
    dados = cursor.fetchall()
    conn.close()
    return jsonify(dados)

@app.route("/cancelar/<id>")
def cancelar(id):
    conn = sqlite3.connect("banco.db")
    cursor = conn.cursor()
    cursor.execute("SELECT itens FROM historico WHERE id = ?", (id,))
    resultado = cursor.fetchone()
    if not resultado:
        conn.close()
        return jsonify({"ok": False, "erro": "Pedido nao encontrado"})
    itens = eval(resultado[0])
    for item in itens:
        cursor.execute(
            "UPDATE produtos SET estoque = estoque + 1 WHERE sku = ?",
            (item,)
        )
    cursor.execute("DELETE FROM historico WHERE id = ?", (id,))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route("/grafico")
def grafico():
    conn = sqlite3.connect("banco.db")
    cursor = conn.cursor()
    cursor.execute("""
    SELECT DATE(horario) as dia, COUNT(*) as total
    FROM historico
    GROUP BY DATE(horario)
    ORDER BY dia ASC
    LIMIT 30
    """)
    dados = cursor.fetchall()
    conn.close()
    return jsonify([{"dia": row[0], "total": row[1]} for row in dados])

if __name__ == "__main__":
    app.run(debug=True, use_reloader=False)