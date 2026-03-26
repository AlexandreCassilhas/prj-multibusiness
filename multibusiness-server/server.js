const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcrypt');
const svgCaptcha = require('svg-captcha');

const app = express();
const saltRounds = 10;
let sessionCaptcha = ""; // Variável global para validar o captcha

app.use(express.json({ limit: '10mb' }));
app.use(cors());

/* BLOCO TEMPORÁRIO PARA GERAR O HASH CORRETO
bcrypt.hash("Polifonia@2026", 10).then(hash => {
    console.log("-----------------------------------------");
    console.log("HASH OFICIAL PARA 'Polifonia@2026':");
    console.log(hash);
    console.log("-----------------------------------------");
});
*/

// 1. Conexão com o Banco de Dados
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'multibusiness_db'
});

// Conectar ao MySQL
db.connect(err => {
    if (err) {
        console.error('Erro ao conectar ao MySQL:', err);
        return;
    }
    console.log('Conectado ao banco de dados MySQL da Multibusiness!');
});

// --- ROTAS DE SEGURANÇA ---

// Rota do CAPTCHA (Onde estava a dar o erro 404)
app.get('/captcha', (req, res) => {
    const captcha = svgCaptcha.create({ 
        size: 4, 
        noise: 3, 
        color: true,
        background: '#ffffff' 
    });
    sessionCaptcha = captcha.text.toLowerCase();
    res.type('svg');
    res.status(200).send(captcha.data);
});

// Rota para criar o Admin Inicial (Use uma vez para testar)
app.post('/setup-admin', async (req, res) => {
    try {
        const hash = await bcrypt.hash('123456', saltRounds);
        const sql = "INSERT INTO usuarios (nome, login, senha) VALUES ('Admin Polifonia', 'admin', ?)";
        db.query(sql, [hash], (err, result) => {
            if (err) return res.status(500).send(err);
            
            const userId = result.insertId;
            const sqlPerfil = "INSERT INTO usuario_perfis (usuario_id, perfil_id) VALUES (?, 1)";
            db.query(sqlPerfil, [userId], (err2) => {
                if (err2) return res.status(500).send(err2);
                res.send({ message: "Admin criado com sucesso!" });
            });
        });
    } catch (e) { res.status(500).send(e); }
});


app.post('/login', (req, res) => {
    const { login, senha, captcha } = req.body;

    // 1. Validar Captcha primeiro (evita consultar o banco à toa)
    if (!captcha || captcha.toLowerCase() !== sessionCaptcha) {
        return res.status(401).send({ message: "Captcha incorreto!" });
    }

    // 2. Buscar usuário considerando a exclusão lógica
    const sql = `
        SELECT u.*, p.nome_perfil, e.foto_logo, e.nome_fantasia, e.cnpj 
        FROM usuarios u
        JOIN usuario_perfis up ON u.id = up.usuario_id
        JOIN perfis p ON p.id = up.perfil_id
        LEFT JOIN empresas e ON e.id = u.empresa_id
        WHERE u.cpf = ? AND u.indicativo_exclusao = FALSE`;

    db.query(sql, [login], async (err, results) => {
        if (err) return res.status(500).send({ message: "Erro no banco de dados." });

        // 3. SE NÃO ENCONTRAR O USUÁRIO (Blindagem contra o 500)
        if (results.length === 0) {
            return res.status(401).send({ message: "Utilizador ou senha incorretos." });
        }

        const usuario = results[0];

        // 4. Verificar Senha
        const match = await bcrypt.compare(senha, usuario.senha);
        if (match) {
            // Sucesso! Retornamos os dados necessários para o frontend
            res.send({
                user: usuario.nome,
                foto: usuario.foto_perfil,
                empresa_id: usuario.empresa_id,
                foto_logo: usuario.foto_logo,
                nome_fantasia: usuario.nome_fantasia,
                cnpj: usuario.cnpj,
                perfis: results.map(r => r.nome_perfil) // Pega todos os perfis se houver mais de um
                
            });
        } else {
            res.status(401).send({ message: "Utilizador ou senha incorretos." });
        }
    });
});

// --- GESTÃO DE EQUIPE (ADMIN) ---

// --- FUNÇÃO DE VALIDAÇÃO DE SENHA FORTE ---
function eSenhaForte(senha) {
    // Mínimo 8 caracteres, pelo menos uma maiúscula, uma minúscula, um número e um símbolo
    const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]{8,}$/;
    return regex.test(senha);
}

