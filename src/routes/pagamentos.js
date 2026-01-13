const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const Stripe = require('stripe');

const prisma = new PrismaClient();
const stripeKey = process.env.STRIPE_SECRET_KEY || '';
const stripe = stripeKey ? new Stripe(stripeKey, { apiVersion: '2023-10-16' }) : null;
const stripeCurrency = process.env.STRIPE_DEFAULT_CURRENCY || 'brl';
const COMISSAO_PADRAO = 0.2; // 20% da corrida retida como comissao da plataforma

const toCents = (valor) => Math.round(Number(valor || 0) * 100);

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

// Listar cartões (somente dados mascarados salvos)
router.get('/cartoes/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const cartoes = await prisma.cartao.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });
    res.json(cartoes);
  } catch (error) {
    console.error('Erro ao buscar cartoes:', error);
    res.status(500).json({ erro: 'Erro ao buscar cartoes' });
  }
});

// Adicionar cartão (somente últimos 4 e bandeira, nada sensível)
router.post('/cartoes', async (req, res) => {
  try {
    const { userId, numero, nome, validade, bandeira = 'Visa' } = req.body;
    if (!userId || !numero || !nome || !validade) {
      return res.status(400).json({ erro: 'Dados incompletos' });
    }
    const last4 = `${numero}`.slice(-4);
    const numeroMascarado = `**** **** **** ${last4}`;
    const cartao = await prisma.cartao.create({
      data: {
        userId,
        numero: numeroMascarado,
        nome,
        validade,
        bandeira,
        principal: false
      }
    });
    res.status(201).json(cartao);
  } catch (error) {
    console.error('Erro ao adicionar cartao:', error);
    res.status(500).json({ erro: 'Erro ao adicionar cartao' });
  }
});

router.patch('/cartoes/:id/principal', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;
    await prisma.cartao.updateMany({ where: { userId }, data: { principal: false } });
    const cartao = await prisma.cartao.update({ where: { id }, data: { principal: true } });
    res.json(cartao);
  } catch (error) {
    console.error('Erro ao definir cartao principal:', error);
    res.status(500).json({ erro: 'Erro ao definir cartao principal' });
  }
});

router.delete('/cartoes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.cartao.delete({ where: { id } });
    res.json({ mensagem: 'Cartao removido com sucesso' });
  } catch (error) {
    console.error('Erro ao remover cartao:', error);
    res.status(500).json({ erro: 'Erro ao remover cartao' });
  }
});

// Saldo da carteira
router.get('/carteira/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const carteira = await ensureCarteira(userId);
    res.json(carteira);
  } catch (error) {
    console.error('Erro ao buscar carteira:', error);
    res.status(500).json({ erro: 'Erro ao buscar carteira' });
  }
});

// Adicionar saldo (via Stripe PaymentIntent para cartao/pix)
router.post('/carteira/adicionar', async (req, res) => {
  try {
    const { userId, valor, metodoPagamento, paymentMethodId } = req.body;
    const valorNumero = Number(valor);
    if (!userId || !valorNumero || valorNumero <= 0) {
      return res.status(400).json({ erro: 'Valor invalido' });
    }
    if (metodoPagamento === 'carteira') {
      return res.status(400).json({ erro: 'Recarga com carteira nao faz sentido' });
    }

    if (!stripe) {
      return res.status(501).json({ erro: 'Stripe nao configurado' });
    }

    const intent = await stripe.paymentIntents.create({
      amount: toCents(valorNumero),
      currency: stripeCurrency,
      payment_method: paymentMethodId,
      confirm: true,
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
      description: `Recarga carteira - user ${userId}`,
      metadata: { userId, context: 'recarga_carteira' }
    });

    if (intent.status !== 'succeeded') {
      return res.status(402).json({ erro: 'Pagamento nao autorizado', status: intent.status, clientSecret: intent.client_secret });
    }

    let carteira;
    try {
      carteira = await ensureCarteira(userId);
    } catch (err) {
      return res.status(404).json({ erro: 'Usuario nao encontrado para carteira' });
    }
    const novoSaldo = carteira.saldo + valorNumero;
    carteira = await prisma.carteira.update({
      where: { userId },
      data: { saldo: novoSaldo }
    });
    await prisma.transacao.create({
      data: {
        userId,
        tipo: 'credito',
        valor: valorNumero,
        descricao: `Recarga via ${metodoPagamento || 'cartao'}`,
        saldoAnterior: carteira.saldo - valorNumero,
        saldoNovo: novoSaldo
      }
    });

    res.json({ carteira, paymentIntentId: intent.id });
  } catch (error) {
    console.error('Erro ao adicionar saldo:', error);
    res.status(500).json({ erro: 'Erro ao adicionar saldo' });
  }
});

