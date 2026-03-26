
// --- VARIÁVEIS GLOBAIS ---
let todasEmpresas = [];
let fotoBase64 = ""; // Variável para manter a foto atual durante a edição

document.addEventListener('DOMContentLoaded', () => {
    // 🛡️ Proteção extra: verifica se é Super Admin antes de carregar
    const userData = JSON.parse(localStorage.getItem('polifonia_user'));
    if (!userData || !userData.perfis.includes('Administrador Empresas')) {
        window.location.href = 'dashboard.html';
        return;
    }

    document.getElementById('logo-display').src = userData.foto_logo;
    document.getElementById('welcomeMsg').innerText = `Olá, ${userData.user}`;

    loadEmpresas();
});

// --- LISTAGEM DE EMPRESAS ---
async function loadEmpresas() {
    try {
        const res = await fetch('http://localhost:3000/empresas');
        todasEmpresas = await res.json();
        renderEmpresas();
    } catch (e) { console.error("Erro ao carregar empresas:", e); }
}

function renderEmpresas() {
    const tbody = document.getElementById('empresas-body');
    tbody.innerHTML = todasEmpresas.map(emp => `
        <tr>
            <td>
                ${emp.foto_logo ? `<img src="${emp.foto_logo}" style="height: 40px; border-radius: 4px;">` : '<span>Sem Logo</span>'}
            </td>
            <td>${emp.cnpj}</td>
            <td><strong>${emp.nome_fantasia}</strong><br><small>${emp.razao_social}</small></td>
            <td>
                <button class="btn-edit" onclick="editEmpresa(${emp.id})">✎</button>
                <button class="btn-delete" onclick="softDeleteEmpresa(${emp.id}, '${emp.nome_fantasia}')">✕</button>
            </td>
        </tr>
    `).join('');
}

// --- GESTÃO DO LOGO (BASE64) ---
function processarImagemLogo(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        const tipoOriginal = file.type; // Detecta se é image/png, image/jpeg, etc.

        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 400;
                
                // Calcula a proporção
                const scaleSize = MAX_WIDTH / img.width;
                canvas.width = MAX_WIDTH;
                canvas.height = img.height * scaleSize;

                const ctx = canvas.getContext('2d');

                // Importante: Limpa o canvas para garantir que a transparência seja preservada
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                // Lógica de Saída:
                if (tipoOriginal === 'image/png') {
                    // Se for PNG, exportamos como PNG para manter o fundo transparente.
                    // O redimensionamento para 400px já reduzirá o tamanho do arquivo drasticamente.
                    resolve(canvas.toDataURL('image/png'));
                } else {
                    // Se for JPG ou outros, mantemos a compressão de 0.7 para economizar espaço no banco.
                    resolve(canvas.toDataURL('image/jpeg', 0.7));
                }
            };
        };
    });
}


function previewLogo(input) {
    const preview = document.getElementById('logoPreview');
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = (e) => {
            preview.src = e.target.result;
            preview.style.display = 'block';
        };
        reader.readAsDataURL(input.files[0]);
    }
}

// --- MODAL E SALVAMENTO ---
function openEmpresaModal() {
    document.getElementById('formEmpresa').reset();
    document.getElementById('empresaId').value = "";
    document.getElementById('logoPreview').style.display = 'none';
    // Além de esconder, limpamos o SRC para não enviar lixo no novo cadastro
    document.getElementById('logoPreview').src = "";
    fotoBase64 = ""; // Reseta para novo cadastro
    document.getElementById('modalTitle').innerText = "Cadastrar Nova Empresa";
    document.getElementById('modal-empresa').style.display = 'flex';
}