// --- 1. LISTAR PERFIS (Dinâmico e Hierárquico) ---
app.get('/perfis', (req, res) => {
    const { isSuperAdmin } = req.query;
    // Se NÃO for Super Admin, filtramos para não exibir o perfil de "Administrador Empresas"
    let sql = "SELECT * FROM perfis";
    if (isSuperAdmin !== 'true') {
        sql += " WHERE nome_perfil != 'Administrador Empresas'";
    }
    
    db.query(sql, (err, results) => {
        if (err) return res.status(500).send(err);
        res.send(results);
    });
});

// 1. Rota de CADASTRO DE USUÁRIOS (COM AUDITORIA) ---
app.post('/usuarios', async (req, res) => {
    const { nome, email, celular, cpf, senha, foto, perfil_id, solicitantePerfis, empresa_id } = req.body;

    // Verificação de segurança: apenas Admins cadastram
    if (!solicitantePerfis || (!solicitantePerfis.includes('Administrador') && !solicitantePerfis.includes('Administrador Empresas'))) {
        return res.status(403).send({ message: "Acesso negado. Apenas administradores podem criar utilizadores." });
    }

    // Se o empresa_id não vier (por erro no front), não podemos deixar salvar
    if (!empresa_id) {
        return res.status(400).send({ message: "A empresa deve ser informada." });
    }

    // Chama o validador de senha
    if (!eSenhaForte(senha)) {
        return res.status(400).send({ message: "A senha não atende aos requisitos de segurança." });
    }

    try {
        const hash = await bcrypt.hash(senha, saltRounds);
        
        // Inserção do Utilizador (created_at e updated_at são automáticos no MySQL)
        const sqlUser = "INSERT INTO usuarios (nome, email, celular, cpf, senha, foto_perfil, empresa_id) VALUES (?, ?, ?, ?, ?, ?, ?)";
        
        db.query(sqlUser, [nome, email, celular, cpf, hash, foto, empresa_id], (err, result) => {
            if (err) {
                if (err.code === 'ER_DUP_ENTRY') return res.status(400).send({ message: "Este CPF já está cadastrado!" });
                return res.status(500).send(err);
            }

            const userId = result.insertId;
            const sqlPerfil = "INSERT INTO usuario_perfis (usuario_id, perfil_id) VALUES (?, ?)";
            
            db.query(sqlPerfil, [userId, perfil_id], (err2) => {
                if (err2) return res.status(500).send(err2);
                res.send({ message: "Usuário criado com sucesso!" });
            });
        });
    } catch (e) { res.status(500).send(e); }
});

// 2. Listar Usuários Ativos
app.get('/usuarios', (req, res) => {

    const { empresa_id, isSuperAdmin } = req.query; // Recebe o ID via URL: ?empresa_id=1

    // Se for Super Admin, não filtramos por empresa_id (vê tudo)
    // Se for Admin comum, filtramos apenas pela empresa dele
    let query = `
        SELECT  u.*, 
                p.nome_perfil, p.id as perfil_id, 
                e.nome_fantasia as empresa_nome
        FROM usuarios u
        JOIN usuario_perfis up ON u.id = up.usuario_id
        JOIN perfis p ON p.id = up.perfil_id
        LEFT JOIN empresas e ON e.id = u.empresa_id
        WHERE u.indicativo_exclusao = FALSE`;
    
    const params = [];

     if (isSuperAdmin !== 'true') {
        query += " AND u.empresa_id = ?";
        params.push(empresa_id);
    }

    query += " ORDER BY u.nome ASC"


    db.query(query, params, (err, results) => {
        if (err) return res.status(500).send(err);
        res.send(results);
    });
});

