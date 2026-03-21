
function carregarSessaoUsuario() {
    const rawData = localStorage.getItem('polifonia_user');
    
    if (!rawData) {
        // Se não houver dados, expulsa para o login
        window.location.href = 'login.html';
        return;
    }

    const userData = JSON.parse(rawData);

    // 1. Atualiza Nome e Perfil (pega o primeiro perfil se houver vários)
    document.getElementById('title').innerText = userData.nome_fantasia;
    document.getElementById('userNameDisplay').innerText = userData.user;
    document.getElementById('userRoleDisplay').innerText = userData.perfis[0];
    document.getElementById('nome-empresa').innerText = userData.nome_fantasia;
    document.getElementById('cnpj').innerText = userData.cnpj;
    document.getElementById('logo-display').src = userData.foto_logo;

    // 2. Atualiza a Foto (se existir no banco)
    if (userData.foto) {
        document.getElementById('userPhotoDisplay').src = userData.foto;
    } else {
        // Foto padrão caso o usuário não tenha cadastrado uma
        document.getElementById('userPhotoDisplay').src = '/img/foto2x2.jpg';
    }
}

function logout() {
    if (confirm("Deseja realmente sair do sistema?")) {
        localStorage.removeItem('polifonia_user');
        window.location.href = 'login.html';
    }
}

async function carregarProdutosDoBanco() {
    const userData = JSON.parse(localStorage.getItem('polifonia_user'));

    try {
        const res = await fetch(`http://localhost:3000/produtos?empresa_id=${userData.empresa_id}`);
        const produtos = await res.json();
        const select = document.getElementById('product');

        // Limpa opções antigas
        select.innerHTML = '<option value="0" data-name="" data-custo="0">Selecione um item...</option>';

        produtos.forEach(p => {
            // Se estoque for 0, desabilita a opção
            const disabled = p.estoque_atual <= 0 ? 'disabled' : '';
            const textoEstoque = p.estoque_atual <= 0 ? '(Sem Estoque)' : '';
            
            // Guardamos o Custo e o ID no dataset para usar na venda
            select.innerHTML += `
                <option value="${p.preco_venda}" 
                        data-id="${p.id}" 
                        data-name="${p.nome}"
                        data-custo="${p.custo_cpv}" 
                        ${disabled}>
                    ${p.nome} - R$ ${p.preco_venda} ${textoEstoque}
                </option>
            `;
        });
    } catch (e) { console.error("Erro ao carregar produtos:", e); }
}


// Rotina de Segurança - Controle de Acesso ***
document.addEventListener('DOMContentLoaded', () => {
    carregarSessaoUsuario();
    const userData = JSON.parse(localStorage.getItem('polifonia_user'));

    if (!userData) {
        window.location.href = 'login.html'; // Se não logou, volta para o login
        return;
    }

    if (!userData.perfis.includes('Administrador') && !userData.perfis.includes('Administrador Empresas')) {
        document.getElementById('btn-dash').style.display = 'none'; // esconde o botão de "Voltar ao DashBoard"
    }

});

let cartItems = [];

function updatePrice() {
    const productSelect = document.getElementById('product');
    const priceInput = document.getElementById('price');
    priceInput.value = productSelect.value !== "0" ? productSelect.value : "";
}

function addToCart() {
    const productSelect = document.getElementById('product');
    const selectedOption = productSelect.options[productSelect.selectedIndex];
    const productName = productSelect.options[productSelect.selectedIndex].getAttribute('data-name');
    const price = parseFloat(document.getElementById('price').value);
    const quantity = parseInt(document.getElementById('quantity').value);
    const discount = parseFloat(document.getElementById('discount').value) || 0;
    // Novos dados necessários para o Backend
    const productId = Number(selectedOption.getAttribute('data-id')); // Converte para Número
    const productCost = Number(selectedOption.getAttribute('data-custo')); // Converte para Número

    if (!productName || isNaN(price)) {
        alert("Selecione um produto válido!");
        return;
    }
   
    const subtotal = (price * quantity) - discount;
    cartItems.push({ 
        id: productId, 
        name: productName, 
        qty: quantity, 
        price: price,
        custo: productCost,
        total: subtotal 
    });
    renderCart();
    resetFields();
}

