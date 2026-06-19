
var catalogo = [];

function gerarProdutos(nome, codigoBase, cores, tamanhos) {
    cores.forEach(function(cor) {
        tamanhos.forEach(function(tam) {
            catalogo.push({
                sku: (codigoBase + "-" + cor + "-" + tam).toUpperCase(),
                nome: nome + " - " + cor + " (" + tam + ")"
            });
        });
    });
}

var tamanhos = ["P", "M", "G"];
gerarProdutos("Maio Nara Boho",   "MAIO-NARA", ["PRETO","MARROM","AZUL","VERDE"], tamanhos);
gerarProdutos("Biquini Nara Boho","BIQ-NARA",  ["MARROM","VERMELHO","PRETO","VERDE","OFF","CARAMELO"], tamanhos);
gerarProdutos("Brisa",            "BRISA",     ["BRONZE","PRETO","OFF"], tamanhos);


async function sincronizarCatalogo() {
    try {
        var r = await fetch("http://localhost:5000/estoque");
        var lista = await r.json();
        var skus = lista.map(function(p) { return p[0]; });
        for (var i = 0; i < catalogo.length; i++) {
            var prod = catalogo[i];
            if (!skus.includes(prod.sku)) {
                await fetch("http://localhost:5000/produto", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ sku: prod.sku, nome: prod.nome, estoque: 0 })
                });
            }
        }
    } catch (e) { console.error("Erro sincronizar:", e); }
}

sincronizarCatalogo();

function mostrarAba(aba) {
    var todas = ["telaCriar", "telaValidar", "telaHistorico", "telaEstoque"];
    todas.forEach(function(id) {
        document.getElementById(id).style.display = "none";
    });
    var mapa = {
        inicio:   "telaCriar",
        validar:  "telaValidar",
        historico:"telaHistorico",
        estoque:  "telaEstoque"
    };
    document.getElementById(mapa[aba]).style.display = "block";
}

function navegarPara(aba) {
    history.pushState({ aba: aba }, "", "#" + aba);
    mostrarAba(aba);
    if (aba === "historico") carregarHistorico();
    if (aba === "estoque")   renderEstoque();
}

window.addEventListener("popstate", function(e) {
    var aba = (e.state && e.state.aba) ? e.state.aba : "inicio";
    mostrarAba(aba);
    if (aba === "historico") carregarHistorico();
    if (aba === "estoque")   renderEstoque();
});

history.replaceState({ aba: "inicio" }, "", "#inicio");


var pedido = { id: "", produtos: [], embalados: [] };

var catalogoHTML    = document.getElementById("catalogo");
var itensPedidoHTML = document.getElementById("itensPedido");
var listaHTML       = document.getElementById("lista");

catalogo.forEach(function(prod) {
    var li  = document.createElement("li");
    li.textContent = prod.nome;
    var btn = document.createElement("button");
    btn.textContent = "+";
    btn.onclick = function() { adicionar(prod.sku); };
    li.appendChild(btn);
    catalogoHTML.appendChild(li);
});

function adicionar(sku) {
    pedido.produtos.push(sku);
    renderCriacao();
}

function renderCriacao() {
    itensPedidoHTML.innerHTML = "";
    pedido.produtos.forEach(function(sku, index) {
        var prod = catalogo.find(function(p) { return p.sku === sku; });
        var li   = document.createElement("li");
        li.textContent = prod.nome;
        var btn  = document.createElement("button");
        btn.textContent = "Remover";
        btn.onclick = function() {
            pedido.produtos.splice(index, 1);
            renderCriacao();
        };
        li.appendChild(btn);
        itensPedidoHTML.appendChild(li);
    });
}

function gerarID() {
    return "PED" + Math.floor(Math.random() * 10000);
}

function confirmarPedido() {
    if (pedido.produtos.length === 0) { alert("Adicione produtos!"); return; }
    pedido.id = gerarID();
    document.getElementById("pedidoId").innerText = pedido.id;
    navegarPara("validar");
    render();
}

function voltar() {
    history.back();
}


document.getElementById("input").addEventListener("keydown", function(e) {
    if (e.key === "Enter") {
        var codigo = this.value.trim().toUpperCase();
        this.value = "";
        processarCodigo(codigo);
    }
});

function processarCodigo(codigo) {
    if (!codigo) return;
    if (pedido.produtos.includes(codigo)) {
        var total  = pedido.produtos.filter(function(p) { return p === codigo; }).length;
        var feitos = pedido.embalados.filter(function(p) { return p === codigo; }).length;
        if (feitos < total) { pedido.embalados.push(codigo); enviarESP("G"); }
        else                { enviarESP("R"); }
    } else { enviarESP("R"); }
    render();
}

function render() {
    listaHTML.innerHTML = "";
    var contagem = {};
    pedido.produtos.forEach(function(p) { contagem[p] = (contagem[p] || 0) + 1; });
    for (var sku in contagem) {
        var prod   = catalogo.find(function(p) { return p.sku === sku; });
        var total  = contagem[sku];
        var feitos = pedido.embalados.filter(function(p) { return p === sku; }).length;
        var li     = document.createElement("li");
        li.textContent = prod.nome + " (" + feitos + "/" + total + ")";
        if (feitos === total) li.classList.add("ok");
        listaHTML.appendChild(li);
    }
    document.getElementById("finalizar").disabled =
        pedido.embalados.length !== pedido.produtos.length;
}