// 3. Atualizar Usuário (PUT)
app.put('/usuarios/:id', async (req, res) => {
    const { id } = req.params;
    const { nome, email, celular, cpf, senha, foto, perfil_id, empresa_id } = req.body;

    // Se a senha foi enviada para alteração, validamos
    if (senha && !eSenhaForte(senha)) {
        return res.status(400).send({ message: "A nova senha é muito fraca." });
    }

    try {
        // Se a senha foi enviada, gera novo hash, senão mantém a antiga
        let sqlUser;
        let paramsUser;

        if (senha && senha.trim() !== "") {
            const hash = await bcrypt.hash(senha, saltRounds);
            sqlUser = "UPDATE usuarios SET nome=?, email=?, celular=?, cpf=?, senha=?, foto_perfil=?, empresa_id=? WHERE id=?";
            paramsUser = [nome, email, celular, cpf, hash, foto, empresa_id, id];
        } else {
            sqlUser = "UPDATE usuarios SET nome=?, email=?, celular=?, cpf=?, foto_perfil=?, empresa_id=? WHERE id=?";
            paramsUser = [nome, email, celular, cpf, foto, empresa_id, id];
        }

        db.beginTransaction(err => {
            if (err) return res.status(500).send(err);

            db.query(sqlUser, paramsUser, (err1) => {
                if (err1) return db.rollback(() => res.status(500).send(err1));

                // Atualiza o perfil na tabela vinculada
                const sqlPerfil = "UPDATE usuario_perfis SET perfil_id = ? WHERE usuario_id = ?";
                db.query(sqlPerfil, [perfil_id, id], (err2) => {
                    if (err2) return db.rollback(() => res.status(500).send(err2));

                    db.commit(err => {
                        if (err) return db.rollback(() => res.status(500).send(err));
                        res.send({ message: "Usuário atualizado com sucesso!" });
                    });
                });
            });
        });
    } catch (e) { res.status(500).send(e); }
});

// 4. Exclusão Lógica de Usuário (Soft Delete)
app.delete('/usuarios/:id', (req, res) => {
    const { id } = req.params;
    const query = "UPDATE usuarios SET indicativo_exclusao = TRUE WHERE id = ?";

    db.query(query, [id], (err, result) => {
        if (err) return res.status(500).send(err);
        res.send({ message: "Usuário removido da equipe!" });
    });
});

// --- GESTÃO DE EMPRESAS (TENANTS) ---

app.get('/empresas', (req, res) => {
    db.query("SELECT * FROM empresas WHERE indicativo_exclusao = 0", (err, results) => {
        if (err) return res.status(500).send(err);
        res.send(results);
    });
});

