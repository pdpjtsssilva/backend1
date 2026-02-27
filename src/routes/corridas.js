const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const axios = require('axios');
const { 
  emitirNovaSolicitacaoParaMotoristas, 
  finalizarSolicitacaoNoSocket 
} = require('../websocket');

// Chave recuperada do seu config.js enviado
const GOOGLE_MAPS_KEY = process.env.GOOGLE_MAPS_KEY || 'AIzaSyB4C6Xnxmme3HU0_W6hVlLoprRwmw96o3I';

/**
 * 1. BUSCA DE ENDEREÇO (Autocomplete)
 * Resolve o erro do "tracinho" enviando múltiplos formatos de texto.
 */
router.get('/buscar-endereco', async (req, res) => {
  try {
    const { input } = req.query;
    if (!input || input.length < 3) return res.json([]);

    const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&key=${GOOGLE_MAPS_KEY}&language=pt-BR`;
    const response = await axios.get(req.url.includes('http') ? url : url); // Garante a URL correta

    if (response.data.status === 'OK') {
      const sugestoes = response.data.predictions.map(p => ({
        id: p.place_id,
        place_id: p.place_id,
        // Enviamos vários nomes de campos para o App encontrar um válido
        description: p.description, 
        descricao: p.description,
        text: p.description,
        label: p.description,
        titulo: p.structured_formatting.main_text
      }));
      return res.json(sugestoes);
    }
    res.json([]);
  } catch (error) {
    console.error('Erro Google Autocomplete:', error);
    res.status(500).json({ erro: 'Erro na busca' });
  }
});

/**
 * 2. OBTER COORDENADAS
 * Resolve o erro "não foi possível obter as coordenadas".
 */
router.get('/obter-coordenadas', async (req, res) => {
  try {
    const { placeId } = req.query;
    if (!placeId) return res.status(400).json({ erro: 'Place ID é necessário' });

    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=geometry&key=${GOOGLE_MAPS_KEY}`;
    const response = await axios.get(url);

    if (response.data.status === 'OK') {
      const { location } = response.data.result.geometry;
      return res.json({
        lat: location.lat,
        lng: location.lng,
        latitude: location.lat,
        longitude: location.lng
      });
    }
    res.status(400).json({ erro: 'Não foi possível obter as coordenadas do Google' });
  } catch (error) {
    res.status(500).json({ erro: 'Erro interno no servidor' });
  }
});

/**
 * 3. SOLICITAR CORRIDA
 * Cria a corrida no banco e avisa os motoristas via Socket.
 */
router.post('/solicitar', async (req, res) => {
  try {
    const { passageiroId, origemLat, origemLng, destinoLat, destinoLng, origemEndereco, destinoEndereco } = req.body;
    
    const corrida = await prisma.corrida.create({
      data: {
        passageiroId,
        origemLat,
        origemLng,
        origemEndereco: origemEndereco || "Origem",
        destinoLat,
        destinoLng,
        destinoEndereco: destinoEndereco || "Destino",
        distancia: 0,
        preco: 10, // Preço fixo inicial
        status: 'aguardando'
      }
    });

    emitirNovaSolicitacaoParaMotoristas({
      corridaId: corrida.id,
      passageiroId,
      origem: { latitude: origemLat, longitude: origemLng },
      destino: { latitude: destinoLat, longitude: destinoLng },
      origemEndereco: corrida.origemEndereco,
      destinoEndereco: corrida.destinoEndereco,
      preco: 10
    });

    res.status(201).json(corrida);
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao solicitar corrida' });
  }
});

/**
 * 4. ACEITAR CORRIDA
 * Rota para o motorista aceitar a solicitação.
 */
router.patch('/:id/aceitar', async (req, res) => {
  try {
    const { id } = req.params;
    const { motoristaId } = req.body;
    
    const corrida = await prisma.corrida.update({
      where: { id },
      data: { status: 'aceita', motoristaId }
    });

    if (typeof finalizarSolicitacaoNoSocket === 'function') {
      finalizarSolicitacaoNoSocket(id);
    }
    
    res.json(corrida);
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao aceitar corrida' });
  }
});

module.exports = router;