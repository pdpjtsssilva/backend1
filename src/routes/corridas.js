const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { emitirNovaSolicitacaoParaMotoristas } = require('../websocket');
const axios = require('axios');

const prisma = new PrismaClient();
const GOOGLE_MAPS_KEY = process.env.GOOGLE_MAPS_KEY || '';

const ensureGoogleKey = (res) => {
  if (!GOOGLE_MAPS_KEY) {
    res.status(500).json({ erro: 'Chave Google Maps não configurada' });
    return false;
  }
  return true;
};

// ========================================
// SOLICITAR CORRIDA
// ========================================
router.post('/solicitar', async (req, res) => {
  try {
    const { passageiroId, origemLat, origemLng, destinoLat, destinoLng, origemEndereco, destinoEndereco } = req.body;

    if (!passageiroId || !origemLat || !origemLng || !destinoLat || !destinoLng) {
      return res.status(400).json({ erro: 'Dados incompletos' });
    }

    // Calcular distância aproximada (Haversine)
    const R = 6371;
    const dLat = (destinoLat - origemLat) * Math.PI / 180;
    const dLon = (destinoLng - origemLng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(origemLat * Math.PI / 180) * Math.cos(destinoLat * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distancia = R * c;

    // Calcular preço (R$ 2 base + R$ 1.50 por km)
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

    res.status(201).json(corrida);
  } catch (error) {
    console.error('Erro ao solicitar corrida:', error);
    res.status(500).json({ erro: 'Erro ao solicitar corrida' });
  }
});

// ========================================
// BUSCAR ROTA (Google Directions API)
// ========================================
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
      res.status(400).json({ erro: 'Não foi possível calcular a rota' });
    }
  } catch (error) {
    console.error('Erro ao buscar rota:', error);
    res.status(500).json({ erro: 'Erro ao buscar rota' });
  }
});

// ========================================
// BUSCAR ENDEREÇO (Autocomplete)
// ========================================
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
    console.error('Erro ao buscar endereço:', error.message);
    res.status(500).json({ erro: 'Erro ao buscar endereço' });
  }
});

// ========================================
// OBTER COORDENADAS DE UM LUGAR
// ========================================
router.get('/lugar-coordenadas', async (req, res) => {
  try {
    const { placeId } = req.query;

    if (!placeId) {
      return res.status(400).json({ erro: 'Place ID é obrigatório' });
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
      res.status(400).json({ erro: 'Não foi possível obter as coordenadas' });
    }
  } catch (error) {
    console.error('Erro ao buscar coordenadas:', error);
    res.status(500).json({ erro: 'Erro ao buscar coordenadas' });
  }
});

// ========================================
// LISTAR CORRIDAS DO USUÁRIO
// ========================================
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

// ========================================
// LISTAR CORRIDAS DO MOTORISTA
// ========================================
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

// ========================================
// CANCELAR CORRIDA
// ========================================
router.patch('/:id/cancelar', async (req, res) => {
  try {
    const { id } = req.params;

    const corrida = await prisma.corrida.update({
      where: { id },
      data: { status: 'cancelada' }
    });

    res.json(corrida);
  } catch (error) {
    console.error('Erro ao cancelar corrida:', error);
    res.status(500).json({ erro: 'Erro ao cancelar corrida' });
  }
});

// ========================================
// ACEITAR CORRIDA (Motorista)
// ========================================
router.patch('/:id/aceitar', async (req, res) => {
  try {
    const { id } = req.params;
    const { motoristaId } = req.body;

    const corrida = await prisma.corrida.update({
      where: { id },
      data: {
        status: 'aceita',
        motoristaId
      }
    });

    res.json(corrida);
  } catch (error) {
    console.error('Erro ao aceitar corrida:', error);
    res.status(500).json({ erro: 'Erro ao aceitar corrida' });
  }
});

// ========================================
// FINALIZAR CORRIDA
// ========================================
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

module.exports = router;
