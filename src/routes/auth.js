const express = require('express');
const router = express.Router(); // <--- LINHA ESSENCIAL: Resolve o ReferenceError
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// --- ROTA DE CADASTRO ---
router.post('/cadastro', async (req, res) => {
    try {
        const { nome, email, senha, telefone, tipo } = req.body;

        // 1. Verifica se o usuário já existe na tabela 'usuario'
        const usuarioExiste = await prisma.usuario.findUnique({
            where: { email }
        });

        if (usuarioExiste) {
            return res.status(400).json({ error: 'Este e-mail já está em uso.' });
        }

        // 2. Criptografia da senha
        const salt = await bcrypt.genSalt(10);
        const senhaHash = await bcrypt.hash(senha, salt);

        // 3. TRATAMENTO DO ENUM: Converte para MAIÚSCULO (Resolve o PrismaClientValidationError)
        // Isso garante que 'passageiro' vire 'PASSAGEIRO'
        const tipoEnum = tipo ? tipo.toUpperCase() : 'PASSAGEIRO';

        // 4. Criação do novo usuário
        const novoUsuario = await prisma.usuario.create({
            data: {
                nome,
                email,
                senha: senhaHash,
                telefone,
                tipo: tipoEnum
            }
        });

        res.status(201).json({
            message: 'Usuário cadastrado com sucesso!',
            usuario: { id: novoUsuario.id, nome: novoUsuario.nome }
        });

    } catch (error) {
        console.error("Erro detalhado no cadastro:", error);
        res.status(500).json({ 
            error: 'Erro interno ao realizar cadastro.',
            details: error.message 
        });
    }
});

// --- ROTA DE LOGIN ---
router.post('/login', async (req, res) => {
    try {
        const { email, senha } = req.body;

        const usuario = await prisma.usuario.findUnique({
            where: { email }
        });

        if (!usuario) {
            return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
        }

        const senhaValida = await bcrypt.compare(senha, usuario.senha);
        if (!senhaValida) {
            return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
        }

        const token = jwt.sign(
            { id: usuario.id, tipo: usuario.tipo },
            process.env.JWT_SECRET || 'l-europe-secret-key',
            { expiresIn: '7d' }
        );

        res.json({
            token,
            usuario: {
                id: usuario.id,
                nome: usuario.nome,
                email: usuario.email,
                tipo: usuario.tipo
            }
        });

    } catch (error) {
        console.error("Erro no processo de login:", error);
        res.status(500).json({ error: 'Erro interno ao realizar login.' });
    }
});

module.exports = router;