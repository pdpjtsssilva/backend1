const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma'); // ← Prisma singleton

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET deve ser definido no arquivo .env');
}

const SIGNUP_TOKEN = process.env.SIGNUP_TOKEN || '';

const validate = require('../middlewares/validate');
const { z } = require('zod');

// Schemas de Validação
const cadastroSchema = z.object({
  body: z.object({
    nome: z.string().min(3, 'Nome deve ter no mínimo 3 caracteres'),
    email: z.string().email('Email inválido'),
    senha: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
    telefone: z.string().optional(),
    documento: z.string().optional(),
    tipo: z.enum(['passageiro', 'motorista']).optional(),
    signupToken: z.string().optional(),
  }),
});

// Cadastro
router.post('/cadastro', validate(cadastroSchema), async (req, res) => {
  try {
    const { nome, email, senha, telefone, tipo, documento, signupToken } = req.body;
    const emailLimpo = email.trim().toLowerCase();

    if (process.env.DEBUG_AUTH === '1') {
      console.log('AUTH cadastro payload', {
        hasBody: !!req.body,
        keys: req.body ? Object.keys(req.body).filter(k => k !== 'senha') : [],
        emailType: typeof email,
        nomeType: typeof nome
      });
    }

    // Se SIGNUP_TOKEN estiver definido no .env, exigir token de convite
    if (SIGNUP_TOKEN) {
      const tokenHeader = req.headers['x-signup-token'];
      const provided = signupToken || tokenHeader;
      if (provided !== SIGNUP_TOKEN) {
        return res.status(403).json({ error: 'Cadastro bloqueado. Token inválido ou ausente.' });
      }
    }

    // Verificar se email já existe
    const usuarioExistente = await prisma.user.findUnique({
      where: { email: emailLimpo }
    });

    if (usuarioExistente) {
      return res.status(400).json({ error: 'Email ja cadastrado' });
    }

    const documentoLimpo = documento?.trim();
    if (documentoLimpo) {
      const documentoExistente = await prisma.user.findFirst({
        where: { documento: documentoLimpo }
      });
      if (documentoExistente) {
        return res.status(400).json({ error: 'Documento ja cadastrado' });
      }
    }

    // Hash da senha
    const senhaHash = await bcrypt.hash(senha, 10);

    // Criar usuário
    const usuario = await prisma.user.create({
      data: {
        nome,
        email: emailLimpo,
        senha: senhaHash,
        telefone,
        documento: documentoLimpo || null,
        tipo: tipo || 'passageiro'
      }
    });

    // Gerar token JWT
    const token = jwt.sign(
      { id: usuario.id, email: usuario.email, tipo: usuario.tipo },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // REMOVIDO: Validação de statusConta aqui (era um bug)
    // Usuário recém-criado sempre terá statusConta = 'ativo'

    res.json({
      token,
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        telefone: usuario.telefone,
        documento: usuario.documento,
        tipo: usuario.tipo,
        cnhFrenteUri: usuario.cnhFrenteUri,
        cnhVersoUri: usuario.cnhVersoUri,
        cnhStatus: usuario.cnhStatus,
        statusConta: usuario.statusConta,
        suspensoAte: usuario.suspensoAte
      }
    });
  } catch (error) {
    console.error('Erro no cadastro:', error);
    res.status(500).json({ error: error.message });
  }
});

const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Email inválido'),
    senha: z.string().min(1, 'Senha é obrigatória'),
  }),
});

// Login
router.post('/login', validate(loginSchema), async (req, res) => {
  try {
    const { email, senha } = req.body;
    const emailLimpo = email.trim().toLowerCase();

    if (process.env.DEBUG_AUTH === '1') {
      console.log('AUTH login payload', {
        hasBody: !!req.body,
        keys: req.body ? Object.keys(req.body).filter(k => k !== 'senha') : [],
        emailType: typeof email
      });
    }

    // Buscar usuário
    const usuario = await prisma.user.findUnique({
      where: { email: emailLimpo }
    });

    if (!usuario) {
      return res.status(401).json({ error: 'Email ou senha incorretos' });
    }

    if (usuario.statusConta === 'bloqueado') {
      return res.status(403).json({ error: 'Conta bloqueada pelo administrador' });
    }

    if (usuario.statusConta === 'suspenso' && usuario.suspensoAte && new Date(usuario.suspensoAte) > new Date()) {
      return res.status(403).json({ error: 'Conta suspensa temporariamente' });
    }

    // Verificar senha - SEMPRE com bcrypt (BUG CORRIGIDO)
    const senhaValida = await bcrypt.compare(senha, usuario.senha);

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
        documento: usuario.documento,
        tipo: usuario.tipo,
        cnhFrenteUri: usuario.cnhFrenteUri,
        cnhVersoUri: usuario.cnhVersoUri,
        cnhStatus: usuario.cnhStatus,
        statusConta: usuario.statusConta,
        suspensoAte: usuario.suspensoAte
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
        documento: usuario.documento,
        tipo: usuario.tipo,
        cnhFrenteUri: usuario.cnhFrenteUri,
        cnhVersoUri: usuario.cnhVersoUri,
        cnhStatus: usuario.cnhStatus,
        statusConta: usuario.statusConta,
        suspensoAte: usuario.suspensoAte
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
    const { nome, email, telefone, documento } = req.body;

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
      return res.status(400).json({ erro: 'Email ja esta em uso' });
    }

    const documentoLimpo = documento?.trim();
    if (documentoLimpo) {
      const documentoJaUsado = await prisma.user.findFirst({
        where: {
          documento: documentoLimpo,
          NOT: { id }
        }
      });
      if (documentoJaUsado) {
        return res.status(400).json({ erro: 'Documento ja esta em uso' });
      }
    }

    const usuario = await prisma.user.update({
      where: { id },
      data: {
        nome,
        email,
        telefone,
        documento: documentoLimpo || null
      }
    });

    res.json({
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      telefone: usuario.telefone,
      documento: usuario.documento,
      tipo: usuario.tipo,
      cnhFrenteUri: usuario.cnhFrenteUri,
      cnhVersoUri: usuario.cnhVersoUri,
      cnhStatus: usuario.cnhStatus,
      statusConta: usuario.statusConta,
      suspensoAte: usuario.suspensoAte
    });
  } catch (error) {
    console.error('Erro ao atualizar perfil:', error);
    res.status(500).json({ erro: 'Erro ao atualizar perfil' });
  }
});

module.exports = router;