function renderCart() {
    const cartBody = document.getElementById('cart-body');
    const grandTotalDisplay = document.getElementById('grand-total');
    const globalDiscount = parseFloat(document.getElementById('globalDiscount').value) || 0;
    
    cartBody.innerHTML = "";
    let totalItens = 0;

    cartItems.forEach(item => {
        totalItens += item.total;
        cartBody.innerHTML += `
            <tr>
                <td>${item.name}</td>
                <td>${item.qty}x</td>
                <td>R$ ${item.total.toFixed(2)}</td>
                <td><button class="btn-remove" onclick="removeItem(${item.id})">✕</button></td>
            </tr>
        `;
    });

    const totalFinal = Math.max(0, totalItens - globalDiscount);
    grandTotalDisplay.innerText = totalFinal.toFixed(2).replace('.', ',');
}

// AGORA: Enviar a venda para o Servidor
async function finishSale() {
    // Carrega os dados do usuário no localStorage
    const userData = JSON.parse(localStorage.getItem('polifonia_user'));

    const buyer = document.getElementById('buyerName').value;
    const payment = document.querySelector('input[name="payment"]:checked');
    const totalDiscountRaw = document.getElementById('globalDiscount').value;
    const totalDiscount = parseFloat(totalDiscountRaw.replace(',', '.'));
    const totalRaw = document.getElementById('grand-total').innerText;
    const total = parseFloat(totalRaw.replace(',', '.'));

    if (cartItems.length === 0) return alert("Carrinho vazio!");
    if (!payment) return alert("Selecione o pagamento!");

    const novaVenda = {
        empresa_id: userData.empresa_id,
        comprador: buyer,
        vendedor: userData ? userData.user : 'Desconhecido',
        itens: cartItems,
        desconto_global: totalDiscount,
        pagamento: payment.value,
        total: total
    };

    try {
        const response = await fetch('http://localhost:3000/vendas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(novaVenda)
        });

        if (response.ok) {
            alert("Venda gravada no Banco de Dados!");
            showReceipt(buyer, payment.value, totalDiscount, total);
            renderHistory(); // Atualiza a lista vinda do banco
            renderCart();
        }
    } catch (error) {
        alert("Erro ao conectar com o servidor.");
    }
}

function resetFilters() {
    document.getElementById('filterName').value = "";
    
    // Ao limpar, voltamos para a data de hoje em vez de deixar vazio
    const hoje = new Date().toISOString().split('T')[0];
    document.getElementById('filterDate').value = hoje;
    
    renderHistory();
}

function clearHistory() {
    if(confirm("Deseja apagar todo o histórico de vendas?")) {
        salesHistory = [];
        localStorage.removeItem('polifonia_sales');
        renderHistory();
    }
}

// ... (Manter funções showReceipt, sendWhatsApp, closeModal, removeItem e resetFields) ...

function removeItem(id) {
    cartItems = cartItems.filter(item => item.id != id);
    renderCart();
}

function resetFields() {
    document.getElementById('product').value = "0";
    document.getElementById('price').value = "";
    document.getElementById('quantity').value = "1";
    document.getElementById('discount').value = "0";
    document.getElementById('globalDiscount').value = "0";
}

function showReceipt(buyer, payment, totalDiscount, total) {
    const details = document.getElementById('receipt-details');
    let itemsList = "";

    cartItems.forEach(item => {
        itemsList += `<div>${item.qty}x ${item.name} - R$ ${item.total.toFixed(2).replace('.', ',')}</div>`;
    });

    details.innerHTML = `
        <p><strong>Cliente:</strong> ${buyer}</p>
        <p><strong>Data:</strong> ${new Date().toLocaleDateString()}</p>
        <hr style="border: 0.5px dashed #ccc; margin: 10px 0;">
        ${itemsList}
        <hr style="border: 0.5px dashed #ccc; margin: 10px 0;">
        <p><strong>Pagamento:</strong> ${payment.toUpperCase()}</p>
        <p><strong>Desconto:</strong> R$ ${totalDiscount.toFixed(2).toString().replace('.', ',')}</strong></p>
        <p style="font-size: 1.2rem;"><strong>TOTAL: R$ ${total.toFixed(2).toString().replace('.', ',')}</strong></p>
    `;

    document.getElementById('receipt-modal').style.display = 'flex';
}