async function finalizar() {
    try {
        var r = await fetch("http://localhost:5000/finalizar", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pedido: pedido.id, itens: pedido.produtos })
        });
        var dados = await r.json();
        if (dados.ok) { alert("Pedido Finalizado!"); location.reload(); }
        else           { alert("Erro ao finalizar pedido."); }
    } catch (e) {
        console.error("Erro ao finalizar:", e);
        alert("Erro de conexao com o servidor.");
    }
}

function enviarESP(cmd) {
    fetch("http://localhost:5000/comando", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cmd: cmd })
    }).catch(function() {
        console.log(cmd === "G" ? "CORRETO" : "ERRADO");
    });
}

var graficoInstance = null;

async function carregarGrafico() {
    try {
        var r     = await fetch("http://localhost:5000/grafico");
        var dados = await r.json();
        var labels = dados.map(function(d) {
            var p = d.dia.split("-"); return p[2] + "/" + p[1];
        });
        var valores = dados.map(function(d) { return d.total; });
        var ctx = document.getElementById("grafico");
        if (graficoInstance) graficoInstance.destroy();
        graficoInstance = new Chart(ctx, {
            type: "bar",
            data: { labels: labels, datasets: [{ label: "Pedidos", data: valores, backgroundColor: "#2f80ed" }] },
            options: { scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
        });
    } catch (e) { console.error("Erro grafico:", e); }
}

carregarGrafico();

async function carregarHistorico() {
    var r     = await fetch("http://localhost:5000/historico");
    var dados = await r.json();
    var ul    = document.getElementById("listaHistorico");
    ul.innerHTML = "";
    dados.forEach(function(p) {
        var itensArray = p[2].replace(/[\[\]']/g,"").split(",").map(function(s){return s.trim();}).filter(Boolean);
        var partes = (p[3] || "").split(" ");
        var dp = (partes[0] || "").split("-");
        var dataF = dp[2] ? dp[2]+"/"+dp[1]+"/"+dp[0] : "";
        var horaF = partes[1] ? partes[1].slice(0,5) : "";
        var li = document.createElement("li");
        li.className = "historico-item";
        li.innerHTML =
            '<div class="historico-info">' +
                '<span class="historico-id">'   + p[1]  + '</span>' +
                '<span class="historico-data">'  + dataF + '</span>' +
                '<span class="historico-hora">'  + horaF + '</span>' +
            '</div>' +
            '<div class="historico-itens">' +
                itensArray.map(function(s){ return '<span class="tag-sku">'+s+'</span>'; }).join("") +
            '</div>' +
            '<button onclick="cancelarPedido('+p[0]+')">Cancelar</button>';
        ul.appendChild(li);
    });
}

function abrirHistorico() { navegarPara("historico"); }

async function cancelarPedido(id) {
    await fetch("http://localhost:5000/cancelar/" + id);
    carregarHistorico();
    carregarGrafico();
}

function fecharHistorico() { history.back(); }

function abrirEstoque() { navegarPara("estoque"); }

async function renderEstoque() {
    var ul = document.getElementById("listaEstoque");
    ul.innerHTML = "<li style='color:#888;padding:10px'>Carregando...</li>";

    var estoqueMap = {};
    try {
        var r     = await fetch("http://localhost:5000/estoque");
        var dados = await r.json();
        dados.forEach(function(p) { estoqueMap[p[0]] = p[2]; });
    } catch (e) { console.error("Erro estoque:", e); }

    ul.innerHTML = "";
    catalogo.forEach(function(prod) {
        var quantidade = (prod.sku in estoqueMap) ? estoqueMap[prod.sku] : 0;
        var li = document.createElement("li");
        li.className = "estoque-item";
        li.innerHTML =
            '<span class="estoque-nome">' + prod.nome + '</span>' +
            '<div class="estoque-controles">' +
                '<button class="btn-menos" onclick="ajustarEstoque(\'' + prod.sku + '\', -1)">-</button>' +
                '<input class="estoque-input' + (quantidade <= 0 ? ' estoque-zero' : '') + '" type="number" min="0" id="qtd-' + prod.sku + '" value="' + quantidade + '" onchange="definirEstoque(\'' + prod.sku + '\', this)">' +
                '<button class="btn-mais" onclick="ajustarEstoque(\'' + prod.sku + '\', 1)">+</button>' +
            '</div>';
        ul.appendChild(li);
    });
}

async function ajustarEstoque(sku, delta) {
    var input = document.getElementById("qtd-" + sku);
    var novo  = (parseInt(input.value) || 0) + delta;
    if (novo < 0) return;
    input.value = novo;
    input.className = "estoque-input" + (novo <= 0 ? " estoque-zero" : "");
    await fetch("http://localhost:5000/definir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku: sku, quantidade: novo })
    });
}

async function definirEstoque(sku, input) {
    var novo = parseInt(input.value);
    if (isNaN(novo) || novo < 0) { novo = 0; input.value = 0; }
    input.className = "estoque-input" + (novo <= 0 ? " estoque-zero" : "");
    await fetch("http://localhost:5000/definir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku: sku, quantidade: novo })
    });
}

function fecharEstoque() { history.back(); }