// --- MODAL DE EDIÇÃO  ---
function editEmpresa(id) {
    const emp = todasEmpresas.find(e => e.id === id);
    if (!emp) return;

    // 1. Preenche os campos de texto (Garantindo que não fiquem 'undefined')
    document.getElementById('empresaId').value = emp.id;
    document.getElementById('empCNPJ').value = emp.cnpj;
    document.getElementById('empURL').value = emp.url_homepage || "";
    document.getElementById('empRazao').value = emp.razao_social;
    document.getElementById('empFantasia').value = emp.nome_fantasia;
    document.getElementById('empCEP').value = emp.cep || "";
    document.getElementById('empLogradouro').value = emp.logradouro || "";
    document.getElementById('empBairro').value = emp.bairro || "";
    document.getElementById('empCidade').value = emp.cidade || "";
    document.getElementById('empComplemento').value = emp.complemento_endereco || "";
    
    // 2. CORREÇÃO DO ERRO: Definir o elemento de preview
    const previewElement = document.getElementById('logoPreview'); 

    if (emp.foto_logo && emp.foto_logo.startsWith('data:image')) {
        fotoBase64 = emp.foto_logo; // Armazena a foto existente
        previewElement.src = emp.foto_logo;
        previewElement.style.display = 'block';
    } else {
        fotoBase64 = ""; // Limpa se não houver foto
        previewElement.src = "";
        previewElement.style.display = 'none';
    }

    // 3. Limpar o input de arquivo (para garantir que não haja arquivos pendentes de outra ação)
    document.getElementById('logoInput').value = "";

    document.getElementById('modalTitle').innerText = "Editar Empresa";
    document.getElementById('modal-empresa').style.display = 'flex';
}

// --- ATUALIZAÇÃO DO ONSUBMIT (Carga de Dados) ---
document.getElementById('formEmpresa').onsubmit = async (e) => {
    e.preventDefault();
    
    const id = document.getElementById('empresaId').value;

    // No seu evento de salvar empresa, use assim:
    const fileInput = document.getElementById('logoInput'); // Pega o Base64 do preview

    // LÓGICA DE FOTO À PROVA DE FALHAS:
    // 1. Se o usuário escolheu um NOVO arquivo, ele tem prioridade total
    if (fileInput.files && fileInput.files.length > 0) {
        fotoBase64 = await processarImagemLogo(fileInput.files[0]);
    } 

     // 2. Se não escolheu novo, a variável 'fotoBase64' já contém a foto antiga (vinda do editEmpresa)
    // 3. Se ambos estiverem vazios, fotoBase64 será "" (o que está correto)

    // Payload com todos os novos campos
    const payload = {
        cnpj: document.getElementById('empCNPJ').value,
        url_homepage: document.getElementById('empURL').value,
        razao_social: document.getElementById('empRazao').value,
        nome_fantasia: document.getElementById('empFantasia').value,
        cep: document.getElementById('empCEP').value,
        logradouro: document.getElementById('empLogradouro').value,
        bairro: document.getElementById('empBairro').value,
        cidade: document.getElementById('empCidade').value,
        complemento_endereco: document.getElementById('empComplemento').value,
        foto_logo: fotoBase64 // Usamos a variável global aqui
    };

    const method = id ? 'PUT' : 'POST';
    const url = id ? `http://localhost:3000/empresas/${id}` : 'http://localhost:3000/empresas';

    try {
            const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            closeModal('modal-empresa');
            loadEmpresas();
        } else {
            const data = await res.json();
            alert("Erro: " + (data.message || "Falha na operação"));
        }
    } catch (err) {
        console.error("Erro na requisição:", err);
        alert("Erro de conexão com o servidor. Verifique o tamanho da imagem.");
    }
};

function closeModal(id) { document.getElementById(id).style.display = 'none'; }

async function softDeleteEmpresa(id, nome) {
    if (!confirm(`Deseja remover a empresa "${nome}"?\nTodos os dados vinculados serão mantidos, mas a empresa não aparecerá mais.`)) return;
    await fetch(`http://localhost:3000/empresas/${id}`, { method: 'DELETE' });
    loadEmpresas();
}

// --- BUSCA CEP VIA API (ViaCEP) ---
async function buscarCep(valor) {
    const cep = valor.replace(/\D/g, '');
    if (cep.length !== 8) return;

    // Feedback visual
    document.getElementById('empLogradouro').placeholder = "Buscando...";

    try {
        const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await response.json();

        if (!data.erro) {
            document.getElementById('empLogradouro').value = data.logradouro;
            document.getElementById('empBairro').value = data.bairro;
            document.getElementById('empCidade').value = data.localidade;
            document.getElementById('empComplemento').focus();
        } else {
            alert("CEP não encontrado.");
        }
    } catch (e) {
        console.error("Erro ao buscar CEP:", e);
    }
}