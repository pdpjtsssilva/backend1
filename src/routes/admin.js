const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');

// Inicialização segura do Prisma
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

// ROTA: LISTAR USUÁRIOS (Corrigida para bater com o schema.prisma)
router.get('/usuarios', async (req, res) => {
    try {
        const { tipo } = req.query; // Pega o ?tipo=motorista do seu fetch
        
        const filtro = {};
        if (tipo) {
            filtro.tipo = tipo.toUpperCase() === 'MOTORISTA' ? 'MOTORISTA' : 'PASSAGEIRO';
        }

        // Importante: usar 'usuario' em minúsculo conforme o Prisma gera
        const usuarios = await prisma.usuario.findMany({
            where: filtro,
            orderBy: { createdAt: 'desc' }
        });

        res.json(usuarios);
    } catch (error) {
        console.error("Erro no Prisma:", error);
        // Retornar JSON em vez de deixar o servidor enviar HTML de erro
        res.status(500).json({ error: "Erro ao buscar usuários no banco." });
    }
});

// ROTA: DASHBOARD / STATS
router.get('/dashboard', async (req, res) => {
    try {
        const total = await prisma.usuario.count();
        const motoristas = await prisma.usuario.count({ where: { tipo: 'MOTORISTA' } });
        const corridas = await prisma.corrida.count();

        res.json({
            usuarios: { total, motoristas, passageiros: total - motoristas },
            corridas: { hoje: corridas },
            receita: { total: 0 },
            motoristasAtivos: motoristas
        });
    } catch (error) {
        res.status(500).json({ error: "Erro ao carregar dashboard" });
    }
});

module.exports = router;