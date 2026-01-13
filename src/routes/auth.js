const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'defina_JWT_SECRET_no_env'; // Em produção, configure via .env

// Cadastro
router.post('/cadastro', async (req, res) => {
  try {
    const { nome, email, senha, telefone, tipo } = req.body;

    // Verificar se email já existe
    const usuarioExistente = await prisma.user.findUnique({
      where: { email }
    });

    if (usuarioExistente) {
      return res.status(400).json({ error: 'Email já cadastrado' });
    }

    // Hash da senha
    const senhaHash = await bcrypt.hash(senha, 10);

    // Criar usuário
    const usuario = await prisma.user.create({
      data: {
        nome,
        email,
        senha: senhaHash,
        telefone,
        tipo: tipo || 'passageiro'
      }
    });

    // Gerar token JWT
    const token = jwt.sign(
      { id: usuario.id, email: usuario.email, tipo: usuario.tipo },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        telefone: usuario.telefone,
        tipo: usuario.tipo,
        cnhFrenteUri: usuario.cnhFrenteUri,
        cnhVersoUri: usuario.cnhVersoUri,
        cnhStatus: usuario.cnhStatus
      }
    });
  } catch (error) {
    console.error('Erro no cadastro:', error);
    res.status(500).json({ error: error.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, senha } = req.body;

    // Buscar usuário
    const usuario = await prisma.user.findUnique({
      where: { email }
    });

    if (!usuario) {
      return res.status(401).json({ error: 'Email ou senha incorretos' });
    }

    // Verificar senha
    const senhaValida =
      usuario.senha && usuario.senha.startsWith('$2b$')
        ? await bcrypt.compare(senha, usuario.senha)
        : senha === usuario.senha;

    if (!senhaValida) {
      return res.status(401).json({ error: 'Email ou senha incorretos' });
    }

    // Gerar token JWT
    const token = jwt.sign(
      { id: usuario.id, email: usuario.email, tipo: usuario.tipo },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        telefone: usuario.telefone,
        tipo: usuario.tipo,
        cnhFrenteUri: usuario.cnhFrenteUri,
        cnhVersoUri: usuario.cnhVersoUri,
        cnhStatus: usuario.cnhStatus
      }
    });
  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ error: error.message });
  }
});

// Verificar token
router.get('/verificar', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ error: 'Token não fornecido' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    const usuario = await prisma.user.findUnique({
      where: { id: decoded.id }
    });

    if (!usuario) {
      return res.status(401).json({ error: 'Usuário não encontrado' });
    }

    res.json({
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        telefone: usuario.telefone,
        tipo: usuario.tipo,
        cnhFrenteUri: usuario.cnhFrenteUri,
        cnhVersoUri: usuario.cnhVersoUri,
        cnhStatus: usuario.cnhStatus
      }
    });
  } catch (error) {
    res.status(401).json({ error: 'Token inválido' });
  }
});

// Atualizar perfil básico
router.put('/atualizar/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, email, telefone } = req.body;

    if (!nome || !email) {
      return res.status(400).json({ erro: 'Nome e email são obrigatórios' });
    }

    // Garantir unicidade do email
    const emailJaUsado = await prisma.user.findFirst({
      where: {
        email,
        NOT: { id }
      }
    });

    if (emailJaUsado) {
      return res.status(400).json({ erro: 'Email já está em uso' });
    }

    const usuario = await prisma.user.update({
      where: { id },
      data: {
        nome,
        email,
        telefone
      }
    });

    res.json({
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      telefone: usuario.telefone,
      tipo: usuario.tipo,
      cnhFrenteUri: usuario.cnhFrenteUri,
      cnhVersoUri: usuario.cnhVersoUri,
      cnhStatus: usuario.cnhStatus
    });
  } catch (error) {
    console.error('Erro ao atualizar perfil:', error);
    res.status(500).json({ erro: 'Erro ao atualizar perfil' });
  }
});

module.exports = router;