function sendWhatsApp() {
    const buyer = document.getElementById('buyerName').value;
    const total = document.getElementById('grand-total').innerText;
    const totalDiscountWhatsapp = document.getElementById('globalDiscount').value;
    let text = `*POLIFONIA - RECIBO DE VENDA*\n\n`;
    text += `*Cliente:* ${buyer}\n`;
    text += `*Data:* ${new Date().toLocaleDateString()}\n`;
    text += `---------------------------\n`;
    
    cartItems.forEach(item => {
        text += `${item.qty}x ${item.name} - R$ ${item.total.toFixed(2).replace('.', ',')}\n`;
    });
    
    text += `---------------------------\n`;
    text += `Desconto: R$ ${parseFloat(totalDiscountWhatsapp).toFixed(2).toString().replace('.', ',')}\n`;
    text += `*TOTAL: R$ ${total}*\n\n`;
    text += `Nos siga no Instagram: @polifonia.rio \n`;
    text += `https://www.instagram.com/polifonia.rio/ \n\n`;
    text += `Obrigado pela preferência!`;

    // Codifica o texto para URL
    const encodedText = encodeURIComponent(text);
    window.open(`https://wa.me/?text=${encodedText}`, '_blank');
}

function closeModal() {
    document.getElementById('receipt-modal').style.display = 'none';
    // Limpa o carrinho para a próxima venda
    cartItems = [];
    renderCart();
    resetFields();
    document.getElementById('buyerName').value = "Comprador";
}

// Variável global para guardar as vendas que vieram do banco
let currentSalesFromDB = [];

async function renderHistory() {

     // Carrega os dados do usuário no localStorage
    const userData = JSON.parse(localStorage.getItem('polifonia_user'));
    if (!userData || !userData.empresa_id) return;
    const empId = userData.empresa_id;

    const historyList = document.getElementById('sales-history-list');
    const filterName = document.getElementById('filterName').value.toLowerCase();
    const filterDate = document.getElementById('filterDate').value;
    
    // Elementos do resumo
    const summaryCount = document.getElementById('summary-count');
    const summaryTotal = document.getElementById('summary-total');

    try {
        // 1. Busca os dados do seu servidor Node.js
        const response = await fetch(`http://localhost:3000/vendas?empresa_id=${empId}`);
        if (!response.ok) throw new Error('Falha ao buscar dados do servidor');
        
        // 2. Transforma a resposta em JSON e guarda na nossa "memória global"
        currentSalesFromDB = await response.json();

        // 3. Limpa a lista visual antes de preencher
        historyList.innerHTML = "";

        // 4. Aplica os filtros (igual fazíamos antes, mas agora nos dados do banco)
        const filteredSales = currentSalesFromDB.filter(sale => {
            const matchesName = sale.comprador.toLowerCase().includes(filterName);
            // No MySQL, a data vem completa, pegamos apenas a parte YYYY-MM-DD para comparar
            const saleDateOnly = sale.data_venda.split('T')[0]; 
            const matchesDate = filterDate === "" || saleDateOnly === filterDate;
            return matchesName && matchesDate;
        });

        // 5. Cálculos para o Resumo
        let totalAcumulado = 0;
        filteredSales.forEach(sale => {
            totalAcumulado += parseFloat(sale.total);
        });

        summaryCount.innerText = filteredSales.length;
        summaryTotal.innerText = `R$ ${totalAcumulado.toFixed(2).replace('.', ',')}`;

        // 6. Se não houver vendas, mostra aviso
        if (filteredSales.length === 0) {
            historyList.innerHTML = "<p style='color:#8b949e; text-align:center;'>Nenhum registo encontrado.</p>";
            return;
        }

        // 7. Renderiza cada venda na tela
        filteredSales.forEach(sale => {
            // Formatamos a data para ficar bonita (DD/MM/AAAA HH:MM)
            const dataFormatada = new Date(sale.data_venda).toLocaleString();

            historyList.innerHTML += `
                <div class="sale-card">
                    <p><small>${dataFormatada}</small></p>
                    <p><strong>Cliente:</strong> ${sale.comprador}</p>
                    <p><strong>Itens:</strong> ${sale.itens.map(({name, qty}) => `${qty} x ${name}` ).join(', ')}</p>
                    <p class="sale-total">Total: R$ ${parseFloat(sale.total).toFixed(2).replace('.', ',')} (${sale.pagamento})</p>
                    <div class="sale-actions">
                        <button class="btn-edit" onclick="openEditModal(${sale.id})">✎ Editar</button>
                        <button class="btn-remove" onclick="removeSale(${sale.id})">✕ Remover</button>
                    </div>
                </div>
            `;
        });

        // 8. Atualiza os gráficos com os novos dados
        renderAnalytics();

    } catch (error) {
        console.error("Erro ao renderizar histórico:", error);
        historyList.innerHTML = "<p style='color:red;'>Erro ao carregar dados do servidor. Verifique se o server.js está rodando.</p>";
    }
}