app.post('/empresas', (req, res) => {
    const { 
        nome_fantasia, razao_social, cnpj, email, telefone, 
        url_homepage, cep, logradouro, complemento_endereco, bairro, cidade, foto_logo 
    } = req.body;

    const query = `INSERT INTO empresas (
        nome_fantasia, razao_social, cnpj, email, telefone, 
        url_homepage, cep, logradouro, complemento_endereco, bairro, cidade, foto_logo
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    
    db.query(query, [
        nome_fantasia, razao_social, cnpj, email, telefone, 
        url_homepage, cep, logradouro, complemento_endereco, bairro, cidade, foto_logo
    ], (err, result) => {
        if (err) {
            console.error('ERRO CRÍTICO NO BANCO:', err.code);
            return res.status(500).send({ 
                message: "Erro ao salvar empresa. O arquivo de imagem pode ser grande demais para o banco de dados.",
                error: err.code
            });
        }
        res.send({ message: "Empresa cadastrada!", id: result.insertId });
    });
});

app.put('/empresas/:id', (req, res) => {
    const { id } = req.params;
    const { 
        nome_fantasia, razao_social, cnpj, email, telefone, 
        url_homepage, cep, logradouro, complemento_endereco, bairro, cidade, foto_logo 
    } = req.body;

    const query = `UPDATE empresas SET 
        nome_fantasia=?, razao_social=?, cnpj=?, email=?, telefone=?, 
        url_homepage=?, cep=?, logradouro=?, complemento_endereco=?, bairro=?, cidade=?, foto_logo=? 
        WHERE id=?`;

    db.query(query, [
        nome_fantasia, razao_social, cnpj, email, telefone, 
        url_homepage, cep, logradouro, complemento_endereco, bairro, cidade, foto_logo, id
    ], (err, result) => {
        if (err) return res.status(500).send(err);
        res.send({ message: "Empresa atualizada com sucesso!" });
    });
});

app.delete('/empresas/:id', (req, res) => {
    const { id } = req.params;
    // Soft Delete: Apenas marca como excluído
    db.query("UPDATE empresas SET indicativo_exclusao = 1 WHERE id = ?", [id], (err) => {
        if (err) return res.status(500).send(err);
        res.send({ message: "Empresa removida logicamente." });
    });
});


// ROTAS DE VENDAS

// 1. Rota para BUSCAR todas as vendas (GET)
app.get('/vendas', (req, res) => {

    const { empresa_id } = req.query; // Captura o ID da URL

     if (!empresa_id) {
        return res.status(400).send({ message: "O ID da empresa é obrigatório para listar o histórico." });
    }

     // Adicionado o filtro WHERE empresa_id = ?
    const query = "SELECT * FROM vendas WHERE empresa_id = ? ORDER BY created_at DESC";

    db.query(query, [empresa_id], (err, results) => {
        if (err) {
            return res.status(500).send(err);
        }
        // Transformamos o texto dos itens de volta para Objeto para o Frontend entender
        const vendasFormatadas = results.map(venda => ({
            ...venda,
            itens: typeof venda.itens === 'string' ? JSON.parse(venda.itens) : venda.itens
        }));
        res.send(vendasFormatadas);
    });
});


// 2. Rota para REMOVER uma venda (DELETE)
app.delete('/vendas/:id', (req, res) => {
    const { id } = req.params;
    const query = "DELETE FROM vendas WHERE id = ?";

    db.query(query, [id], (err, result) => {
        if (err) return res.status(500).send(err);
        res.send({ message: "Venda removida com sucesso!" });
    });
});


// 3. Rota para ATUALIZAR uma venda (PUT)
app.put('/vendas/:id', (req, res) => {
    const { id } = req.params;
    const { comprador, total } = req.body;

    // O MySQL espera o ponto decimal para números, então garantimos que chegue correto
    const query = "UPDATE vendas SET comprador = ?, total = ? WHERE id = ?";

    db.query(query, [comprador, total, id], (err, result) => {
        if (err) return res.status(500).send(err);
        res.send({ message: "Venda atualizada com success!" });
    });
});


// -- Rota de DADOS DO DASHBOARD (GET /dashboard-data)
// Rota Dashboard Corrigida
app.get('/dashboard-data', async (req, res) => {
    const inicio = req.query.inicio || new Date(new Date().setDate(1)).toISOString().split('T')[0];
    const fim = req.query.fim || new Date().toISOString().split('T')[0];
    const empresa_id = req.query.empresa_id;

    // Proteção: Se não houver empresa_id, não retorna dados
    if (!empresa_id) return res.status(400).send({ message: "ID da empresa é obrigatório." });

    const dataInicio = `${inicio} 00:00:00`;
    const dataFim = `${fim} 23:59:59`;
    const hoje = new Date().toISOString().split('T')[0];

    try {

        // Query A: KPIs Fixos de Hoje
        const sqlHoje = `
            SELECT 
                (SELECT COUNT(*) FROM vendas WHERE DATE(created_at) = ? AND empresa_id = ?) as qtd_vendas,
                (SELECT SUM(total) FROM vendas WHERE DATE(created_at) = ? AND empresa_id = ?) as total_faturado,
                (SELECT AVG(total) FROM vendas WHERE DATE(created_at) = ? AND empresa_id = ?) as ticket_medio,
                (SELECT IFNULL(SUM(vi.quantidade * vi.custo_unitario), 0) 
                 FROM vendas_itens vi 
                 JOIN vendas v ON vi.venda_id = v.id 
                 WHERE DATE(v.created_at) = ? AND v.empresa_id = ?) as total_custo`;

        // Query B: Ranking de Vendedores (Período)
        const sqlVendedores = `
            SELECT vendedor, SUM(total) as total_vendido 
            FROM vendas 
            WHERE created_at BETWEEN ? AND ? AND empresa_id = ?
            GROUP BY vendedor 
            ORDER BY total_vendido DESC`;

        // Query C: Top 10 Produtos (Período)
        const sqlTopProdutos = `
            SELECT p.nome, SUM(vi.quantidade) as total_qtd 
            FROM vendas_itens vi 
            JOIN vendas v ON v.id = vi.venda_id
            JOIN produtos p ON p.id = vi.produto_id 
            WHERE v.created_at BETWEEN ? AND ? AND v.empresa_id = ?
            GROUP BY p.id 
            ORDER BY total_qtd DESC 
            LIMIT 7`;

        // Query D: Evolução (Últimos 7 dias) - Fixa para o gráfico de barras
        const sqlGrafico = `
            SELECT DATE(created_at) as data, SUM(total) as total 
            FROM vendas 
            WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) AND empresa_id = ?
            GROUP BY DATE(created_at) 
            ORDER BY data ASC`;
        
        // Query E: Alerta de Estoque
        const sqlAlertaEstoque = `
            SELECT nome, estoque_atual, estoque_minimo 
            FROM produtos 
            WHERE estoque_atual <= estoque_minimo AND indicativo_exclusao = FALSE AND empresa_id = ?`;

        // --- SALDO DO LIVRO CAIXA (PERÍODO) ---
        // Query F: Resumo Financeiro (Integrando com o Livro Caixa)
        const sqlFinanceiro = `
            SELECT 
                SUM(CASE WHEN tl.tipo = 'Entrada' THEN lc.valor ELSE 0 END) as total_entradas,
                SUM(CASE WHEN tl.tipo = 'Saída' THEN lc.valor ELSE 0 END) as total_saidas
            FROM fin_livro_caixa lc
            JOIN fin_tipos_lancamento tl ON lc.id_tipo_lancamento = tl.id
            WHERE lc.indicativo_exclusao = FALSE AND lc.empresa_id = ?
            AND lc.data_lancamento BETWEEN ? AND ?`;

         // Execução das consultas
        const [resHoje] = await db.promise().query(sqlHoje, [hoje, empresa_id, hoje, empresa_id, hoje, empresa_id, hoje, empresa_id]);
        const [resVendedores] = await db.promise().query(sqlVendedores, [dataInicio, dataFim, empresa_id]);
        const [resProdutos] = await db.promise().query(sqlTopProdutos, [dataInicio, dataFim, empresa_id]);
        const [resGrafico] = await db.promise().query(sqlGrafico, [empresa_id]);
        const [resAlerta] = await db.promise().query(sqlAlertaEstoque, [empresa_id]); // Executa o alerta
        const [resFinanceiro] = await db.promise().query(sqlFinanceiro, [empresa_id, inicio, fim]);

        // Retornamos exatamente o objeto que o dashboard.js espera
        res.send({
            hoje: resHoje[0] || { qtd_vendas: 0, total_faturado: 0, ticket_medio: 0, total_custo: 0 },
            ranking: resVendedores,
            topProdutos: resProdutos,
            grafico: resGrafico,
            estoqueCritico: resAlerta, // Envia a lista de produtos críticos
            financeiro: resFinanceiro[0] || { total_entradas: 0, total_saidas: 0 }
        });

    } catch (e) {
        console.error("Erro Dashboard:",e);
        res.status(500).send({ message: "Erro interno no servidor", error: e.message });
    }
});

// --- MÓDULO DE ESTOQUE ---

// 1. Cadastrar Produto (Atualizado para incluir código de barras)
// --- PRODUTOS: Gravar com o ID da empresa ---
app.post('/produtos', (req, res) => {
    const { nome, descricao, preco, custo, estoque_min, imagens, codigo, empresa_id } = req.body;
    
    const query = `
        INSERT INTO produtos (nome, descricao, preco_venda, custo_cpv, estoque_minimo, imagens, codigo_barras, empresa_id) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    // O MySQL 5.7+ suporta JSON nativo. Convertemos o array JS para String JSON.
    db.query(query, [nome, descricao, preco, custo, estoque_min, JSON.stringify(imagens), codigo, empresa_id], (err, result) => {
        if (err) return res.status(500).send(err);
        res.send({ message: "Produto cadastrado!", id: result.insertId });
    });
});


