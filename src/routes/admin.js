const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Middleware de Autenticação Básica (conforme identificado nos seus logs)
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

// Aplica a autenticação em todas as rotas administrativas
router.use(basicAuth);

// --- ROTA: LISTAR USUÁRIOS (Corrigida para 'usuario') ---
router.get('/usuarios', async (req, res) => {
    try {
        const usuarios = await prisma.usuario.findMany({
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                nome: true,
                email: true,
                tipo: true,
                telefone: true,
                createdAt: true
            }
        });
        res.json(usuarios);
    } catch (error) {
        console.error("Erro ao listar usuarios:", error);
        res.status(500).json({ error: "Erro interno ao buscar usuários." });
    }
});

// --- ROTA: LISTAR CORRIDAS (Corrigida para 'corrida') ---
router.get('/corridas', async (req, res) => {
    try {
        const corridas = await prisma.corrida.findMany({
            include: {
                passageiro: { select: { nome: true } },
                motorista: { select: { nome: true } }
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json(corridas);
    } catch (error) {
        console.error("Erro ao listar corridas:", error);
        res.status(500).json({ error: "Erro interno ao buscar corridas." });
    }
});

// --- ROTA: LISTAR AVALIAÇÕES (Corrigida para 'avaliacao') ---
router.get('/avaliacoes', async (req, res) => {
    try {
        const avaliacoes = await prisma.avaliacao.findMany({
            include: {
                corrida: true
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json(avaliacoes);
    } catch (error) {
        console.error("Erro ao listar avaliacoes:", error);
        res.status(500).json({ error: "Erro interno ao buscar avaliações." });
    }
});

// --- ROTA: DASHBOARD (Resumo de estatísticas) ---
router.get('/stats', async (req, res) => {
    try {
        const totalUsuarios = await prisma.usuario.count();
        const totalCorridas = await prisma.corrida.count();
        const corridasAtivas = await prisma.corrida.count({
            where: { status: 'EM_ANDAMENTO' }
        });

        res.json({
            usuarios: totalUsuarios,
            corridas: totalCorridas,
            ativas: corridasAtivas
        });
    } catch (error) {
        console.error("Erro ao buscar estatísticas:", error);
        res.status(500).json({ error: "Erro ao carregar dashboard." });
    }
});

module.exports = router;