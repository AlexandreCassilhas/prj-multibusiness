let currentSlot = 0;
let imagesBuffer = [null, null, null, null]; // Guarda as 4 imagens em Base64
let allProducts = [];

document.addEventListener('DOMContentLoaded', () => {
    // Carregar Perfil
    const userData = JSON.parse(localStorage.getItem('polifonia_user'));
    if (userData) document.getElementById('userNameDisplay').innerText = userData.user;
    
    loadProducts();
});

// --- NAVEGAÇÃO DE ABAS ---
function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    
    document.getElementById(`tab-${tabName}`).classList.add('active');
    // Adiciona classe active no botão clicado (lógica simplificada)
    event.target.classList.add('active');
}

// --- GESTÃO DE PRODUTOS ---
async function loadProducts() {
    try {
        const res = await fetch('http://localhost:3000/produtos');
        allProducts = await res.json();
        renderProductsTable();
        populateSelect();
    } catch (e) { console.error(e); }
}


// --- FUNÇÕES DE EDIÇÃO ---

// 1. Alterar a geração da tabela para incluir o botão de Editar
function renderProductsTable() {
    const tbody = document.getElementById('products-body');
    tbody.innerHTML = "";

    allProducts.forEach(p => {
        // ... (código anterior de classes e badges) ...
        const stockClass = p.estoque_atual <= p.estoque_minimo ? 'stock-low' : '';
        const stockIcon = p.estoque_atual <= p.estoque_minimo ? '⚠️ ' : '';
        const abcClass = p.classificacao_abc === 'A' ? 'badge-a' : (p.classificacao_abc === 'B' ? 'badge-b' : 'badge-c');
        
        // Tratamento de Imagens
        let imagens = [];
        try { imagens = p.imagens ? JSON.parse(p.imagens) : []; } catch(e) {}
        if (typeof imagens === 'string') imagens = JSON.parse(imagens); // Garantia extra
        const mainImg = imagens.length > 0 ? imagens[0] : 'https://via.placeholder.com/40';

        tbody.innerHTML += `
            <tr>
                <td><img src="${mainImg}" style="width: 40px; height: 40px; border-radius: 4px; object-fit: cover;"></td>
                <td>
                    ${p.nome}<br>
                    <small style="color: #8b949e;">${p.codigo_barras || ''}</small>
                </td>
                <td>R$ ${parseFloat(p.preco_venda).toFixed(2)}</td>
                <td>R$ ${parseFloat(p.custo_cpv).toFixed(2)}</td>
                <td class="${stockClass}">${stockIcon}${p.estoque_atual}</td>
                <td><span class="badge ${abcClass}">${p.classificacao_abc}</span></td>
                <td>
                    <button class="btn-edit" onclick="openEditProduct(${p.id})" title="Editar">✎</button>
                    
                    <button class="btn-delete" onclick="softDeleteProduct(${p.id}, '${p.nome}')" title="Excluir">
                       ✖
                    </button>
                </td>
            </tr>
        `;
    });
}

// 2. Abrir Modal PREENCHIDO (Modo Edição)
function openEditProduct(id) {
    const produto = allProducts.find(p => p.id === id);
    if (!produto) return;

    // Preenche campos de texto
    document.getElementById('prodId').value = produto.id; // Guarda o ID
    document.getElementById('prodName').value = produto.nome;
    document.getElementById('prodDesc').value = produto.descricao || "";
    document.getElementById('prodPrice').value = produto.preco_venda;
    document.getElementById('prodCost').value = produto.custo_cpv;
    document.getElementById('prodMinStock').value = produto.estoque_minimo;
    
    // Tratamento especial para o Código de Barras (se você tiver esse campo no HTML, adicione o ID dele)
    // document.getElementById('prodCode').value = produto.codigo_barras || "";

    // Preenche as Imagens
    imagesBuffer = [null, null, null, null]; // Limpa buffer
    resetImageSlots(); // Limpa visual

    let imagens = [];
    try { imagens = produto.imagens ? JSON.parse(produto.imagens) : []; } catch(e) {}
    if (typeof imagens === 'string') imagens = JSON.parse(imagens);

    // Carrega as imagens existentes nos slots visuais
    imagens.forEach((imgBase64, index) => {
        if (index < 4) {
            imagesBuffer[index] = imgBase64;
            document.getElementById(`img-${index}`).src = imgBase64;
            document.getElementById(`img-${index}`).style.display = 'block';
            document.getElementById(`span-${index}`).style.display = 'none';
        }
    });

    document.getElementById('product-modal').style.display = 'flex';
}

