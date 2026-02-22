const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

const JWT_SECRET = process.env.JWT_SECRET || 'l-europe-secret-key';

// Detecta qual modelo usar (user ou usuario)
const getModel = () => {
  if (prisma.user) return prisma.user;
  if (prisma.usuario) return prisma.usuario;
  throw new Error('Nenhum modelo de usuario encontrado');
};

// CADASTRO
router.post('/cadastro', async (req, res) => {
    try {
        const { nome, email, senha, telefone, tipo } = req.body;

        if (!nome || !email || !senha) {
            return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios.' });
        }

        const model = getModel();
        
        const usuarioExiste = await model.findUnique({
            where: { email: email.toLowerCase() }
        });

        if (usuarioExiste) {
            return res.status(400).json({ error: 'Este e-mail já está em uso.' });
        }

        const salt = await bcrypt.genSalt(10);
        const senhaHash = await bcrypt.hash(senha, salt);

        const tipoFinal = (tipo && tipo.toLowerCase() === 'motorista') ? 'motorista' : 'passageiro';

        const novoUsuario = await model.create({
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

        const model = getModel();

        const usuario = await model.findUnique({ 
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

module.exports = router;