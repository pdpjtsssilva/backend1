const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma'); // â† Prisma singleton
const { emitirNovaSolicitacaoParaMotoristas, corridasAtivas } = require('../websocket');
const axios = require('axios');

const GOOGLE_MAPS_KEY = process.env.GOOGLE_MAPS_KEY || 'AIzaSyB4C6Xnxmme3HU0_W6hVlLoprRwmw96o3I';

const ensureGoogleKey = (res) => {
  if (!GOOGLE_MAPS_KEY) {
    res.status(500).json({ erro: 'Chave Google Maps nÃ£o configurada' });
    return false;
  }
  return true;
};

// SOLICITAR CORRIDA
router.post('/solicitar', async (req, res) => {
  try {
    const { passageiroId, origemLat, origemLng, destinoLat, destinoLng, origemEndereco, destinoEndereco } = req.body;

    if (!passageiroId || !origemLat || !origemLng || !destinoLat || !destinoLng) {
      return res.status(400).json({ erro: 'Dados incompletos' });
    }
    console.log('Nova corrida solicitada (HTTP):', { passageiroId });

    // Calcular distÃ¢ncia aproximada (Haversine)
    const R = 6371;
    const dLat = (destinoLat - origemLat) * Math.PI / 180;
    const dLon = (destinoLng - origemLng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(origemLat * Math.PI / 180) * Math.cos(destinoLat * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distancia = R * c;

    // Calcular preÃ§o (R$ 2 base + R$ 1.50 por km)
    const preco = 2 + (distancia * 1.5);

    const corrida = await prisma.corrida.create({
      data: {
        passageiroId,
        origemLat,
        origemLng,
        origemEndereco: origemEndereco || `${origemLat.toFixed(4)}, ${origemLng.toFixed(4)}`,
        destinoLat,
        destinoLng,
        destinoEndereco: destinoEndereco || `${destinoLat.toFixed(4)}, ${destinoLng.toFixed(4)}`,
        distancia,
        preco,
        status: 'aguardando'
      }
    });

    // Limpar mÃ©todo de pagamento para forÃ§ar escolha na prÃ³xima corrida
    await prisma.user.update({
      where: { id: passageiroId },
      data: { metodoPagamentoPadrao: null }
    });

    try {
      const passageiro = await prisma.user.findUnique({
        where: { id: passageiroId },
        select: { nome: true }
      });
      emitirNovaSolicitacaoParaMotoristas({
        corridaId: corrida.id,
        passageiroId,
        passageiroNome: passageiro?.nome || null,
        origem: { latitude: origemLat, longitude: origemLng },
        destino: { latitude: destinoLat, longitude: destinoLng },
        origemEndereco: corrida.origemEndereco,
        destinoEndereco: corrida.destinoEndereco,
        preco: corrida.preco
      });
    } catch (err) {
      console.error('Erro ao notificar motoristas:', err.message);
    }

    res.status(201).json(corrida);
  } catch (error) {
    console.error('Erro ao solicitar corrida:', error);
    res.status(500).json({ erro: 'Erro ao solicitar corrida' });
  }
});

// BUSCAR ROTA (Google Directions API)
router.post('/rota', async (req, res) => {
  try {
    if (!ensureGoogleKey(res)) return;

    const { origemLat, origemLng, destinoLat, destinoLng } = req.body;

    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origemLat},${origemLng}&destination=${destinoLat},${destinoLng}&mode=driving&key=${GOOGLE_MAPS_KEY}`;
    const response = await axios.get(url);

    if (response.data.status === 'OK') {
      const route = response.data.routes[0];
      const leg = route.legs[0];

      res.json({
        distancia: leg.distance.value / 1000,
        duracao: leg.duration.value / 60,
        polyline: route.overview_polyline.points,
        passos: leg.steps.map(step => ({
          distancia: step.distance.text,
          duracao: step.duration.text,
          instrucao: step.html_instructions.replace(/<[^>]*>/g, ''),
          polyline: step.polyline.points
        }))
      });
    } else {
      res.status(400).json({ erro: 'NÃ£o foi possÃ­vel calcular a rota' });
    }
  } catch (error) {
    console.error('Erro ao buscar rota:', error);
    res.status(500).json({ erro: 'Erro ao buscar rota' });
  }
});

// BUSCAR ENDEREÃ‡O (Autocomplete)
router.get('/buscar-endereco', async (req, res) => {
  try {
    const { input } = req.query;

    if (!ensureGoogleKey(res)) return;

    if (!input || input.length < 3) {
      return res.json([]);
    }

    const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&key=${GOOGLE_MAPS_KEY}&language=pt-BR`;
    const response = await axios.get(url);

    if (response.data.status === 'OK') {
      const sugestoes = response.data.predictions.map(p => ({
        id: p.place_id,
        descricao: p.description,
        principal: p.structured_formatting.main_text,
        secundario: p.structured_formatting.secondary_text || ''
      }));
      res.json(sugestoes);
    } else {
      res.json([]);
    }
  } catch (error) {
    console.error('Erro ao buscar endereÃ§o:', error.message);
    res.status(500).json({ erro: 'Erro ao buscar endereÃ§o' });
  }
});

// OBTER COORDENADAS DE UM LUGAR
router.get('/lugar-coordenadas', async (req, res) => {
  try {
    const { placeId } = req.query;

    if (!placeId) {
      return res.status(400).json({ erro: 'Place ID Ã© obrigatÃ³rio' });
    }

    if (!ensureGoogleKey(res)) return;

    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=geometry&key=${GOOGLE_MAPS_KEY}`;
    const response = await axios.get(url);

    if (response.data.status === 'OK') {
      const location = response.data.result.geometry.location;
      res.json({
        latitude: location.lat,
        longitude: location.lng
      });
    } else {
      res.status(400).json({ erro: 'NÃ£o foi possÃ­vel obter as coordenadas' });
    }
  } catch (error) {
    console.error('Erro ao buscar coordenadas:', error);
    res.status(500).json({ erro: 'Erro ao buscar coordenadas' });
  }
});

// LISTAR CORRIDAS DO USUÃRIO
router.get('/usuario/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const corridas = await prisma.corrida.findMany({
      where: { passageiroId: id },
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    res.json(corridas);
  } catch (error) {
    console.error('Erro ao buscar corridas:', error);
    res.status(500).json({ erro: 'Erro ao buscar corridas' });
  }
});

// LISTAR CORRIDAS ABERTAS (fallback para motoristas)
router.get('/abertas', async (_req, res) => {
  try {
    const payload = Array.from(corridasAtivas.values())
      .filter((c) => c && c.status === 'aguardando')
      .slice(0, 5)
      .map((c) => ({
        corridaId: c.corridaId,
        passageiroId: c.passageiroId,
        passageiroNome: c.passageiroNome || null,
        origem: c.origem,
        destino: c.destino,
        origemEndereco: c.origemEndereco,
        destinoEndereco: c.destinoEndereco,
        preco: c.preco
      }));

    res.json(payload);
  } catch (error) {
    console.error('Erro ao buscar corridas abertas:', error);
    res.status(500).json({ erro: 'Erro ao buscar corridas abertas', detalhe: error.message });
  }
});
// LISTAR CORRIDAS DO MOTORISTA
router.get('/motorista/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const corridas = await prisma.corrida.findMany({
      where: { motoristaId: id },
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    res.json(corridas);
  } catch (error) {
    console.error('Erro ao buscar corridas do motorista:', error);
    res.status(500).json({ erro: 'Erro ao buscar corridas do motorista' });
  }
});

// OBTER CORRIDA POR ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const corrida = await prisma.corrida.findUnique({ where: { id } });
    if (!corrida) {
      return res.status(404).json({ erro: 'Corrida nao encontrada' });
    }
    res.json(corrida);
  } catch (error) {
    console.error('Erro ao buscar corrida:', error);
    res.status(500).json({ erro: 'Erro ao buscar corrida' });
  }
});

// CANCELAR CORRIDA
router.patch('/:id/cancelar', async (req, res) => {
  try {
    const { id } = req.params;
    const canceladoPor = req.body?.canceladoPor || null;

    const corrida = await prisma.corrida.update({
      where: { id },
      data: { status: 'cancelada', canceladoPor }
    });

    res.json(corrida);
  } catch (error) {
    console.error('Erro ao cancelar corrida:', error);
    res.status(500).json({ erro: 'Erro ao cancelar corrida' });
  }
});

// ACEITAR CORRIDA (Motorista) - CORRIGIDO COM TRANSAÃ‡ÃƒO
router.patch('/:id/aceitar', async (req, res) => {
  try {
    const { id } = req.params;
    const { motoristaId } = req.body;

    if (!motoristaId) {
      return res.status(400).json({ erro: 'MotoristaId Ã© obrigatÃ³rio' });
    }

    // Usa transaÃ§Ã£o para evitar race condition
    const corrida = await prisma.$transaction(async (tx) => {
      // 1. Busca a corrida atual
      const corridaAtual = await tx.corrida.findUnique({
        where: { id },
      });

      if (!corridaAtual) {
        throw new Error('CORRIDA_NAO_ENCONTRADA');
      }

      if (corridaAtual.status !== 'aguardando') {
        throw new Error('CORRIDA_JA_ACEITA');
      }

      // 2. Atualiza a corrida dentro da transaÃ§Ã£o
      return await tx.corrida.update({
        where: { id },
        data: {
          status: 'aceita',
          motoristaId,
        },
      });
    });

    res.json(corrida);
  } catch (error) {
    if (error.message === 'CORRIDA_NAO_ENCONTRADA') {
      return res.status(404).json({ erro: 'Corrida nÃ£o encontrada' });
    }
    if (error.message === 'CORRIDA_JA_ACEITA') {
      return res.status(409).json({ erro: 'Corrida nÃ£o estÃ¡ mais disponÃ­vel para aceite' });
    }
    console.error('Erro ao aceitar corrida:', error);
    res.status(500).json({ erro: 'Erro ao aceitar corrida' });
  }
});

// FINALIZAR CORRIDA
router.patch('/:id/finalizar', async (req, res) => {
  try {
    const { id } = req.params;

    // Buscar corrida com informaÃ§Ãµes do motorista
    const corrida = await prisma.corrida.findUnique({
      where: { id },
      include: { passageiro: true }
    });

    if (!corrida) {
      return res.status(404).json({ erro: 'Corrida nÃ£o encontrada' });
    }

    if (!corrida.motoristaId) {
      return res.status(400).json({ erro: 'Corrida sem motorista' });
    }

    // Atualizar status da corrida
    await prisma.corrida.update({
      where: { id },
      data: { status: 'finalizada' }
    });

    // Buscar ou criar carteira do motorista
    let carteira = await prisma.carteira.findUnique({
      where: { userId: corrida.motoristaId }
    });

    if (!carteira) {
      carteira = await prisma.carteira.create({
        data: { userId: corrida.motoristaId, saldo: 0 }
      });
    }

    // Calcular valores (comissÃ£o de 20%)
    const TAXA_COMISSAO = 0.20;
    const valorTotal = corrida.preco;
    const comissao = valorTotal * TAXA_COMISSAO;
    const valorMotorista = valorTotal - comissao;

    const saldoAnterior = carteira.saldo;
    const saldoNovo = saldoAnterior + valorMotorista;

    // Criar transaÃ§Ã£o de crÃ©dito para o motorista
    await prisma.transacao.create({
      data: {
        userId: corrida.motoristaId,
        tipo: 'credito',
        valor: valorMotorista,
        descricao: `Corrida ${id.substring(0, 8)} - ${corrida.passageiro.nome}`,
        categoria: 'recebimento',
        metodoPagamento: corrida.metodoPagamento || 'app',
        status: 'aprovada',
        referencia: id,
        saldoAnterior,
        saldoNovo
      }
    });

    // Criar transaÃ§Ã£o de dÃ©bito (comissÃ£o da plataforma)
    await prisma.transacao.create({
      data: {
        userId: corrida.motoristaId,
        tipo: 'debito',
        valor: comissao,
        descricao: `ComissÃ£o (20%) - Corrida ${id.substring(0, 8)}`,
        categoria: 'comissao',
        metodoPagamento: corrida.metodoPagamento || 'app',
        status: 'aprovada',
        referencia: id,
        saldoAnterior: saldoNovo,
        saldoNovo: saldoNovo
      }
    });

    // Atualizar saldo da carteira
    await prisma.carteira.update({
      where: { userId: corrida.motoristaId },
      data: { saldo: saldoNovo }
    });

    // Limpar mÃ©todo de pagamento do passageiro para prÃ³xima corrida
    await prisma.user.update({
      where: { id: corrida.passageiroId },
      data: { metodoPagamentoPadrao: null }
    });

    res.json(corrida);
  } catch (error) {
    console.error('Erro ao finalizar corrida:', error);
    res.status(500).json({ erro: 'Erro ao finalizar corrida' });
  }
});

// AVALIAR CORRIDA
router.put('/:id/avaliar', async (req, res) => {
  try {
    const { id } = req.params;
    const { avaliacao, comentario } = req.body;
    const nota = Number(avaliacao);
    if (!Number.isFinite(nota) || nota < 1 || nota > 5) {
      return res.status(400).json({ error: 'Avaliacao invalida' });
    }

    const corrida = await prisma.corrida.update({
      where: { id },
      data: {
        avaliacao: nota,
        comentarioAvaliacao: comentario || null
      }
    });

    res.json(corrida);
  } catch (error) {
    console.error('Erro ao avaliar corrida:', error);
    res.status(500).json({ erro: 'Erro ao avaliar corrida' });
  }
});

module.exports = router;
