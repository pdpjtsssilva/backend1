const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const axios = require('axios');
const { emitirNovaSolicitacaoParaMotoristas, getCorridasAtivas } = require('../websocket');

const GOOGLE_MAPS_KEY = process.env.GOOGLE_MAPS_KEY || '';

const ensureGoogleKey = (res) => {
  if (!GOOGLE_MAPS_KEY) {
    res.status(500).json({ erro: 'Chave Google Maps nao configurada' });
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

    // Calcular distancia aproximada (Haversine)
    const R = 6371;
    const dLat = (destinoLat - origemLat) * Math.PI / 180;
    const dLon = (destinoLng - origemLng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(origemLat * Math.PI / 180) * Math.cos(destinoLat * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distancia = R * c;

    // Calcular preco (R$ 2 base + R$ 1.50 por km)
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
      res.status(400).json({ erro: 'Nao foi possivel calcular a rota' });
    }
  } catch (error) {
    console.error('Erro ao buscar rota:', error);
    res.status(500).json({ erro: 'Erro ao buscar rota' });
  }
});

// BUSCAR ENDERECO (Autocomplete)
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
        place_id: p.place_id,
        descricao: p.description,
        description: p.description,
        principal: p.structured_formatting.main_text,
        secundario: p.structured_formatting.secondary_text || ''
      }));
      res.json(sugestoes);
    } else {
      res.json([]);
    }
  } catch (error) {
    console.error('Erro ao buscar endereco:', error.message);
    res.status(500).json({ erro: 'Erro ao buscar endereco' });
  }
});

// OBTER COORDENADAS DE UM LUGAR
router.get('/lugar-coordenadas', async (req, res) => {
  try {
    const { placeId } = req.query;

    if (!placeId) {
      return res.status(400).json({ erro: 'Place ID e obrigatorio' });
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
      res.status(400).json({ erro: 'Nao foi possivel obter as coordenadas' });
    }
  } catch (error) {
    console.error('Erro ao buscar coordenadas:', error);
    res.status(500).json({ erro: 'Erro ao buscar coordenadas' });
  }
});

// LISTAR CORRIDAS ABERTAS (fallback para motoristas)
router.get('/abertas', async (_req, res) => {
  try {
    const corridasAtivas = getCorridasAtivas();
    const payload = Array.from(corridasAtivas.values())
      .filter((c) => c && c.status === 'aguardando')
      .slice(0, 5)
      .map((c) => ({
        corridaId: c.corridaId || c.id,
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

// LISTAR CORRIDAS DO USUARIO
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

// ACEITAR CORRIDA (Motorista)
router.patch('/:id/aceitar', async (req, res) => {
  try {
    const { id } = req.params;
    const { motoristaId, motoristaNome, motoristaLocalizacao } = req.body;

    if (!motoristaId) {
      return res.status(400).json({ erro: 'MotoristaId e obrigatorio' });
    }

    const corrida = await prisma.corrida.update({
      where: { id },
      data: { status: 'aceita', motoristaId }
    });

    // Fallback: emitir evento para passageiro via WS
    if (global.io) {
      global.io.emit('corrida:aceita', {
        corridaId: id,
        motoristaId,
        motoristaNome: motoristaNome || null,
        motoristaLocalizacao: motoristaLocalizacao || null
      });
    }

    res.json(corrida);
  } catch (error) {
    console.error('Erro ao aceitar corrida:', error);
    res.status(500).json({ erro: 'Erro ao aceitar corrida' });
  }
});

// FINALIZAR CORRIDA
router.patch('/:id/finalizar', async (req, res) => {
  try {
    const { id } = req.params;

    const corrida = await prisma.corrida.update({
      where: { id },
      data: { status: 'finalizada' }
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
