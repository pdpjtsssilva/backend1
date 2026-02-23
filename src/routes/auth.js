const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

const JWT_SECRET = process.env.JWT_SECRET || 'l-europe-secret-key';

// CADASTRO
router.post('/cadastro', async (req, res) => {
    try {
        const { nome, email, senha, telefone, tipo } = req.body;

        if (!nome || !email || !senha) {
            return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios.' });
        }
        
        const usuarioExiste = await prisma.user.findUnique({
            where: { email: email.toLowerCase() }
        });

        if (usuarioExiste) {
            return res.status(400).json({ error: 'Este e-mail já está em uso.' });
        }

        const salt = await bcrypt.genSalt(10);
        const senhaHash = await bcrypt.hash(senha, salt);

        const tipoFinal = (tipo && tipo.toLowerCase() === 'motorista') ? 'motorista' : 'passageiro';

        const novoUsuario = await prisma.user.create({
            data: {
                nome,
                email: email.toLowerCase(),
                senha: senhaHash,
                telefone: telefone || '',
                tipo: tipoFinal
            }
        });

        const token = jwt.sign(
            { id: novoUsuario.id, tipo: novoUsuario.tipo },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.status(201).json({
            message: 'Usuário cadastrado com sucesso!',
            token,
            usuario: { id: novoUsuario.id, nome: novoUsuario.nome, email: novoUsuario.email, tipo: novoUsuario.tipo }
        });

    } catch (error) {
        console.error("Erro no cadastro:", error.message);
        res.status(500).json({ error: 'Erro interno ao realizar cadastro.', details: error.message });
    }
});

// LOGIN
router.post('/login', async (req, res) => {
    try {
        const { email, senha } = req.body;

        if (!email || !senha) {
            return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
        }

        const usuario = await prisma.user.findUnique({ 
            where: { email: email.toLowerCase() } 
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
            JWT_SECRET,
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
        console.error("Erro no login:", error.message);
        res.status(500).json({ error: 'Erro ao realizar login.', details: error.message });
    }
});

// ATUALIZAR PERFIL
router.put('/atualizar/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { nome, email, telefone, documento, senha } = req.body || {};

        const usuario = await prisma.user.findUnique({ where: { id } });
        if (!usuario) {
            return res.status(404).json({ erro: 'Usuario nao encontrado' });
        }

        if (email && email.toLowerCase() !== usuario.email) {
            const existente = await prisma.user.findUnique({
                where: { email: email.toLowerCase() }
            });
            if (existente) {
                return res.status(400).json({ erro: 'Este e-mail ja esta em uso.' });
            }
        }

        const data = {};
        if (typeof nome !== 'undefined') data.nome = nome;
        if (typeof email !== 'undefined') data.email = email.toLowerCase();
        if (typeof telefone !== 'undefined') data.telefone = telefone;
        if (typeof documento !== 'undefined') data.documento = documento;
        if (senha) {
            const salt = await bcrypt.genSalt(10);
            data.senha = await bcrypt.hash(senha, salt);
        }

        const atualizado = await prisma.user.update({
            where: { id },
            data,
            select: {
                id: true,
                nome: true,
                email: true,
                telefone: true,
                documento: true,
                tipo: true,
                cnhFrenteUri: true,
                cnhVersoUri: true,
                cnhStatus: true,
                statusConta: true,
                suspensoAte: true
            }
        });

        res.json(atualizado);
    } catch (error) {
        console.error("Erro ao atualizar perfil:", error.message);
        res.status(500).json({ erro: 'Erro ao atualizar perfil.', details: error.message });
    }
});

module.exports = router;
