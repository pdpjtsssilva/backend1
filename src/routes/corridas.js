const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { 
  emitirNovaSolicitacaoParaMotoristas, 
  getCorridasAtivas,
  finalizarSolicitacaoNoSocket 
} = require('../websocket');
const axios = require('axios');

const GOOGLE_MAPS_KEY = process.env.GOOGLE_MAPS_KEY || 'AIzaSyB4C6Xnxmme3HU0_W6hVlLoprRwmw96o3I';

// Rota de busca de endereços
router.get('/buscar-endereco', async (req, res) => {
  try {
    const { input } = req.query;
    if (!input || input.length < 3) return res.json([]);
    const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&key=${GOOGLE_MAPS_KEY}&language=pt-BR`;
    const response = await axios.get(url);
    if (response.data.status === 'OK') {
      const sugestoes = response.data.predictions.map(p => ({
        id: p.place_id,
        descricao: p.description,
        principal: p.structured_formatting.main_text,
        secundario: p.structured_formatting.secondary_text || ''
      }));
      return res.json(sugestoes);
    }
    res.json([]);
  } catch (error) {
    res.status(500).json({ erro: 'Erro na busca' });
  }
});

// Rota para aceitar corrida
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
    res.status(500).json({ erro: 'Erro ao aceitar' });
  }
});

// Rota para solicitar corrida
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
          preco: 10,
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
      res.status(500).json({ erro: 'Erro ao solicitar' });
    }
});

module.exports = router;