// 2. Listar Produtos (Para o Estoque e PDV) (APENAS OS ATIVOS) - Filtrar por Empresa
app.get('/produtos', (req, res) => {
    // Adicionamos a cláusula WHERE
    const { empresa_id } = req.query; // Recebe o ID via URL: ?empresa_id=1
    const sql = "SELECT * FROM produtos WHERE empresa_id = ? AND indicativo_exclusao = FALSE ORDER BY nome ASC";
    
    db.query(sql, [empresa_id], (err, results) => {
        if (err) return res.status(500).send(err);
        res.send(results);
    });
});

// 2.1 Atualizar Produto (PUT)
app.put('/produtos/:id', (req, res) => {
    const { id } = req.params;
    const { nome, descricao, preco, custo, estoque_min, imagens, codigo } = req.body;

    // Nota: Não atualizamos o 'estoque_atual' aqui, pois isso deve ser feito via Entrada de Nota ou Venda
    // Mas atualizamos o 'estoque_minimo' que é uma configuração de gestão.
    
    const query = `
        UPDATE produtos 
        SET nome = ?, descricao = ?, preco_venda = ?, custo_cpv = ?, estoque_minimo = ?, imagens = ?, codigo_barras = ?
        WHERE id = ?`;

    db.query(query, [nome, descricao, preco, custo, estoque_min, JSON.stringify(imagens), codigo, id], (err, result) => {
        if (err) return res.status(500).send(err);
        res.send({ message: "Produto atualizado com sucesso!" });
    });
});

