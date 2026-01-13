const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Middleware de auth básico para admin
const adminUser = process.env.ADMIN_USER || 'admin';
const adminPass = process.env.ADMIN_PASS || 'admin123';
const basicAuth = (req, res, next) => {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="admin"');
    return res.status(401).send('Auth required');
  }
  const creds = Buffer.from(header.replace('Basic ', ''), 'base64').toString().split(':');
  const [user, pass] = creds;
  if (user === adminUser && pass === adminPass) return next();
  res.set('WWW-Authenticate', 'Basic realm="admin"');
  return res.status(401).send('Invalid credentials');
};

// Recebe alertas do app (mudanca de veiculo)
router.post('/alertas', async (req, res) => {
  try {
    const { tipo, acao, motoristaId, carroId, dados } = req.body;
    if (!tipo || !acao || !motoristaId) {
      return res.status(400).json({ erro: 'Campos obrigatorios: tipo, acao, motoristaId' });
    }

    const alerta = await prisma.alertaAdmin.create({
      data: {
        tipo,
        acao,
        motoristaId,
        carroId: carroId || null,
        dados: dados ? JSON.stringify(dados) : null
      }
    });

    res.status(201).json(alerta);
  } catch (error) {
    console.error('Erro ao registrar alerta admin:', error);
    res.status(500).json({ erro: 'Erro ao registrar alerta' });
  }
});

// Rotas protegidas
router.use(basicAuth);

// Listar usuários (foco motoristas) com CNH
router.get('/usuarios', async (req, res) => {
  try {
    const { tipo } = req.query;
    const where = tipo ? { tipo } : {};
    const usuarios = await prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        nome: true,
        email: true,
        telefone: true,
        tipo: true,
        cnhFrenteUri: true,
        cnhVersoUri: true,
        cnhStatus: true,
        createdAt: true
      }
    });
    res.json(usuarios);
  } catch (error) {
    console.error('Erro ao listar usuarios:', error);
    res.status(500).json({ erro: 'Erro ao listar usuarios' });
  }
});

// Atualizar status da CNH
router.patch('/usuarios/:id/cnh-status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // aprovado, reprovado, pendente
    if (!status) return res.status(400).json({ erro: 'status obrigatorio' });

    const usuario = await prisma.user.update({
      where: { id },
      data: { cnhStatus: status }
    });
    res.json({
      id: usuario.id,
      cnhStatus: usuario.cnhStatus,
      cnhFrenteUri: usuario.cnhFrenteUri,
      cnhVersoUri: usuario.cnhVersoUri
    });
  } catch (error) {
    console.error('Erro ao atualizar status da CNH:', error);
    res.status(500).json({ erro: 'Erro ao atualizar status da CNH' });
  }
});

module.exports = router;
