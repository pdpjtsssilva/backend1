const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma'); // ← Prisma singleton

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

        // Define o tipo com base na escolha do usuário, padrão passageiro
        const tipoFinal = (tipo && tipo.toLowerCase() === 'motorista') ? 'motorista' : 'passageiro';

        const novoUsuario = await prisma.user.create({
            data: {
                nome,
                email: email.toLowerCase(),
                senha: senhaHash,
                telefone,
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
        console.error("Erro no cadastro:", error);
        res.status(500).json({ error: 'Erro interno ao realizar cadastro.', erro: error.message });
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
        console.error("Erro no login:", error);
        res.status(500).json({ error: 'Erro ao realizar login.', erro: error.message });
    }
});

// ATUALIZAR USUÁRIO
router.put('/atualizar/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { nome, email, telefone, documento, dataNascimento, notificacoesAtivas } = req.body;

        const updateData = {};
        if (nome) updateData.nome = nome;
        if (email) updateData.email = email.toLowerCase();
        if (telefone) updateData.telefone = telefone;
        if (documento) updateData.documento = documento;
        if (dataNascimento) updateData.dataNascimento = dataNascimento;
        if (typeof notificacoesAtivas === 'boolean') updateData.notificacoesAtivas = notificacoesAtivas;

        const usuario = await prisma.user.update({
            where: { id },
            data: updateData
        });

        res.json(usuario);
    } catch (error) {
        console.error('Erro ao atualizar usuário:', error);
        res.status(500).json({ erro: 'Erro ao atualizar usuário' });
    }
});

// ALTERAR SENHA
router.put('/alterar-senha/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { senhaAtual, novaSenha } = req.body;

        if (!senhaAtual || !novaSenha) {
            return res.status(400).json({ erro: 'Senha atual e nova senha são obrigatórias' });
        }

        const usuario = await prisma.user.findUnique({ where: { id } });
        if (!usuario) {
            return res.status(404).json({ erro: 'Usuário não encontrado' });
        }

        const senhaValida = await bcrypt.compare(senhaAtual, usuario.senha);
        if (!senhaValida) {
            return res.status(401).json({ erro: 'Senha atual incorreta' });
        }

        const salt = await bcrypt.genSalt(10);
        const senhaHash = await bcrypt.hash(novaSenha, salt);

        await prisma.user.update({
            where: { id },
            data: { senha: senhaHash }
        });

        res.json({ message: 'Senha alterada com sucesso' });
    } catch (error) {
        console.error('Erro ao alterar senha:', error);
        res.status(500).json({ erro: 'Erro ao alterar senha' });
    }
});

// EXCLUIR CONTA
router.delete('/excluir/:id', async (req, res) => {
    try {
        const { id } = req.params;

        await prisma.user.delete({ where: { id } });

        res.json({ message: 'Conta excluída com sucesso' });
    } catch (error) {
        console.error('Erro ao excluir conta:', error);
        res.status(500).json({ erro: 'Erro ao excluir conta' });
    }
});

module.exports = router;