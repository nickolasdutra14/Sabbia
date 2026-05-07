from flask import Flask, request
import serial
 
app = Flask(__name__)
 
try:
    esp = serial.Serial('COM3', 115200)
except:
    esp = None
    print("Modo simulação ativado")
 
@app.route('/comando', methods=['POST'])
def comando():
    data = request.json
    cmd = data.get("cmd")
 
    if esp:
        esp.write(cmd.encode())
    else:
        print("🟢" if cmd == "G" else "🔴")
 
    return {"ok": True}
 
app.run(port=5000)