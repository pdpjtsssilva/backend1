const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const axios = require('axios');
const { emitirNovaSolicitacaoParaMotoristas } = require('../websocket');

const GOOGLE_MAPS_KEY = process.env.GOOGLE_MAPS_KEY || 'AIzaSyB4C6Xnxmme3HU0_W6hVlLoprRwmw96o3I';

// 1. Rota que o seu App usa para buscar nomes de ruas
router.get('/buscar-endereco', async (req, res) => {
  try {
    const { input } = req.query;
    if (!input) return res.json([]);
    const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&key=${GOOGLE_MAPS_KEY}&language=pt-BR`;
    const response = await axios.get(url);
    res.json(response.data.predictions || []);
  } catch (error) {
    res.status(500).json({ erro: 'Erro na busca' });
  }
});

// 2. A ROTA QUE FALTA: Transforma o endereço clicado em Coordenadas
// Isso resolve o erro "não foi possível obter as coordenadas"
router.get('/obter-coordenadas', async (req, res) => {
  try {
    const { placeId } = req.query;
    if (!placeId) return res.status(400).json({ erro: 'Place ID necessário' });

    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=geometry&key=${GOOGLE_MAPS_KEY}`;
    const response = await axios.get(url);

    if (response.data.status === 'OK') {
      const location = response.data.result.geometry.location;
      return res.json({
        lat: location.lat,
        lng: location.lng
      });
    }
    res.status(400).json({ erro: 'Google não retornou coordenadas' });
  } catch (error) {
    res.status(500).json({ erro: 'Erro interno' });
  }
});

module.exports = router;