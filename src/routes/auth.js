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

        // 1. Verifica se o usuário já existe (Tabela: usuario)
        const usuarioExiste = await prisma.usuario.findUnique({
            where: { email }
        });

        if (usuarioExiste) {
            return res.status(400).json({ error: 'Este e-mail já está em uso.' });
        }

        // 2. Criptografia da senha
        const salt = await bcrypt.genSalt(10);
        const senhaHash = await bcrypt.hash(senha, salt);

        // 3. Tratamento do ENUM (Garante que 'passageiro' vire 'PASSAGEIRO')
        const tipoFormatado = tipo ? tipo.toUpperCase() : 'PASSAGEIRO';

        // 4. Criação na tabela 'usuario'
        const novoUsuario = await prisma.usuario.create({
            data: {
                nome,
                email,
                senha: senhaHash,
                telefone,
                tipo: tipoFormatado
            }
        });

        // Gera token para já entrar logado
        const token = jwt.sign(
            { id: novoUsuario.id, tipo: novoUsuario.tipo },
            process.env.JWT_SECRET || 'chave_reserva',
            { expiresIn: '7d' }
        );

        res.status(201).json({
            message: 'Cadastro realizado com sucesso!',
            token,
            usuario: { id: novoUsuario.id, nome: novoUsuario.nome, tipo: novoUsuario.tipo }
        });

    } catch (error) {
        console.error("ERRO NO CADASTRO:", error);
        res.status(500).json({ error: 'Erro ao processar cadastro no servidor.' });
    }
});

// --- ROTA DE LOGIN ---
router.post('/login', async (req, res) => {
    try {
        const { email, senha } = req.body;
        const usuario = await prisma.usuario.findUnique({ where: { email } });

        if (!usuario) return res.status(401).json({ error: 'E-mail ou senha incorretos.' });

        const senhaValida = await bcrypt.compare(senha, usuario.senha);
        if (!senhaValida) return res.status(401).json({ error: 'E-mail ou senha incorretos.' });

        const token = jwt.sign(
            { id: usuario.id, tipo: usuario.tipo },
            process.env.JWT_SECRET || 'chave_reserva',
            { expiresIn: '7d' }
        );

        res.json({ token, usuario: { id: usuario.id, nome: usuario.nome, tipo: usuario.tipo } });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao realizar login.' });
    }
});

module.exports = router;