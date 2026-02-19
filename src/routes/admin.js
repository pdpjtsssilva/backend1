const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

router.get('/usuarios', async (req, res) => {
    try {
        const { tipo } = req.query;
        const usuarios = await prisma.user.findMany({
            where: tipo ? { tipo: tipo.toLowerCase() } : {},
            select: { id: true, nome: true, email: true, tipo: true, createdAt: true }
        });
        res.json(usuarios || []);
    } catch (err) { res.json([]); }
});

router.get('/dashboard', async (req, res) => {
    try {
        const total = await prisma.user.count();
        res.json({ usuarios: { total }, corridas: { hoje: 0 }, receita: { total: 0 }, motoristasAtivos: 0, graficoSemanal: [] });
    } catch (err) { res.json({ usuarios: { total: 0 } }); }
});

router.get('/motoristas-online', (req, res) => res.json([]));
router.get('/transacoes', (req, res) => res.json([]));

module.exports = router;