// 3. Exclusão Lógica (Soft Delete)
app.delete('/produtos/:id', (req, res) => {
    const { id } = req.params;

    // Ao invés de DELETE FROM, fazemos um UPDATE
    const query = "UPDATE produtos SET indicativo_exclusao = TRUE WHERE id = ?";

    db.query(query, [id], (err, result) => {
        if (err) return res.status(500).send(err);
        res.send({ message: "Produto movido para lixeira com sucesso!" });
    });
});


// 4. Dar Entrada no Estoque (Rota Inteligente)
app.post('/estoque/entrada', (req, res) => {
    const { produto_id, quantidade, novo_custo, empresa_id } = req.body;

    db.beginTransaction(err => {
        if (err) return res.status(500).send(err);

        // LÓGICA CONDICIONAL: 
        // Se 'novo_custo' foi preenchido, atualizamos o custo. 
        // Se estiver vazio (null), atualizamos apenas a quantidade.
        
        let sqlUpdate;
        let paramsUpdate;

        if (novo_custo) {
            // Caso 1: Veio com preço novo -> Atualiza tudo
            sqlUpdate = "UPDATE produtos SET estoque_atual = estoque_atual + ?, custo_cpv = ? WHERE id = ?";
            paramsUpdate = [quantidade, novo_custo, produto_id];
        } else {
            // Caso 2: Sem preço novo -> Preserva o custo antigo (não mexe na coluna custo_cpv)
            sqlUpdate = "UPDATE produtos SET estoque_atual = estoque_atual + ? WHERE id = ?";
            paramsUpdate = [quantidade, produto_id];
        }

        // Passo A: Executa a atualização definida acima
        db.query(sqlUpdate, paramsUpdate, (err, result) => {
            if (err) return db.rollback(() => res.status(500).send(err));

            // Passo B: Registrar o histórico (entradas_estoque)
            // Aqui mantemos o null no histórico para saber que naquela entrada o custo não foi informado
            const sqlInsert = "INSERT INTO entradas_estoque (produto_id, quantidade, custo_unitario, empresa_id) VALUES (?, ?, ?, ?)";
            
            db.query(sqlInsert, [produto_id, quantidade, novo_custo, empresa_id], (err, result) => {
                if (err) return db.rollback(() => res.status(500).send(err));

                db.commit(err => {
                    if (err) return db.rollback(() => res.status(500).send(err));
                    res.send({ message: "Estoque atualizado com sucesso!" });
                });
            });
        });
    });
});

// 5. Nova Rota de Venda Unificada (Com Baixa de Estoque e Histórico JSON)
app.post('/vendas', (req, res) => {
    const { vendedor, comprador, total , desconto_global, itens,  empresa_id, pagamento } = req.body;
    
    // Transformamos para JSON para manter o funcionamento da rota GET /vendas (histórico)
    const itensJSON = JSON.stringify(itens);

    db.beginTransaction(err => {
        if (err) return res.status(500).send(err);

        // A. Criar a Venda na tabela principal (incluindo o campo itens para o histórico)
        const sqlVenda = "INSERT INTO vendas (vendedor, comprador, total, desconto_global, itens, empresa_id, pagamento) VALUES (?, ?, ?, ?, ?, ?, ?)";
        db.query(sqlVenda, [vendedor, comprador, total , desconto_global, itensJSON,  empresa_id, pagamento], (err, result) => {
            if (err) return db.rollback(() => res.status(500).send(err));
            
            const vendaId = result.insertId;
            
            // B. Processar cada item para a tabela vendas_itens e baixar estoque
            const updates = itens.map(item => {
                return new Promise((resolve, reject) => {
                    // Inserir na tabela detalhada
                    const sqlItem = "INSERT INTO vendas_itens (venda_id, produto_id, quantidade, preco_unitario, custo_unitario, empresa_id) VALUES (?, ?, ?, ?, ?, ?)";
                    db.query(sqlItem, [vendaId, item.id, item.qty, item.price, item.custo, empresa_id], (erroItem) => {
                        if (erroItem) return reject(erroItem);

                        // Baixar o Estoque Atual
                        const sqlBaixa = "UPDATE produtos SET estoque_atual = estoque_atual - ? WHERE id = ?";
                        db.query(sqlBaixa, [item.qty, item.id], (erroBaixa) => {
                            if (erroBaixa) return reject(erroBaixa);
                            resolve();
                        });
                    });
                });
            });

            Promise.all(updates)
                .then(() => {
                    db.commit(err => {
                        if (err) return db.rollback(() => res.status(500).send(err));
                        res.send({ message: "Venda realizada e estoque atualizado!", id: vendaId });
                    });
                })
                .catch(erro => {
                    db.rollback(() => res.status(500).send(erro));
                });
        });
    });
});

