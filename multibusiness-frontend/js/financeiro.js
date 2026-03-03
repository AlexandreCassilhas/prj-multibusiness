let allTypes = [];
let allCaixa = [];
const hoje = new Date().toISOString().split('T')[0];

document.addEventListener('DOMContentLoaded', () => {

    // Definindo as datas padrão (Início do mês até hoje)
    const dataHoje = new Date().toISOString().split('T')[0];
    const primeiroDia = new Date(new Date().setDate(1)).toISOString().split('T')[0];

    // Carregar nome do usuário logado (padrão Polifonia)
    const userData = JSON.parse(localStorage.getItem('polifonia_user'));
    if (!userData) {
        window.location.href = 'login.html'
    } else {
        document.getElementById('userNameDisplay').innerText = userData.user;
        document.getElementById('filtroInicio').value = primeiroDia;
        document.getElementById('filtroFim').value = dataHoje;
    };

    loadTypes();
    loadCaixa();
});

// --- NAVEGAÇÃO DE ABAS ---
function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    
    document.getElementById(`tab-${tabName}`).classList.add('active');
    event.currentTarget.classList.add('active');
}

// ==========================================
// GESTÃO DE TIPOS DE LANÇAMENTO
// ==========================================

async function loadTypes() {
    try {
        const res = await fetch('http://localhost:3000/fin-tipos');
        allTypes = await res.json();
        renderTypesTable();
        filterTypesByFluxo(); // Atualiza o select do outro modal
    } catch (e) { console.error("Erro ao carregar tipos:", e); }
}

function renderTypesTable() {
    const tbody = document.getElementById('tipos-body');
    tbody.innerHTML = allTypes.map(t => `
        <tr>
            <td>${t.descricao}</td>
            <td><span class="badge ${t.tipo === 'Entrada' ? 'badge-entrada' : 'badge-saida'}"> ${t.tipo}</span></td>
            <td>
                <button class="btn-edit" onclick="editTipo(${t.id})"  title="Editar">✎</button>
                <button class="btn-delete" onclick="softDeleteTipo(${t.id}, '${t.descricao}')" title="Excluir">✕</button>
            </td>
        </tr>
    `).join('');
}


function openTipoModal() {
    document.getElementById('formTipo').reset();
    document.getElementById('tipoId').value = "";
    document.getElementById('tipoModalTitle').innerText = "Novo Tipo de Lançamento";
    document.getElementById('modal-tipo').style.display = 'flex';
}

function editTipo(id) {
    const tipo = allTypes.find(t => t.id === id);
    if (!tipo) return;

    document.getElementById('tipoId').value = tipo.id;
    document.getElementById('tipoDesc').value = tipo.descricao;
    document.getElementById('tipoFluxo').value = tipo.tipo;
    document.getElementById('tipoModalTitle').innerText = "Editar Tipo";
    document.getElementById('modal-tipo').style.display = 'flex';
}

// Salvar Tipo (POST/PUT)
// --- CORREÇÃO DO FORMULÁRIO DE TIPOS ---
// Adicionamos o ".onsubmit" antes do sinal de "="
document.getElementById('formTipo').onsubmit = async (e) => {
    e.preventDefault();
    
    const id = document.getElementById('tipoId').value;
    const payload = {
        descricao: document.getElementById('tipoDesc').value,
        tipo: document.getElementById('tipoFluxo').value
    };

    const method = id ? 'PUT' : 'POST';
    const url = id ? `http://localhost:3000/fin-tipos/${id}` : 'http://localhost:3000/fin-tipos';

    try {
        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            closeModal('modal-tipo');
            loadTypes();
        } else {
            alert("Erro ao salvar o tipo de lançamento.");
        }
    } catch (err) {
        console.error("Erro na requisição:", err);
    }
};

// ==========================================
// GESTÃO DO LIVRO CAIXA
// ==========================================

async function loadCaixa() {
    const inicio = document.getElementById('filtroInicio').value;
    const fim = document.getElementById('filtroFim').value;

    try {
        // 1. Busca Saldo Anterior
        const resSaldo = await fetch(`http://localhost:3000/fin-saldo-anterior?inicio=${inicio}`);
        const { saldoAnterior } = await resSaldo.json();

        // 2. Busca Lançamentos do Período
        const resCaixa = await fetch(`http://localhost:3000/fin-caixa?inicio=${inicio}&fim=${fim}`);
        allCaixa = await resCaixa.json();
        
        // 3. Renderiza com o novo formato
        renderCaixaContabil(saldoAnterior);
    } catch (e) { console.error("Erro no Livro Caixa:", e); }
}