// Pagar corrida
router.post('/pagar', async (req, res) => {
  try {
    const { userId, corridaId, valor, metodoPagamento, paymentMethodId } = req.body;
    const valorNumero = Number(valor);
    if (!userId || !corridaId || !valorNumero || valorNumero <= 0) {
      return res.status(400).json({ erro: 'Dados invalidos' });
    }

    // Garantir corrida existe
    const corrida = await prisma.corrida.findUnique({ where: { id: corridaId } });
    if (!corrida) {
      return res.status(404).json({ erro: 'Corrida nao encontrada' });
    }
    if (corrida.status === 'paga') {
      return res.status(400).json({ erro: 'Corrida ja paga' });
    }
    const motoristaId = corrida.motoristaId;
    if (!motoristaId) {
      return res.status(400).json({ erro: 'Corrida sem motorista vinculado' });
    }

    const comissao = valorNumero * COMISSAO_PADRAO;
    const liquidoMotorista = valorNumero - comissao;

    if (metodoPagamento === 'carteira' || metodoPagamento === 'dinheiro') {
      // Debita comissao do motorista (para corridas em dinheiro ou se optar pagar via carteira)
      let carteira;
      try {
        carteira = await ensureCarteira(motoristaId);
      } catch (err) {
        return res.status(404).json({ erro: 'Motorista nao encontrado' });
      }
      if (carteira.saldo < comissao) {
        return res.status(400).json({ erro: 'Saldo insuficiente' });
      }
      const novoSaldo = carteira.saldo - comissao;
      await prisma.carteira.update({ where: { userId: motoristaId }, data: { saldo: novoSaldo } });
      await prisma.transacao.create({
        data: {
          userId: motoristaId,
          tipo: 'debito',
          valor: comissao,
          descricao: `Comissao corrida #${corridaId} (dinheiro/carteira)`,
          saldoAnterior: carteira.saldo,
          saldoNovo: novoSaldo
        }
      });
    } else {
      if (!stripe) {
        return res.status(501).json({ erro: 'Stripe nao configurado' });
      }
      if (!paymentMethodId) {
        return res.status(400).json({ erro: 'paymentMethodId obrigatorio para Stripe' });
      }
      const intent = await stripe.paymentIntents.create({
        amount: toCents(valorNumero),
        currency: stripeCurrency,
        payment_method: paymentMethodId,
        confirm: true,
        automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
        description: `Corrida ${corridaId}`,
        metadata: { userId, corridaId, motoristaId, context: 'corrida', metodoPagamento }
      });

      if (intent.status !== 'succeeded') {
        return res.status(402).json({ erro: 'Pagamento nao autorizado', status: intent.status, clientSecret: intent.client_secret });
      }

      // Registrar comissao (log) e credito liquido (log) para o motorista
      await prisma.transacao.create({
        data: {
          userId: motoristaId,
          tipo: 'debito',
          valor: comissao,
          descricao: `Comissao corrida #${corridaId} via ${metodoPagamento || 'cartao'}`,
          saldoAnterior: null,
          saldoNovo: null
        }
      });
      await prisma.transacao.create({
        data: {
          userId: motoristaId,
          tipo: 'credito',
          valor: liquidoMotorista,
          descricao: `Credito liquido corrida #${corridaId}`,
          saldoAnterior: null,
          saldoNovo: null
        }
      });
    }

    await prisma.corrida.update({
      where: { id: corridaId },
      data: { status: 'paga', metodoPagamento: metodoPagamento || 'cartao' }
    });

    res.json({ mensagem: 'Pagamento realizado com sucesso', metodoPagamento, valor: valorNumero });
  } catch (error) {
    console.error('Erro ao realizar pagamento:', error);
    res.status(500).json({ erro: 'Erro ao realizar pagamento' });
  }
});

router.get('/transacoes/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 50 } = req.query;
    const transacoes = await prisma.transacao.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit)
    });
    res.json(transacoes);
  } catch (error) {
    console.error('Erro ao buscar transacoes:', error);
    res.status(500).json({ erro: 'Erro ao buscar transacoes' });
  }
});

module.exports = router;