// --- INTELIGÊNCIA: CURVA ABC ---
// Rota ABC Corrigida (Substitua a partir da linha 330)
app.post('/estoque/calcular-abc', (req, res) => {
    const { dataInicio, dataFim, empresa_id } = req.body;

    // Ajuste para pegar do início do primeiro dia até o fim do último dia
    const inicio = `${dataInicio} 00:00:00`;
    const fim = `${dataFim} 23:59:59`;

    const sqlRanking = `
        SELECT p.id, SUM(vi.quantidade * vi.preco_unitario) as valor_total_vendido
        FROM vendas_itens vi
        JOIN vendas v ON v.id = vi.venda_id
        JOIN produtos p ON p.id = vi.produto_id
        WHERE v.created_at BETWEEN ? AND ? and v.empresa_id = ?
        GROUP BY p.id ORDER BY valor_total_vendido DESC`;

    db.query(sqlRanking, [inicio, fim, empresa_id], (err, produtosVendidos) => {
        if (err) return res.status(500).send(err);

        // Correção do 'undefined': sempre enviar total: 0 se não houver vendas
        if (produtosVendidos.length === 0) {
            return res.send({ message: "Nenhuma venda no período.", total: 0 });
        }

        const faturamentoTotal = produtosVendidos.reduce((acc, p) => acc + parseFloat(p.valor_total_vendido), 0);
        let acumulado = 0;
        const updates = produtosVendidos.map(prod => {
            acumulado += parseFloat(prod.valor_total_vendido);
            const percentual = (acumulado / faturamentoTotal) * 100;
            const classe = percentual <= 80 ? 'A' : (percentual <= 95 ? 'B' : 'C');
            
            return new Promise((resolve) => {
                db.query("UPDATE produtos SET classificacao_abc = ? WHERE id = ?", [classe, prod.id], resolve);
            });
        });

        Promise.all(updates).then(() => {
            res.send({ message: "Classificação ABC atualizada!", total: faturamentoTotal });
        });
    });
});


// --- FINANCEIRO: TIPOS DE LANÇAMENTO (Categorias) ---
app.get('/fin-tipos', (req, res) => {
    const { empresa_id } = req.query;
    db.query("SELECT * FROM fin_tipos_lancamento WHERE empresa_id = ? AND indicativo_exclusao = FALSE ORDER BY descricao", [empresa_id], (err, results) => {
        if (err) return res.status(500).send(err);
        res.send(results);
    });
});

app.post('/fin-tipos', (req, res) => {
    const { descricao, tipo, empresa_id } = req.body;
    db.query("INSERT INTO fin_tipos_lancamento (descricao, tipo, empresa_id) VALUES (?, ?, ?)", [descricao, tipo, empresa_id], (err) => {
        if (err) return res.status(500).send(err);
        res.send({ message: "Tipo cadastrado!" });
    });
});


app.get('/fin-caixa', (req, res) => {
    // Pegamos as datas da URL. Se não vierem, pegamos o mês atual por padrão.
    const { inicio, fim, empresa_id } = req.query;

    let sql = `
        SELECT lc.*, tl.descricao as tipo_nome, tl.tipo 
        FROM fin_livro_caixa lc
        JOIN fin_tipos_lancamento tl ON lc.id_tipo_lancamento = tl.id
        WHERE lc.empresa_id = ? AND lc.indicativo_exclusao = FALSE`;
    
    const params = [empresa_id];

    if (inicio && fim) {
        sql += ` AND lc.data_lancamento BETWEEN ? AND ?`;
        params.push(inicio, fim);
    }

    sql += ` ORDER BY lc.data_lancamento DESC`;

    db.query(sql, params, (err, results) => {
        if (err) return res.status(500).send(err);
        res.send(results);
    });
});