// 2. Função para abrir o modal de edição carregando os dados

function openEditModal(id) {
    // Procuramos a venda dentro da nossa lista salva na memória
    const sale = currentSalesFromDB.find(s => s.id === id);
    if (!sale) return;

    document.getElementById('edit-sale-id').value = id;
    document.getElementById('edit-buyer-name').value = sale.comprador;
    // No MySQL o total vem como número, não precisamos de replace aqui se configurado como DECIMAL
    document.getElementById('edit-total-value').value = sale.total;

    document.getElementById('edit-modal').style.display = 'flex';
}

// 3. Função para salvar as alterações

async function saveEdit() {
    const id = document.getElementById('edit-sale-id').value;
    const newName = document.getElementById('edit-buyer-name').value;
    const newTotal = parseFloat(document.getElementById('edit-total-value').value);

    if (!newName || isNaN(newTotal)) return alert("Dados inválidos!");

    const dadosAtualizados = {
        comprador: newName,
        total: newTotal
    };

    try {
        const response = await fetch(`http://localhost:3000/vendas/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dadosAtualizados)
        });

        if (response.ok) {
            alert("Venda atualizada no Banco de Dados!");
            closeEditModal();
            renderHistory(); // Recarrega a lista e os gráficos
        }
    } catch (error) {
        alert("Erro ao atualizar a venda.");
    }
}

function closeEditModal() {
    document.getElementById('edit-modal').style.display = 'none';
}

// 4. Função para Excluir uma venda

async function removeSale(id) {
    if (!confirm("Tem certeza que deseja apagar esta venda do banco de dados?")) return;

    try {
        const response = await fetch(`http://localhost:3000/vendas/${id}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            alert("Venda removida com sucesso!");
            renderHistory(); // Recarrega a lista do banco
        }
    } catch (error) {
        alert("Erro ao tentar remover a venda.");
    }
}


async function exportToCSV() {
     // Carrega os dados do usuário no localStorage
     const userData = JSON.parse(localStorage.getItem('polifonia_user'));
     if (!userData || !userData.empresa_id) return;
     const empId = userData.empresa_id;
     try {
        // Capturando o conteúdo dos campos filtros
        const filterName = document.getElementById('filterName').value.toLowerCase();
        const filterDate = document.getElementById('filterDate').value;

        // Necessário somar 1 dia ao filterDate para compor nome do arquivo .csv
        const dataFilter = new Date(filterDate);
        dataFilter.setDate(dataFilter.getDate() + 1);

        // 1. Busca os dados do seu servidor Node.js
        const response = await fetch(`http://localhost:3000/vendas?empresa_id=${empId}`);
        if (!response.ok) throw new Error('Falha ao buscar dados do servidor');
        
        // 2. Transforma a resposta em JSON e guarda na nossa "memória global"
        currentSalesFromDB = await response.json();

        if (currentSalesFromDB.length === 0) return alert("Não há dados para exportar.");

            // Aplica os filtros (agora nos dados do banco)
            const filteredSales = currentSalesFromDB.filter(sale => {
                const matchesName = sale.comprador.toLowerCase().includes(filterName);

                // No MySQL, a data vem completa, pegamos apenas a parte YYYY-MM-DD para comparar
                const saleDateOnly = sale.data_venda.split('T')[0]; 
                const matchesDate = filterDate === "" || saleDateOnly === filterDate;
                return matchesName && matchesDate;
            });

        
        // Cabeçalho do arquivo
        let csvContent = "data:text/csv;charset=utf-8,";

        // Adicionar o BOM UTF-8 (\uFEFF) para forçar o Excel a reconhecer UTF-8
        csvContent += "\uFEFF"; 

        csvContent += "Data;Cliente;Itens;Pagamento;Total\n";

         // Linhas de dados
        filteredSales.forEach(sale => {
            const dataFormatada = new Date(sale.data_venda).toLocaleString();
            const itensString = sale.itens.map(({name, qty}) => `${qty} x ${name}` ).join(' | ');
            const row = `${dataFormatada};${sale.comprador};${itensString};${sale.pagamento};${sale.total.replace('.', ',')}`;
            csvContent += row + "\n";
        });

        // Criar link invisível para download
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `Relatorio_Vendas_Polifonia_${new Date(dataFilter).toLocaleDateString()}.csv`);
        document.body.appendChild(link);

        link.click(); // Dispara o download
        document.body.removeChild(link);
       
    } catch (e) { console.error("Erro ao carregar produtos:", e); }
}

