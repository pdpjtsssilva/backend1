const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Middleware de Autenticação Básica
const basicAuth = (req, res, next) => {
    const auth = { login: process.env.ADMIN_USER || 'admin', password: process.env.ADMIN_PASS || 'admin123' };
    const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
    const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');

    if (login && password && login === auth.login && password === auth.password) {
        return next();
    }
    res.set('WWW-Authenticate', 'Basic realm="401"');
    res.status(401).send('Autenticação necessária.');
};

router.use(basicAuth);

// --- 1. ROTA: MOTORISTAS ONLINE (Resolve o erro 404) ---
router.get('/motoristas-online', async (req, res) => {
    try {
        // Buscamos usuários do tipo MOTORISTA. 
        // Nota: Em um sistema real, você filtraria por um campo 'online: true' ou via Socket.
        const motoristas = await prisma.usuario.findMany({
            where: { tipo: 'MOTORISTA' },
            select: {
                id: true,
                nome: true,
                statusConta: true,
                // Simulamos a localização para o mapa não dar erro se o banco estiver vazio
                latitude: true, 
                longitude: true 
            }
        });

        // Formatamos para o formato que o seu Leaflet (Mapa) espera no painel
        const formatados = motoristas.map(m => ({
            motoristaId: m.id,
            nome: m.nome,
            statusOnline: 'online', // Ajuste conforme sua lógica de sessão
            localizacao: {
                latitude: m.latitude || -23.5505,
                longitude: m.longitude || -46.6333
            }
        }));

        res.json(formatados);
    } catch (error) {
        console.error("Erro ao buscar motoristas online:", error);
        res.status(500).json([]);
    }
});

// --- 2. ROTA: LISTAR USUÁRIOS ---
router.get('/usuarios', async (req, res) => {
    try {
        const { tipo } = req.query;
        const filtro = {};
        if (tipo) filtro.tipo = tipo.toUpperCase();

        const usuarios = await prisma.usuario.findMany({
            where: filtro,
            orderBy: { createdAt: 'desc' }
        });
        res.json(usuarios);
    } catch (error) {
        res.status(500).json({ error: "Erro ao listar usuários" });
    }
});

// --- 3. ROTA: DASHBOARD / STATS ---
router.get('/dashboard', async (req, res) => {
    try {
        const total = await prisma.usuario.count();
        const motoristas = await prisma.usuario.count({ where: { tipo: 'MOTORISTA' } });
        const corridasAtivas = await prisma.corrida.count({ where: { status: 'EM_ANDAMENTO' } });

        res.json({
            usuarios: { total, motoristas, passageiros: total - motoristas },
            corridas: { hoje: 0, semana: 0, mes: 0, emAndamento: corridasAtivas },
            receita: { total: 0, comissao: 0 },
            motoristasAtivos: motoristas,
            graficoSemanal: [] 
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
                passageiro: { select: { nome: true, email: true } },
                motorista: { select: { nome: true, email: true } }
            },
            orderBy: { createdAt: 'desc' },
            take: 50
        });
        res.json(corridas);
    } catch (error) {
        res.status(500).json([]);
    }
});

module.exports = router;