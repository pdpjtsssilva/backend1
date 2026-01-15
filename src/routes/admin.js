const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { motoristasOnline } = require('../websocket');

const router = express.Router();
const prisma = new PrismaClient();

// Middleware de auth basico para admin
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

// Listar motoristas online (posicao em tempo real)
router.get('/motoristas-online', (_req, res) => {
  const online = Array.from(motoristasOnline.entries()).map(([motoristaId, data]) => ({
    motoristaId,
    nome: data.nome,
    localizacao: data.localizacao || null,
    disponivel: data.disponivel,
    corridaAtual: data.corridaAtual || null
  }));
  res.json(online);
});

// Listar usuarios (foco motoristas) com CNH
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
        statusConta: true,
        suspensoAte: true,
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

// Atualizar status da conta (ativo, bloqueado, suspenso)
router.patch('/usuarios/:id/status-conta', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, suspensoAte } = req.body;
    if (!status) return res.status(400).json({ erro: 'status obrigatorio' });

    const statusPermitidos = ['ativo', 'bloqueado', 'suspenso'];
    if (!statusPermitidos.includes(status)) {
      return res.status(400).json({ erro: 'status invalido' });
    }

    const data = { statusConta: status };
    if (status === 'suspenso') {
      if (suspensoAte) {
        const parsed = new Date(suspensoAte);
        if (Number.isNaN(parsed.getTime())) {
          return res.status(400).json({ erro: 'suspensoAte invalido' });
        }
        data.suspensoAte = parsed;
      } else {
        data.suspensoAte = null;
      }
    } else {
      data.suspensoAte = null;
    }

    const usuario = await prisma.user.update({
      where: { id },
      data
    });
    res.json({
      id: usuario.id,
      statusConta: usuario.statusConta,
      suspensoAte: usuario.suspensoAte
    });
  } catch (error) {
    console.error('Erro ao atualizar status da conta:', error);
    res.status(500).json({ erro: 'Erro ao atualizar status da conta' });
  }
});

// Detalhes do motorista (documentos, carros, corridas, ganhos)
router.get('/usuarios/:id/detalhes', async (req, res) => {
  try {
    const { id } = req.params;
    const usuario = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        nome: true,
        email: true,
        telefone: true,
        tipo: true,
        cnhFrenteUri: true,
        cnhVersoUri: true,
        cnhStatus: true,
        statusConta: true,
        suspensoAte: true,
        createdAt: true
      }
    });
    if (!usuario) return res.status(404).json({ erro: 'Usuario nao encontrado' });

    const carros = await prisma.carro.findMany({
      where: { userId: id },
      orderBy: { createdAt: 'desc' }
    });

    const corridas = await prisma.corrida.findMany({
      where: { motoristaId: id },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    const corridasResumo = await prisma.corrida.aggregate({
      where: { motoristaId: id },
      _count: { _all: true },
      _sum: { preco: true }
    });

    const ganhosCredito = await prisma.transacao.aggregate({
      where: { userId: id, tipo: 'credito' },
      _sum: { valor: true }
    });
    const ganhosDebito = await prisma.transacao.aggregate({
      where: { userId: id, tipo: 'debito' },
      _sum: { valor: true }
    });

    const creditos = ganhosCredito._sum.valor || 0;
    const debitos = ganhosDebito._sum.valor || 0;

    res.json({
      usuario,
      carros,
      corridas,
      resumo: {
        totalCorridas: corridasResumo._count._all || 0,
        totalFaturado: corridasResumo._sum.preco || 0
      },
      ganhos: {
        creditos,
        debitos,
        liquido: creditos - debitos
      }
    });
  } catch (error) {
    console.error('Erro ao buscar detalhes do motorista:', error);
    res.status(500).json({ erro: 'Erro ao buscar detalhes do motorista' });
  }
});

// Listar corridas para o painel admin
router.get('/corridas', async (req, res) => {
  try {
    const { status, limit = 50 } = req.query;
    const where = status ? { status } : {};
    const corridas = await prisma.corrida.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Number(limit) || 50,
      include: {
        passageiro: {
          select: { id: true, nome: true, email: true, telefone: true }
        }
      }
    });

    const motoristaIds = Array.from(new Set(corridas.map((c) => c.motoristaId).filter(Boolean)));
    const motoristas = motoristaIds.length
      ? await prisma.user.findMany({
        where: { id: { in: motoristaIds } },
        select: { id: true, nome: true, email: true, telefone: true }
      })
      : [];
    const motoristaMap = new Map(motoristas.map((m) => [m.id, m]));

    const payload = corridas.map((c) => ({
      ...c,
      motorista: c.motoristaId ? (motoristaMap.get(c.motoristaId) || null) : null
    }));

    res.json(payload);
  } catch (error) {
    console.error('Erro ao listar corridas:', error);
    res.status(500).json({ erro: 'Erro ao listar corridas' });
  }
});

// Listar transacoes (pagamentos) para o painel admin
router.get('/transacoes', async (req, res) => {
  try {
    const { tipo, limit = 50 } = req.query;
    const where = tipo ? { tipo } : {};
    const transacoes = await prisma.transacao.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Number(limit) || 50,
      include: {
        usuario: {
          select: { id: true, nome: true, email: true, telefone: true }
        }
      }
    });
    res.json(transacoes);
  } catch (error) {
    console.error('Erro ao listar transacoes:', error);
    res.status(500).json({ erro: 'Erro ao listar transacoes' });
  }
});

module.exports = router;
