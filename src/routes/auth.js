const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

router.post('/login', async (req, res) => {
    const { email, senha } = req.body;
    try {
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return res.status(401).json({ error: "E-mail ou senha incorretos" });

        const senhaValida = await bcrypt.compare(senha, user.senha);
        if (!senhaValida) return res.status(401).json({ error: "E-mail ou senha incorretos" });

        const token = jwt.sign({ id: user.id, tipo: user.tipo }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });
        res.json({ token, user: { id: user.id, nome: user.nome, email: user.email, tipo: user.tipo } });
    } catch (err) {
        res.status(500).json({ error: "Erro interno no servidor" });
    }
});

router.post('/cadastro', async (req, res) => {
    const { nome, email, senha, tipo } = req.body;
    try {
        const hash = await bcrypt.hash(senha, 10);
        const user = await prisma.user.create({
            data: { nome, email, senha: hash, tipo: tipo || 'passageiro' }
        });
        res.status(201).json(user);
    } catch (err) {
        res.status(400).json({ error: "Erro ao cadastrar usuário" });
    }
});

module.exports = router;