app.post('/fin-caixa', (req, res) => {
    const { id_tipo_lancamento, descricao, data_lancamento, valor, id_usuario, empresa_id } = req.body;

    // 🛡️ Verificação de segurança no servidor
    if (!valor || valor <= 0) {
        return res.status(400).send({ message: "Valor inválido para lançamento." });
    }

    db.query("INSERT INTO fin_livro_caixa (id_tipo_lancamento, descricao, data_lancamento, valor, id_usuario, empresa_id) VALUES (?,?,?,?,?,?)",
    [id_tipo_lancamento, descricao, data_lancamento, valor, id_usuario, empresa_id], (err) => {
        if (err) return res.status(500).send(err);
        res.send({ message: "Lançamento efetuado!" });
    });
});

// Rota para calcular o Saldo Anterior (Tudo antes da data de início)
app.get('/fin-saldo-anterior', (req, res) => {
    const { inicio, empresa_id } = req.query;

    if (!inicio || !empresa_id) return res.status(400).send({ message: "Data de início e identificação da empresa necessários." });

    const sql = `
        SELECT 
            SUM(CASE WHEN tl.tipo = 'Entrada' THEN lc.valor ELSE 0 END) -
            SUM(CASE WHEN tl.tipo = 'Saída' THEN lc.valor ELSE 0 END) as saldo_anterior
        FROM fin_livro_caixa lc
        JOIN fin_tipos_lancamento tl ON lc.id_tipo_lancamento = tl.id
        WHERE lc.empresa_id = ? AND lc.indicativo_exclusao = FALSE AND lc.data_lancamento < ?`;

    db.query(sql, [empresa_id, inicio], (err, results) => {
        if (err) return res.status(500).send(err);
        res.send({ saldoAnterior: results[0].saldo_anterior || 0 });
    });
});

// Atualizar Tipo de Lançamento (PUT)
app.put('/fin-tipos/:id', (req, res) => {
    const { id } = req.params;
    const { descricao, tipo } = req.body;
    const query = "UPDATE fin_tipos_lancamento SET descricao = ?, tipo = ? WHERE id = ?";
    
    db.query(query, [descricao, tipo, id], (err, result) => {
        if (err) return res.status(500).send(err);
        res.send({ message: "Tipo de lançamento atualizado com sucesso!" });
    });
});

// Exclusão Lógica de Tipo (DELETE - Soft Delete)
app.delete('/fin-tipos/:id', (req, res) => {
    const { id } = req.params;
    const query = "UPDATE fin_tipos_lancamento SET indicativo_exclusao = TRUE WHERE id = ?";
    
    db.query(query, [id], (err, result) => {
        if (err) return res.status(500).send(err);
        res.send({ message: "Tipo de lançamento removido (Soft Delete)!" });
    });
});

// Atualizar Lançamento do Livro Caixa (PUT)
app.put('/fin-caixa/:id', (req, res) => {
    const { id } = req.params;
    const { id_tipo_lancamento, descricao, data_lancamento, valor } = req.body;

    // 🛡️ Verificação de segurança no servidor
    if (!valor || valor <= 0) {
        return res.status(400).send({ message: "Valor inválido para lançamento." });
    }

    const query = `
        UPDATE fin_livro_caixa 
        SET id_tipo_lancamento = ?, descricao = ?, data_lancamento = ?, valor = ? 
        WHERE id = ?`;
    
    db.query(query, [id_tipo_lancamento, descricao, data_lancamento, valor, id], (err, result) => {
        if (err) return res.status(500).send(err);
        res.send({ message: "Lançamento financeiro atualizado com sucesso!" });
    });
});

// Exclusão Lógica de Lançamento (DELETE - Soft Delete)
app.delete('/fin-caixa/:id', (req, res) => {
    const { id } = req.params;
    const query = "UPDATE fin_livro_caixa SET indicativo_exclusao = TRUE WHERE id = ?";
    
    db.query(query, [id], (err, result) => {
        if (err) return res.status(500).send(err);
        res.send({ message: "Lançamento cancelado com sucesso (Soft Delete)!" });
    });
});


app.listen(3000, () => {
    console.log('Servidor rodando em http://localhost:3000');
});