// 3. Função Unificada: Salvar (Novo ou Edição)
async function saveProduct() {
    const id = document.getElementById('prodId').value; // Verifica se tem ID
    
// No estoque.js, dentro de saveProduct()
    const payload = {
        nome: document.getElementById('prodName').value,
        descricao: document.getElementById('prodDesc').value,
        preco: document.getElementById('prodPrice').value,
        custo: document.getElementById('prodCost').value,
        estoque_min: document.getElementById('prodMinStock').value,
        imagens: imagesBuffer.filter(img => img !== null),
        codigo: document.getElementById('prodCode') ? document.getElementById('prodCode').value : ""
    };

    if(!payload.nome || !payload.preco) return alert("Preencha nome e preço!");

    let url = 'http://localhost:3000/produtos';
    let method = 'POST';

    // SE TEM ID, É EDIÇÃO (PUT)
    if (id) {
        url = `http://localhost:3000/produtos/${id}`;
        method = 'PUT';
    }

    const res = await fetch(url, {
        method: method, 
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
    });

    if(res.ok) {
        alert(id ? "Produto Atualizado!" : "Produto Cadastrado!");
        closeProductModal();
        loadProducts();
    } else {
        alert("Erro ao salvar produto.");
    }
}

// 4. Resetar o Modal ao abrir para criar NOVO
function openProductModal() {
    document.getElementById('product-modal').style.display = 'flex';
    document.getElementById('prodId').value = ""; // Limpa o ID
    
    // Limpa os campos de texto
    document.getElementById('prodName').value = "";
    document.getElementById('prodDesc').value = "";
    document.getElementById('prodPrice').value = "";
    document.getElementById('prodCost').value = "";
    document.getElementById('prodMinStock').value = "5";

    imagesBuffer = [null, null, null, null];
    resetImageSlots();
}

function populateSelect() {
    const select = document.getElementById('entryProductSelect');
    select.innerHTML = '<option value="">Selecione...</option>';
    allProducts.forEach(p => {
        select.innerHTML += `<option value="${p.id}">${p.nome} (Atual: ${p.estoque_atual})</option>`;
    });
}

function closeProductModal() {
    document.getElementById('product-modal').style.display = 'none';
}

// Lógica de Imagens (4 Slots)
function triggerFile(slotIndex) {
    currentSlot = slotIndex;
    document.getElementById('fileInput').click();
}

function handleFileSelect(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        imagesBuffer[currentSlot] = e.target.result;
        // Atualiza visual
        document.getElementById(`img-${currentSlot}`).src = e.target.result;
        document.getElementById(`img-${currentSlot}`).style.display = 'block';
        document.getElementById(`span-${currentSlot}`).style.display = 'none';
    };
    reader.readAsDataURL(file);
    input.value = ""; // Reset input
}

function resetImageSlots() {
    for(let i=0; i<4; i++) {
        document.getElementById(`img-${i}`).style.display = 'none';
        document.getElementById(`span-${i}`).style.display = 'block';
    }
}

// --- ENTRADA DE ESTOQUE ---
async function saveStockEntry() {
    const produtoId = document.getElementById('entryProductSelect').value;
    const qtd = document.getElementById('entryQty').value;
    const custo = document.getElementById('entryCost').value;

    if(!produtoId || !qtd) return alert("Selecione produto e quantidade.");

    const payload = {
        produto_id: produtoId,
        quantidade: parseInt(qtd),
        novo_custo: custo ? parseFloat(custo) : null
    };

    const res = await fetch('http://localhost:3000/estoque/entrada', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
    });

    if(res.ok) {
        alert("Estoque Atualizado!");
        document.getElementById('entryQty').value = "";
        loadProducts(); // Atualiza a tabela
    } else {
        alert("Erro ao atualizar estoque.");
    }
}

// --- CÁLCULO ABC ---
async function calculateABC() {
    const start = document.getElementById('abcStart').value;
    const end = document.getElementById('abcEnd').value;

    if(!start || !end) return alert("Selecione o período.");

    const res = await fetch('http://localhost:3000/estoque/calcular-abc', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ dataInicio: start, dataFim: end })
    });

    const data = await res.json();
    const totalFormatado = (data.total || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    document.getElementById('abc-result-msg').innerText = `${data.message} Total analisado: ${totalFormatado}`;
    loadProducts(); // Recarrega para mostrar os novos badges A, B, C
}

// -- Função para "deletar" o produto (atualiza a coluna "indicativo-exclusao" para TRUE)
async function softDeleteProduct(id, nome) {
    // Verificação de Segurança Visual
    if (!confirm(`ATENÇÃO: Deseja remover o produto "${nome}" do catálogo?\n\nO histórico de vendas será preservado, mas ele não aparecerá mais para novas vendas.`)) {
        return;
    }

    try {
        const res = await fetch(`http://localhost:3000/produtos/${id}`, {
            method: 'DELETE' // Chama a nossa rota de Soft Delete
        });

        if (res.ok) {
            alert("Produto removido do catálogo!");
            loadProducts(); // Recarrega a lista (o produto vai sumir pois o indicativo agora é True)
        } else {
            alert("Erro ao excluir produto.");
        }
    } catch (e) {
        console.error(e);
        alert("Erro de conexão.");
    }
}
