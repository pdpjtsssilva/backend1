const express = require('express');
// Prisma singleton
const Stripe = require('stripe');
const { motoristasOnline } = require('../websocket');

const router = express.Router();
const prisma = require('../lib/prisma');
const stripeKey = process.env.STRIPE_SECRET_KEY || '';
const stripe = stripeKey ? new Stripe(stripeKey, { apiVersion: '2023-10-16' }) : null;

async function ensureCarteira(userId) {
  const usuario = await prisma.user.findUnique({ where: { id: userId } });
  if (!usuario) {
    throw new Error('Usuario nao encontrado para carteira');
  }
  let carteira = await prisma.carteira.findUnique({ where: { userId } });
  if (!carteira) {
    carteira = await prisma.carteira.create({ data: { userId, saldo: 0 } });
  }
  return carteira;
}

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
    const { tipo, status, search } = req.query;
    const filters = [];
    if (tipo) filters.push({ tipo });
    if (status) filters.push({ statusConta: status });
    if (search) {
      filters.push({
        OR: [
          { nome: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { documento: { contains: search, mode: 'insensitive' } }
        ]
      });
    }
    const where = filters.length ? { AND: filters } : {};
    const usuarios = await prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
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
        documento: true,
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

    const isMotorista = usuario.tipo === 'motorista';

    const carros = isMotorista
      ? await prisma.carro.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' }
      })
      : [];

    const corridas = await prisma.corrida.findMany({
      where: isMotorista ? { motoristaId: id } : { passageiroId: id },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    const corridasResumo = await prisma.corrida.aggregate({
      where: isMotorista ? { motoristaId: id } : { passageiroId: id },
      _count: { _all: true },
      _sum: { preco: true }
    });

    const avaliacaoResumo = isMotorista
      ? await prisma.corrida.aggregate({
        where: { motoristaId: id, avaliacao: { not: null } },
        _count: { avaliacao: true },
        _avg: { avaliacao: true }
      })
      : await prisma.corrida.aggregate({
        where: { passageiroId: id, avaliacao: { not: null } },
        _count: { avaliacao: true },
        _avg: { avaliacao: true }
      });

    const ganhosCredito = isMotorista
      ? await prisma.transacao.aggregate({
        where: { userId: id, tipo: 'credito' },
        _sum: { valor: true }
      })
      : { _sum: { valor: 0 } };
    const ganhosDebito = isMotorista
      ? await prisma.transacao.aggregate({
        where: { userId: id, tipo: 'debito' },
        _sum: { valor: true }
      })
      : { _sum: { valor: 0 } };

    const creditos = ganhosCredito._sum.valor || 0;
    const debitos = ganhosDebito._sum.valor || 0;

    res.json({
      usuario,
      carros,
      corridas,
      resumo: {
        totalCorridas: corridasResumo._count._all || 0,
        totalFaturado: corridasResumo._sum.preco || 0,
        totalAvaliacoes: avaliacaoResumo._count.avaliacao || 0,
        avaliacaoMedia: avaliacaoResumo._avg.avaliacao || 0
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

    const motoristaIds = Array.from(
      new Set(
        corridas
          .map((c) => [c.motoristaId, c.ultimaRecusaMotoristaId])
          .flat()
          .filter(Boolean)
      )
    );
    const motoristas = motoristaIds.length
      ? await prisma.user.findMany({
        where: { id: { in: motoristaIds } },
        select: { id: true, nome: true, email: true, telefone: true }
      })
      : [];
    const motoristaMap = new Map(motoristas.map((m) => [m.id, m]));

    const payload = corridas.map((c) => ({
      ...c,
      motorista: c.motoristaId ? (motoristaMap.get(c.motoristaId) || null) : null,
      ultimaRecusaMotorista: c.ultimaRecusaMotoristaId
        ? (motoristaMap.get(c.ultimaRecusaMotoristaId) || null)
        : null
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
    const { tipo, limit = 50, startDate, endDate, metodo, status, categoria, search } = req.query;
    const filters = [];
    if (tipo) filters.push({ tipo });
    if (metodo) filters.push({ metodoPagamento: metodo });
    if (status) filters.push({ status });
    if (categoria) filters.push({ categoria });
    if (startDate || endDate) {
      const createdAt = {};
      if (startDate) createdAt.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        createdAt.lte = end;
      }
      filters.push({ createdAt });
    }
    if (search) {
      filters.push({
        OR: [
          { descricao: { contains: search, mode: 'insensitive' } },
          { referencia: { contains: search, mode: 'insensitive' } },
          { usuario: { nome: { contains: search, mode: 'insensitive' } } },
          { usuario: { email: { contains: search, mode: 'insensitive' } } }
        ]
      });
    }
    const where = filters.length ? { AND: filters } : {};
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

router.get('/transacoes/export', async (req, res) => {
  try {
    const { tipo, startDate, endDate, metodo, status, categoria, search } = req.query;
    const filters = [];
    if (tipo) filters.push({ tipo });
    if (metodo) filters.push({ metodoPagamento: metodo });
    if (status) filters.push({ status });
    if (categoria) filters.push({ categoria });
    if (startDate || endDate) {
      const createdAt = {};
      if (startDate) createdAt.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        createdAt.lte = end;
      }
      filters.push({ createdAt });
    }
    if (search) {
      filters.push({
        OR: [
          { descricao: { contains: search, mode: 'insensitive' } },
          { referencia: { contains: search, mode: 'insensitive' } },
          { usuario: { nome: { contains: search, mode: 'insensitive' } } },
          { usuario: { email: { contains: search, mode: 'insensitive' } } }
        ]
      });
    }
    const where = filters.length ? { AND: filters } : {};
    const transacoes = await prisma.transacao.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        usuario: {
          select: { id: true, nome: true, email: true, telefone: true }
        }
      }
    });

    const header = [
      'data',
      'usuario',
      'email',
      'tipo',
      'categoria',
      'metodo',
      'status',
      'valor',
      'descricao',
      'referencia'
    ];
    const rows = transacoes.map((t) => [
      t.createdAt?.toISOString() || '',
      t.usuario?.nome || '',
      t.usuario?.email || '',
      t.tipo || '',
      t.categoria || '',
      t.metodoPagamento || '',
      t.status || '',
      t.valor != null ? t.valor : '',
      t.descricao || '',
      t.referencia || ''
    ]);

    const csv = [header, ...rows]
      .map((line) => line.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="transacoes.csv"');
    res.send(csv);
  } catch (error) {
    console.error('Erro ao exportar transacoes:', error);
    res.status(500).json({ erro: 'Erro ao exportar transacoes' });
  }
});

router.get('/financeiro/resumo', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const createdAt = {};
    if (startDate) createdAt.gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      createdAt.lte = end;
    }
    const where = Object.keys(createdAt).length ? { createdAt } : {};

    const [total, comissao, reembolsos] = await Promise.all([
      prisma.transacao.aggregate({
        where,
        _sum: { valor: true },
        _count: { _all: true }
      }),
      prisma.transacao.aggregate({
        where: { ...where, categoria: 'comissao' },
        _sum: { valor: true }
      }),
      prisma.transacao.aggregate({
        where: { ...where, categoria: 'reembolso' },
        _sum: { valor: true }
      })
    ]);

    res.json({
      totalTransacoes: total._count._all || 0,
      totalValor: total._sum.valor || 0,
      totalComissao: comissao._sum.valor || 0,
      totalReembolsos: reembolsos._sum.valor || 0
    });
  } catch (error) {
    console.error('Erro ao carregar resumo financeiro:', error);
    res.status(500).json({ erro: 'Erro ao carregar resumo financeiro' });
  }
});

router.post('/reembolsos', async (req, res) => {
  try {
    const { transacaoId, motivo } = req.body;
    if (!transacaoId) {
      return res.status(400).json({ erro: 'transacaoId obrigatorio' });
    }
    const transacao = await prisma.transacao.findUnique({
      where: { id: transacaoId },
      include: { usuario: true }
    });
    if (!transacao) {
      return res.status(404).json({ erro: 'Transacao nao encontrada' });
    }
    if (transacao.status === 'reembolsada') {
      return res.status(400).json({ erro: 'Transacao ja reembolsada' });
    }

    const metodo = transacao.metodoPagamento || 'cartao';
    if (metodo === 'carteira') {
      const carteira = await ensureCarteira(transacao.userId);
      const novoSaldo = carteira.saldo + transacao.valor;
      await prisma.carteira.update({ where: { userId: transacao.userId }, data: { saldo: novoSaldo } });
    } else if (metodo === 'cartao') {
      if (!stripe) {
        return res.status(501).json({ erro: 'Stripe nao configurado' });
      }
      if (!transacao.gatewayId) {
        return res.status(400).json({ erro: 'GatewayId ausente para reembolso' });
      }
      await stripe.refunds.create({ payment_intent: transacao.gatewayId });
    } else {
      return res.status(400).json({ erro: 'Reembolso manual necessario para dinheiro' });
    }

    await prisma.transacao.update({
      where: { id: transacaoId },
      data: { status: 'reembolsada' }
    });

    const reembolso = await prisma.transacao.create({
      data: {
        userId: transacao.userId,
        tipo: 'credito',
        valor: transacao.valor,
        descricao: `Reembolso ${transacao.referencia || transacao.id}${motivo ? ` - ${motivo}` : ''}`,
        categoria: 'reembolso',
        metodoPagamento: metodo,
        status: 'aprovada',
        referencia: transacao.referencia || transacao.id,
        saldoAnterior: null,
        saldoNovo: null
      }
    });

    res.json({ mensagem: 'Reembolso processado', reembolso });
  } catch (error) {
    console.error('Erro ao processar reembolso:', error);
    res.status(500).json({ erro: 'Erro ao processar reembolso' });
  }
});

// Dashboard: estatisticas em tempo real
router.get('/dashboard', async (_req, res) => {
  try {
    const now = new Date();
    const startDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startWeek = new Date(now);
    startWeek.setDate(now.getDate() - 6);
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [usuariosTotal, usuariosPassageiros, usuariosMotoristas] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { tipo: 'passageiro' } }),
      prisma.user.count({ where: { tipo: 'motorista' } })
    ]);

    const [corridasHoje, corridasSemana, corridasMes] = await Promise.all([
      prisma.corrida.count({ where: { createdAt: { gte: startDay } } }),
      prisma.corrida.count({ where: { createdAt: { gte: startWeek } } }),
      prisma.corrida.count({ where: { createdAt: { gte: startMonth } } })
    ]);

    const receitaTotal = await prisma.corrida.aggregate({
      where: { status: 'paga' },
      _sum: { preco: true }
    });
    const receita = receitaTotal._sum.preco || 0;
    const comissao = receita * 0.2;

    const corridasEmAndamento = await prisma.corrida.count({
      where: { status: { in: ['aceita', 'em_andamento', 'chegou', 'em_viagem'] } }
    });

    const motoristasAtivos = Array.from(motoristasOnline.values()).filter((m) => m).length;

    const dias = Array.from({ length: 7 }, (_, idx) => {
      const day = new Date(now);
      day.setDate(now.getDate() - (6 - idx));
      return new Date(day.getFullYear(), day.getMonth(), day.getDate());
    });
    const corridasSemanaRaw = await Promise.all(
      dias.map((day) => {
        const next = new Date(day);
        next.setDate(day.getDate() + 1);
        return prisma.corrida.count({ where: { createdAt: { gte: day, lt: next } } });
      })
    );

    res.json({
      usuarios: {
        total: usuariosTotal,
        passageiros: usuariosPassageiros,
        motoristas: usuariosMotoristas
      },
      corridas: {
        hoje: corridasHoje,
        semana: corridasSemana,
        mes: corridasMes,
        emAndamento: corridasEmAndamento
      },
      receita: {
        total: receita,
        comissao
      },
      motoristasAtivos,
      graficoSemanal: dias.map((day, idx) => ({
        data: day.toISOString().slice(0, 10),
        total: corridasSemanaRaw[idx]
      }))
    });
  } catch (error) {
    console.error('Erro ao carregar dashboard:', error);
    res.status(500).json({ erro: 'Erro ao carregar dashboard' });
  }
});

