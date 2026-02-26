const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { 
  emitirNovaSolicitacaoParaMotoristas, 
  getCorridasAtivas,
  finalizarSolicitacaoNoSocket // Importação da nova função
} = require('../websocket');
const axios = require('axios');

const GOOGLE_MAPS_KEY = process.env.GOOGLE_MAPS_KEY || 'AIzaSyB4C6Xnxmme3HU0_W6hVlLoprRwmw96o3I';

const ensureGoogleKey = (res) => {
  if (!GOOGLE_MAPS_KEY) {
    res.status(500).json({ erro: 'Chave Google Maps não configurada' });
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

    const R = 6371;
    const dLat = (destinoLat - origemLat) * Math.PI / 180;
    const dLon = (destinoLng - origemLng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(origemLat * Math.PI / 180) * Math.cos(destinoLat * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distancia = R * c;
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

// LISTAR CORRIDAS ABERTAS
router.get('/abertas', async (_req, res) => {
  try {
    const corridasMap = getCorridasAtivas(); 
    if (!corridasMap) return res.json([]);

    const payload = Array.from(corridasMap.values())
      .filter((c) => c && c.status === 'aguardando')
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
    res.status(500).json({ erro: 'Erro ao buscar corridas abertas' });
  }
});

// ACEITAR CORRIDA (CORRIGIDA)
router.patch('/:id/aceitar', async (req, res) => {
  try {
    const { id } = req.params;
    const { motoristaId } = req.body;
    if (!motoristaId) return res.status(400).json({ erro: 'MotoristaId é obrigatório' });

    const corrida = await prisma.$transaction(async (tx) => {
      const corridaAtual = await tx.corrida.findUnique({ where: { id } });
      if (!corridaAtual) throw new Error('CORRIDA_NAO_ENCONTRADA');
      if (corridaAtual.status !== 'aguardando') throw new Error('CORRIDA_JA_ACEITA');
      
      return await tx.corrida.update({
        where: { id },
        data: { status: 'aceita', motoristaId },
      });
    });

    // Limpa a solicitação do Socket para os outros motoristas
    finalizarSolicitacaoNoSocket(id);

    res.json(corrida);
  } catch (error) {
    if (error.message === 'CORRIDA_NAO_ENCONTRADA') return res.status(404).json({ erro: 'Corrida não encontrada' });
    if (error.message === 'CORRIDA_JA_ACEITA') return res.status(409).json({ erro: 'Corrida não disponível' });
    res.status(500).json({ erro: 'Erro ao aceitar' });
  }
});

// CANCELAR CORRIDA (CORRIGIDA)
router.patch('/:id/cancelar', async (req, res) => {
  try {
    const { id } = req.params;
    const corrida = await prisma.corrida.update({
      where: { id },
      data: { status: 'cancelada' }
    });

    // Remove do radar dos motoristas
    finalizarSolicitacaoNoSocket(id);

    res.json(corrida);
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao cancelar' });
  }
});

// ROTAS DE BUSCA E LISTAGEM (Omitidas para brevidade de foco, mas mantidas no seu arquivo original)
router.post('/rota', async (req, res) => { /* ... lógica google maps ... */ });
router.get('/usuario/:id', async (req, res) => { /* ... listar por usuário ... */ });
router.get('/motorista/:id', async (req, res) => { /* ... listar por motorista ... */ });
router.get('/:id', async (req, res) => { /* ... buscar por ID ... */ });

// FINALIZAR CORRIDA
router.patch('/:id/finalizar', async (req, res) => {
  try {
    const { id } = req.params;
    const corrida = await prisma.corrida.update({
      where: { id },
      data: { status: 'finalizada' }
    });
    
    // Garante que a solicitação suma se ainda existir
    finalizarSolicitacaoNoSocket(id);
    
    res.json(corrida);
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao finalizar' });
  }
});

module.exports = router;