// Guardar instâncias para poder atualizar sem "bugs" visuais
let sellerChartInstance = null;
let productsChartInstance = null;
let weekChartInstance = null;
let produtosCriticos = []; // Variável para guardar a lista

document.addEventListener('DOMContentLoaded', async () => {
    const userData = JSON.parse(localStorage.getItem('polifonia_user'));

    // Validação de Perfil para "Administrador"
    if (!userData || (!userData.perfis.includes('Administrador') && !userData.perfis.includes('Administrador Empresas'))) {
        alert("Acesso restrito a Administradores.");
        window.location.href = 'venda.html';
        return;
    }
    // Validação de Perfil para Gestão de Empresas ("Super Admin")
    if (userData.perfis.includes('Administrador Empresas')) {
        const menuEmpresas = document.getElementById('menuEmpresas');
        if (menuEmpresas) menuEmpresas.style.display = 'block';
        console.log('menu-empresas');
    }



    document.getElementById('logo-display').src = userData.foto_logo;
    document.getElementById('welcomeMsg').innerText = `Olá, ${userData.user}`;

    // Configurar datas padrão (Início do mês até hoje)
    const hoje = new Date().toISOString().split('T')[0];
    const inicioMes = new Date(new Date().setDate(1)).toISOString().split('T')[0];
    document.getElementById('dashInicio').value = inicioMes;
    document.getElementById('dashFim').value = hoje;

    fetchDashboardData();
});

// Função fetch corrigida com proteção contra erros
async function fetchDashboardData() {
    const inicio = document.getElementById('dashInicio').value;
    const fim = document.getElementById('dashFim').value;        

    // Captura o ID da empresa do utilizador logado
    const userData = JSON.parse(localStorage.getItem('polifonia_user'));
    const empId = userData.empresa_id;

    try {
        const res = await fetch(`http://localhost:3000/dashboard-data?inicio=${inicio}&fim=${fim}&empresa_id=${empId}`);
        
        if (!res.ok) throw new Error("Erro na requisição ao servidor");
        
        const data = await res.json();
        
        // Verifica se 'data.hoje' existe antes de renderizar
        if (data && data.hoje) {
            // Agora passamos também os dados financeiros para a função
            renderKPIs(data.hoje, data.estoqueCritico.length, data.financeiro); // Passa a contagem
            renderSellerChart(data.ranking);
            renderProductsChart(data.topProdutos);
            renderWeekChart(data.grafico);

              // Guardamos os itens críticos para o modal de alerta
            produtosCriticos = data.estoqueCritico;
        }
    } catch (err) { 
        console.error("Erro dashboard:", err);
        alert("Não foi possível carregar os dados do dashboard.");
    }
}

// Proteção extra na renderKPIs
function renderKPIs(dados, totalCritico, dadosFin) {
    
    if (!dados) return;

    const formatoMoeda = { style: 'currency', currency: 'BRL' };

    const total = Number(dados.total_faturado) || 0;
    const custo = Number(dados.total_custo) || 0;
    const lucro = total - custo;
    const count = dados.qtd_vendas || 0;
    const ticket = Number(dados.ticket_medio) || 0;

    document.getElementById('kpiTotal').innerText = total.toLocaleString('pt-BR', formatoMoeda);
    document.getElementById('kpiLucro').innerText = lucro.toLocaleString('pt-BR', formatoMoeda);
    document.getElementById('kpiCount').innerText = count;
    document.getElementById('kpiTicket').innerText = ticket.toLocaleString('pt-BR', formatoMoeda);

    // 2. KPI de Estoque
    const elEstoque = document.getElementById('kpiEstoque');
    elEstoque.innerText = totalCritico;
    // Se houver itens críticos, faz o número pulsar em vermelho/laranja
    elEstoque.style.color = totalCritico > 0 ? "#d29922" : "white";

    // 3. NOVO: KPI de Saldo Financeiro
    const entradas = Number(dadosFin.total_entradas || 0);
    const saidas = Number(dadosFin.total_saidas || 0);
    const saldo = entradas - saidas;

    const elSaldo = document.getElementById('kpiSaldo');
    elSaldo.innerText = saldo.toLocaleString('pt-BR', formatoMoeda);
    
    // Feedback visual: Verde se positivo, Vermelho se negativo
    elSaldo.style.color = saldo >= 0 ? "#238636" : "#da3633";

    // Detalhe extra: mostra o resumo de entradas/saídas no card
    document.getElementById('subSaldo').innerText = `E: ${entradas.toLocaleString('pt-BR', formatoMoeda)} | S: ${saidas.toLocaleString('pt-BR', formatoMoeda)}`;
}


// Função para mostrar quais produtos estão críticos
function mostrarDetalhesEstoque() {
    if (produtosCriticos.length === 0) {
        alert("🎉 Tudo em dia! Nenhum produto abaixo do estoque mínimo.");
        return;
    }

    const lista = produtosCriticos.map(p => `- ${p.nome} (Qtd: ${p.estoque_atual} / Mín: ${p.estoque_minimo})`).join('\n');
    alert(`⚠️ ATENÇÃO - REPOSIÇÃO NECESSÁRIA:\n\n${lista}`);
}


function renderSellerChart(ranking) {
    if (sellerChartInstance) sellerChartInstance.destroy();
    sellerChartInstance = new Chart(document.getElementById('sellerChart'), {
        type: 'doughnut',
        data: {
            labels: ranking.map(r => r.vendedor),
            datasets: [{
                data: ranking.map(r => r.total_vendido),
                backgroundColor: ['#8b1a1a', '#1f6feb', '#238636', '#d29922', '#8b949e']
            }]
        }
    });
}

// NOVO: Função para o Ranking de Produtos (Horizontal Bar)
function renderProductsChart(topProdutos) {
    if (productsChartInstance) productsChartInstance.destroy();
    productsChartInstance = new Chart(document.getElementById('productsChart'), {
        type: 'bar',
        data: {
            labels: topProdutos.map(p => p.nome),
            datasets: [{
                label: 'Unidades',
                data: topProdutos.map(p => p.total_qtd),
                backgroundColor: '#238636',
                borderRadius: 4
            }]
        },
        options: {
            indexAxis: 'y', // Torna o gráfico horizontal
            scales: { x: { beginAtZero: true } },
            plugins: { legend: { display: false } }
        }
    });
}

function renderWeekChart(dados) {
    if (weekChartInstance) weekChartInstance.destroy();
    weekChartInstance = new Chart(document.getElementById('weekChart'), {
        type: 'bar',
        data: {
            labels: dados.map(d => new Date(d.data).toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'})),
            datasets: [{
                label: 'Vendas (R$)',
                data: dados.map(d => d.total),
                backgroundColor: '#1f6feb',
                borderRadius: 4
            }]
        },
        options: { scales: { y: { beginAtZero: true } } }
    });
}

function logout() {
    localStorage.removeItem('polifonia_user');
    window.location.href = 'login.html';
}