// ========================================
// AVALIACOES
// ========================================
router.get('/avaliacoes', async (req, res) => {
  try {
    const { limit = 50, motoristaId, minNota, maxNota } = req.query;

    const where = {
      avaliacao: { not: null }
    };

    if (motoristaId) where.motoristaId = motoristaId;
    if (minNota) where.avaliacao = { gte: Number(minNota) };
    if (maxNota) where.avaliacao = { ...where.avaliacao, lte: Number(maxNota) };

    const avaliacoes = await prisma.corrida.findMany({
      where,
      select: {
        id: true,
        avaliacao: true,
        comentarioAvaliacao: true,
        motoristaId: true,
        passageiroId: true,
        preco: true,
        createdAt: true,
        passageiro: {
          select: {
            id: true,
            nome: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: Number(limit)
    });

    // Buscar nomes dos motoristas
    const motoristasIds = [...new Set(avaliacoes.map(a => a.motoristaId).filter(Boolean))];
    const motoristas = await prisma.user.findMany({
      where: { id: { in: motoristasIds } },
      select: { id: true, nome: true }
    });

    const motoristasMap = new Map(motoristas.map(m => [m.id, m]));

    const resultado = avaliacoes.map(av => ({
      id: av.id,
      nota: av.avaliacao,
      comentario: av.comentarioAvaliacao,
      motorista: motoristasMap.get(av.motoristaId) || { id: av.motoristaId, nome: 'Desconhecido' },
      passageiro: av.passageiro,
      preco: av.preco,
      data: av.createdAt
    }));

    res.json(resultado);
  } catch (error) {
    console.error('Erro ao buscar avaliacoes:', error);
    res.status(500).json({ erro: 'Erro ao buscar avaliacoes' });
  }
});

module.exports = router;   
 