const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Middleware de Autenticação Básica para o Painel
const basicAuth = (req, res, next) => {
    const auth = { 
        login: process.env.ADMIN_USER || 'admin', 
        password: process.env.ADMIN_PASS || 'admin123' 
    };
    const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
    const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');

    if (login && password && login === auth.login && password === auth.password) {
        return next();
    }
    res.set('WWW-Authenticate', 'Basic realm="401"');
    res.status(401).send('Autenticação necessária para acessar o painel.');
};

// Aplica a proteção em todas as rotas deste arquivo
router.use(basicAuth);

// --- 1. ROTA: LISTAR USUÁRIOS (Geral ou por Tipo) ---
router.get('/usuarios', async (req, res) => {
    try {
        const { tipo } = req.query; // Pega ?tipo=motorista ou ?tipo=passageiro
        const filtro = tipo ? { tipo: tipo.toLowerCase() } : {};

        const usuarios = await prisma.user.findMany({
            where: filtro,
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                nome: true,
                email: true,
                telefone: true,
                documento: true,
                tipo: true,
                statusConta: true,
                createdAt: true
            }
        });
        res.json(usuarios || []);
    } catch (error) {
        console.error("Erro ao listar usuários:", error);
        res.json([]); // Retorna lista vazia para não quebrar o frontend (evita SyntaxError)
    }
});

// --- 2. ROTA: MOTORISTAS ONLINE ---
router.get('/motoristas-online', async (req, res) => {
    try {
        // Buscamos usuários do tipo motorista
        const motoristas = await prisma.user.findMany({
            where: { tipo: 'motorista' },
            select: { id: true, nome: true, statusConta: true }
        });

        // Formatamos para o que o seu mapa (Leaflet) espera
        const formatados = motoristas.map(m => ({
            motoristaId: m.id,
            nome: m.nome,
            statusOnline: 'online', // Em um sistema real, você checaria uma flag ou o socket
            localizacao: {
                latitude: -23.5505, // Posição padrão (São Paulo) se não houver GPS
                longitude: -46.6333
            }
        }));
        res.json(formatados);
    } catch (error) {
        res.json([]);
    }
});

// --- 3. ROTA: DASHBOARD / ESTATÍSTICAS ---
router.get('/dashboard', async (req, res) => {
    try {
        const totalUsers = await prisma.user.count();
        const totalCorridas = await prisma.corrida.count();
        const emAndamento = await prisma.corrida.count({
            where: { status: 'em_andamento' }
        });

        res.json({
            usuarios: { 
                total: totalUsers,
                motoristas: await prisma.user.count({ where: { tipo: 'motorista' } }),
                passageiros: await prisma.user.count({ where: { tipo: 'passageiro' } })
            },
            corridas: { 
                hoje: totalCorridas, 
                emAndamento: emAndamento 
            },
            receita: { total: 0 },
            motoristasAtivos: 0,
            graficoSemanal: [] // Pode ser implementado futuramente
        });
    } catch (error) {
        res.status(500).json({ error: "Erro ao carregar dashboard" });
    }
});

// --- 4. ROTA: LISTAR CORRIDAS ---
router.get('/corridas', async (req, res) => {
    try {
        const corridas = await prisma.corrida.findMany({
            include: {
                passageiro: { select: { nome: true, email: true } }
            },
            orderBy: { createdAt: 'desc' },
            take: 50
        });
        res.json(corridas);
    } catch (error) {
        res.json([]);
    }
});

// --- 5. ROTA: TRANSAÇÕES ---
router.get('/transacoes', async (req, res) => {
    try {
        const transacoes = await prisma.transacao.findMany({
            include: { usuario: { select: { nome: true } } },
            orderBy: { createdAt: 'desc' }
        });
        res.json(transacoes);
    } catch (error) {
        res.json([]);
    }
});

module.exports = router;