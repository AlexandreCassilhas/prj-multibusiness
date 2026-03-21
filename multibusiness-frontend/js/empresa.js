let todasEmpresas = [];

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
    document.getElementById('modalTitle').innerText = "Cadastrar Nova Empresa";
    document.getElementById('modal-empresa').style.display = 'flex';
}

function editEmpresa(id) {
    const emp = todasEmpresas.find(e => e.id === id);
    if (!emp) return;

    document.getElementById('empresaId').value = emp.id;
    document.getElementById('empCNPJ').value = emp.cnpj;
    document.getElementById('empRazao').value = emp.razao_social;
    document.getElementById('empFantasia').value = emp.nome_fantasia;
    
    if (emp.foto_logo) {
        const preview = document.getElementById('logoPreview');
        preview.src = emp.foto_logo;
        preview.style.display = 'block';
    }

    document.getElementById('modalTitle').innerText = "Editar Empresa";
    document.getElementById('modal-empresa').style.display = 'flex';
}

document.getElementById('formEmpresa').onsubmit = async (e) => {
    e.preventDefault();
    
    const id = document.getElementById('empresaId').value;
    const payload = {
        cnpj: document.getElementById('empCNPJ').value,
        razao_social: document.getElementById('empRazao').value,
        nome_fantasia: document.getElementById('empFantasia').value,
        foto_logo: document.getElementById('logoPreview').src // Pega o Base64 do preview
    };

    const method = id ? 'PUT' : 'POST';
    const url = id ? `http://localhost:3000/empresas/${id}` : 'http://localhost:3000/empresas';

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
};

function closeModal(id) { document.getElementById(id).style.display = 'none'; }

async function softDeleteEmpresa(id, nome) {
    if (!confirm(`Deseja remover a empresa "${nome}"?\nTodos os dados vinculados serão mantidos, mas a empresa não aparecerá mais.`)) return;
    await fetch(`http://localhost:3000/empresas/${id}`, { method: 'DELETE' });
    loadEmpresas();
}