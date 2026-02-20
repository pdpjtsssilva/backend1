const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// --- ROTA DE CADASTRO ---
router.post('/cadastro', async (req, res) => {
    try {
        const { nome, email, senha, telefone, tipo } = req.body;

        // CORREÇÃO: De 'user' para 'usuario'
        const usuarioExiste = await prisma.usuario.findUnique({
            where: { email }
        });

        if (usuarioExiste) {
            return res.status(400).json({ error: 'Este e-mail já está em uso.' });
        }

        const salt = await bcrypt.genSalt(10);
        const senhaHash = await bcrypt.hash(senha, salt);

        // Criando na tabela 'usuario'
        const novoUsuario = await prisma.usuario.create({
            data: {
                nome,
                email,
                senha: senhaHash,
                telefone,
                tipo: tipo || 'PASSAGEIRO'
            }
        });

        res.status(201).json({
            message: 'Usuário cadastrado com sucesso!',
            usuario: { id: novoUsuario.id, nome: novoUsuario.nome }
        });

    } catch (error) {
        console.error("Erro no cadastro:", error);
        res.status(500).json({ error: 'Erro ao processar o cadastro.' });
    }
});

// --- ROTA DE LOGIN ---
router.post('/login', async (req, res) => {
    try {
        const { email, senha } = req.body;

        // CORREÇÃO: De 'user' para 'usuario'
        const usuario = await prisma.usuario.findUnique({
            where: { email }
        });

        if (!usuario) {
            return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
        }

        const senhaValida = await bcrypt.compare(senha, usuario.senha);
        if (!senhaValida) {
            return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
        }

        const token = jwt.sign(
            { id: usuario.id, tipo: usuario.tipo },
            process.env.JWT_SECRET || 'chave_reserva',
            { expiresIn: '7d' }
        );

        res.json({
            token,
            usuario: { id: usuario.id, nome: usuario.nome, tipo: usuario.tipo }
        });

    } catch (error) {
        console.error("Erro no login:", error);
        res.status(500).json({ error: 'Erro ao realizar login.' });
    }
});

module.exports = router;