function calcularResumoFinanceiro() {
    let entradas = 0;
    let saidas = 0;

    allCaixa.forEach(l => {
        if (l.tipo === 'Entrada') entradas += Number(l.valor);
        else saidas += Number(l.valor);
    });

    const saldo = entradas - saidas;
    const formato = { style: 'currency', currency: 'BRL' };

    document.getElementById('resumoEntradas').innerText = entradas.toLocaleString('pt-BR', formato);
    document.getElementById('resumoSaidas').innerText = saidas.toLocaleString('pt-BR', formato);
    
    const elSaldo = document.getElementById('resumoSaldo');
    elSaldo.innerText = saldo.toLocaleString('pt-BR', formato);
    elSaldo.style.color = saldo >= 0 ? "#238636" : "#da3633";
}

function renderCaixaContabil(saldoAnterior) {
    const tbody = document.getElementById('caixa-body');
    const tfoot = document.getElementById('caixa-footer');
    let totalEntradas = 0;
    let totalSaidas = 0;

    // Inverte a ordem para cronológica (mais antigo primeiro) conforme padrão contábil
    const listaCronologica = [...allCaixa].reverse();

    tbody.innerHTML = listaCronologica.map((l, index) => {
        const valor = Number(l.valor);
        if (l.tipo === 'Entrada') totalEntradas += valor;
        else totalSaidas += valor;

        const dataFormatada = l.data_lancamento.split('T')[0].split('-').reverse().join('/');

        return `
            <tr>
                <td>${index + 1}</td>
                <td>${dataFormatada}</td>
                <td><strong>${l.tipo_nome}</strong><br><small>${l.descricao || ''}</small></td>
                <td style="color: #238636; text-align: right;">${l.tipo === 'Entrada' ? valor.toLocaleString('pt-BR', {minimumFractionDigits: 2}) : '-'}</td>
                <td style="color: #da3633; text-align: right;">${l.tipo === 'Saída' ? valor.toLocaleString('pt-BR', {minimumFractionDigits: 2}) : '-'}</td>
                <td class="no-print" style="padding-left: 30px;">
                    <button class="btn-edit" onclick="editCaixa(${l.id})">✎</button>
                    <button class="btn-delete" onclick="softDeleteCaixa(${l.id})">✕</button>
                </td>
            </tr>
        `;
    }).join('');

    // Roda de Totais e Fechamento
    const saldoPeriodo = totalEntradas - totalSaidas;
    const saldoAtual = Number(saldoAnterior) + saldoPeriodo;
    const formato = { minimumFractionDigits: 2, maximumFractionDigits: 2 };

    tfoot.innerHTML = `
        <tr class="footer-totals">
            <td colspan="3" style="text-align: right; font-weight: bold;">TOTAIS DO PERÍODO:</td>
            <td style="text-align: right; color: #238636; font-weight: bold;">R$ ${totalEntradas.toLocaleString('pt-BR', formato)}</td>
            <td style="text-align: right; color: #da3633; font-weight: bold;">R$ ${totalSaidas.toLocaleString('pt-BR', formato)}</td>
            <td class="no-print"></td>
        </tr>
        <tr class="footer-balance">
            <td colspan="3" style="text-align: right;">(+) SALDO ANTERIOR (Transportado):</td>
            <td colspan="2" style="text-align: right; font-weight: bold;">R$ ${Number(saldoAnterior).toLocaleString('pt-BR', formato)}</td>
            <td class="no-print"></td>
        </tr>
        <tr class="footer-final">
            <td colspan="3" style="text-align: right; font-size: 1.1rem; font-weight: bold;">(=) SALDO ATUAL:</td>
            <td colspan="2" style="text-align: right; font-size: 1.1rem; font-weight: bold; color: ${saldoAtual >= 0 ? '#238636' : '#da3633'}">
                R$ ${saldoAtual.toLocaleString('pt-BR', formato)}
            </td>
            <td class="no-print"></td>
        </tr>
    `;

    // Atualiza também os cards de resumo no topo (opcional, para manter sincronia)
    document.getElementById('resumoEntradas').innerText = `R$ ${totalEntradas.toLocaleString('pt-BR', formato)}`;
    document.getElementById('resumoSaidas').innerText = `R$ ${totalSaidas.toLocaleString('pt-BR', formato)}`;
    document.getElementById('resumoSaldo').innerText = `R$ ${saldoPeriodo.toLocaleString('pt-BR', formato)}`;
}