// Variáveis para guardar as instâncias dos gráficos
let todayChartInstance = null;
let periodChartInstance = null;

// Chamar esta função sempre que uma venda for concluída ou o histórico mudar
function renderAnalytics() {
    renderTodayChart();
    renderPeriodChart();
}

// 1. Gráfico de Vendas por Hora (Hoje)
function renderTodayChart() {
    const ctx = document.getElementById('todayChart').getContext('2d');
    
    // Pegamos a data de hoje no formato YYYY-MM-DD
    const hoje = new Date().toISOString().split('T')[0];
    
    const hoursData = Array(24).fill(0);
    const labels = Array.from({length: 24}, (_, i) => `${i}h`);

    // Mudança importante: Usamos currentSalesFromDB e campos do SQL
    currentSalesFromDB.forEach(sale => {
        const saleDate = sale.data_venda.split('T')[0]; // Extrai YYYY-MM-DD
        
        if (saleDate === hoje) {
            // O MySQL devolve a hora no formato ISO. Vamos extrair a hora local:
            const hora = new Date(sale.data_venda).getHours();
            hoursData[hora] += parseFloat(sale.total);
        }
    });

    if (todayChartInstance) todayChartInstance.destroy();

    todayChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Total Vendido (R$)',
                data: hoursData,
                borderColor: '#8b1a1a', // Vermelho Polifonia
                backgroundColor: 'rgba(139, 26, 26, 0.2)',
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            scales: { y: { beginAtZero: true } }
        }
    });
}

// 2. Gráfico de Vendas por Período
function renderPeriodChart() {
    const ctx = document.getElementById('periodChart').getContext('2d');
    const start = document.getElementById('chartStart').value;
    const end = document.getElementById('chartEnd').value;

    const totalsByDate = {};

    // Filtramos os dados da nossa variável global que veio do Banco
    currentSalesFromDB.forEach(sale => {
        const saleDate = sale.data_venda.split('T')[0]; // Formato YYYY-MM-DD

        // Verifica se está dentro do intervalo escolhido pelo usuário
        const isWithinRange = (!start || saleDate >= start) && (!end || saleDate <= end);

        if (isWithinRange) {
            totalsByDate[saleDate] = (totalsByDate[saleDate] || 0) + parseFloat(sale.total);
        }
    });

    // Ordenar as datas para o gráfico não ficar bagunçado
    const labels = Object.keys(totalsByDate).sort();
    const dataValues = labels.map(date => totalsByDate[date]);

    if (periodChartInstance) periodChartInstance.destroy();

    periodChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels.map(d => d.split('-').reverse().slice(0, 2).join('/')), // Formata para DD/MM
            datasets: [{
                label: 'Faturamento Diário',
                data: dataValues,
                backgroundColor: '#1f6feb' // Azul para contraste
            }]
        },
        options: {
            responsive: true,
            scales: { y: { beginAtZero: true } }
        }
    });
}

// Atualizar o window.onload para incluir a data default e os analytics
window.onload = () => {
    carregarSessaoUsuario();
    carregarProdutosDoBanco();
    
    // 🛡️ Define a data de hoje como padrão no filtro
    const hoje = new Date().toISOString().split('T')[0];
    const campoData = document.getElementById('filterDate');
    if (campoData) campoData.value = hoje;

    renderHistory();
    renderAnalytics();
};