function renderCaixaTable() {
    const tbody = document.getElementById('caixa-body');
    tbody.innerHTML = allCaixa.map(l => {
        
        // 🛡️ TRATAMENTO SEGURO DA DATA
        let dataFormatada;
        try {
            // Se já for uma string ISO (contém 'T'), limpamos e invertemos
            if (typeof l.data_lancamento === 'string') {
                dataFormatada = l.data_lancamento.split('T')[0].split('-').reverse().join('/');
            } else {
                // Se for um objeto Date, usamos toLocaleDateString forçando UTC
                dataFormatada = new Date(l.data_lancamento).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
            }
        } catch (e) {
            dataFormatada = "Data Inválida";
        } 

        return `
            <tr class="${l.tipo === 'Entrada' ? 'row-entrada' : 'row-saida'}">
                <td>${new Date(l.data_lancamento).toLocaleDateString('pt-BR')}</td>
                <td><strong>${l.tipo_nome}</strong></td>
                <td>${l.descricao || '-'}</td>
                <td class="valor-cell">R$ ${Number(l.valor).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                <td>
                    <button class="btn-edit" onclick="editCaixa(${l.id})"  title="Editar">✎</button>
                    <button class="btn-delete" onclick="softDeleteCaixa(${l.id})" title="Excluir">✕</button>
                </td>
            </tr>
        `
    }).join('');
}

function openCaixaModal() {
    document.getElementById('formCaixa').reset();
    document.getElementById('caixaId').value = "";
    document.getElementById('caixaData').value = hoje;
    document.getElementById('caixaModalTitle').innerText = "Novo Lançamento";
    filterTypesByFluxo(); // Garante que o select carregue as Entradas por padrão
    document.getElementById('modal-caixa').style.display = 'flex';
}

// Filtra o Select de Tipos baseado no Radio Button (Entrada/Saída)
function filterTypesByFluxo() {
    const selectedFluxo = document.querySelector('input[name="fluxo"]:checked').value;
    const select = document.getElementById('caixaTipoSelect');
    
    const filtered = allTypes.filter(t => t.tipo === selectedFluxo);
    select.innerHTML = filtered.map(t => `<option value="${t.id}">${t.descricao}</option>`).join('');
}

async function editCaixa(id) {
    const lanc = allCaixa.find(l => l.id === id);
    if (!lanc) return;

    document.getElementById('caixaId').value = lanc.id;
    document.getElementById('caixaDesc').value = lanc.descricao;
    document.getElementById('caixaValor').value = lanc.valor;
    document.getElementById('caixaData').value = lanc.data_lancamento.split('T')[0];
    
    // Seleciona o Radio Button correto
    document.querySelector(`input[name="fluxo"][value="${lanc.tipo}"]`).checked = true;
    
    // Atualiza o select de tipos e seleciona o ID correto
    filterTypesByFluxo();
    document.getElementById('caixaTipoSelect').value = lanc.id_tipo_lancamento;

    document.getElementById('caixaModalTitle').innerText = "Editar Lançamento";
    document.getElementById('modal-caixa').style.display = 'flex';
}

document.getElementById('formCaixa').onsubmit = async (e) => {
    e.preventDefault();

    // 🛡️ VALIDAÇÃO DE VALOR
    const valorInput = document.getElementById('caixaValor').value;
    const valorNum = parseFloat(valorInput);
    if (isNaN(valorNum) || valorNum <= 0) {
        alert("⚠️ O valor do lançamento deve ser maior que zero!");
        document.getElementById('caixaValor').focus();
        return; // Interrompe o envio para o servidor
    }

    const id = document.getElementById('caixaId').value;
    const userData = JSON.parse(localStorage.getItem('polifonia_user'));

    const payload = {
        id_tipo_lancamento: document.getElementById('caixaTipoSelect').value,
        descricao: document.getElementById('caixaDesc').value,
        data_lancamento: document.getElementById('caixaData').value,
        valor: valorNum,
        id_usuario: userData.id || 1 // Fallback para segurança
    };

    const method = id ? 'PUT' : 'POST';
    const url = id ? `http://localhost:3000/fin-caixa/${id}` : 'http://localhost:3000/fin-caixa';

    const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (res.ok) {
        closeModal('modal-caixa');
        loadCaixa();
    }
};

// Funções Utilitárias
function closeModal(modalId) { document.getElementById(modalId).style.display = 'none'; }

async function softDeleteTipo(id, nome) {
    if (!confirm(`Deseja remover o tipo "${nome}"?\nIsso não apagará os lançamentos já feitos.`)) return;
    await fetch(`http://localhost:3000/fin-tipos/${id}`, { method: 'DELETE' });
    loadTypes();
}

async function softDeleteCaixa(id) {
    if (!confirm("Deseja cancelar este lançamento do Livro Caixa?")) return;
    await fetch(`http://localhost:3000/fin-caixa/${id}`, { method: 'DELETE' });
    loadCaixa();
}