// backend/src/routes/favoritos.js
const express = require('express');
const router = express.Router();
// Prisma singleton

const prisma = require('../lib/prisma');

// 📋 LISTAR FAVORITOS DO USUÁRIO
router.get('/usuario/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    if (!req.user || req.user.id !== userId) {
      return res.status(403).json({ erro: 'Acesso negado' });
    }

    const favoritos = await prisma.favorito.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });

    res.json(favoritos);

  } catch (error) {
    console.error('Erro ao buscar favoritos:', error);
    // Retorna array vazio se der erro
    res.json([]);
  }
});

// ➕ CRIAR FAVORITO
router.post('/', async (req, res) => {
  try {
    const { userId, nome, endereco, latitude, longitude, icone } = req.body;

    if (!userId || !nome || !latitude || !longitude) {
      return res.status(400).json({ error: 'Dados incompletos' });
    }
    if (!req.user || req.user.id !== userId) {
      return res.status(403).json({ erro: 'Acesso negado' });
    }

    const favorito = await prisma.favorito.create({
      data: {
        userId,
        nome,
        endereco: endereco || 'Endereço não informado',
        latitude,
        longitude,
        icone: icone || '📍'
      }
    });

    console.log('✅ Favorito criado:', favorito.id);
    res.status(201).json(favorito);

  } catch (error) {
    console.error('Erro ao criar favorito:', error);
    res.status(500).json({ error: 'Erro ao criar favorito' });
  }
});

// ✏️ ATUALIZAR FAVORITO
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, endereco, latitude, longitude, icone } = req.body;

    const favoritoExistente = await prisma.favorito.findUnique({ where: { id } });
    if (!favoritoExistente) {
      return res.status(404).json({ error: 'Favorito nao encontrado' });
    }
    if (!req.user || req.user.id !== favoritoExistente.userId) {
      return res.status(403).json({ erro: 'Acesso negado' });
    }

    const favorito = await prisma.favorito.update({
      where: { id },
      data: {
        ...(nome && { nome }),
        ...(endereco && { endereco }),
        ...(latitude && { latitude }),
        ...(longitude && { longitude }),
        ...(icone && { icone })
      }
    });

    console.log('✅ Favorito atualizado:', id);
    res.json(favorito);

  } catch (error) {
    console.error('Erro ao atualizar favorito:', error);
    res.status(500).json({ error: 'Erro ao atualizar favorito' });
  }
});

// ❌ DELETAR FAVORITO
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const favoritoExistente = await prisma.favorito.findUnique({ where: { id } });
    if (!favoritoExistente) {
      return res.status(404).json({ error: 'Favorito nao encontrado' });
    }
    if (!req.user || req.user.id !== favoritoExistente.userId) {
      return res.status(403).json({ erro: 'Acesso negado' });
    }

    await prisma.favorito.delete({
      where: { id }
    });

    console.log('❌ Favorito deletado:', id);
    res.json({ mensagem: 'Favorito deletado com sucesso' });

  } catch (error) {
    console.error('Erro ao deletar favorito:', error);
    res.status(500).json({ error: 'Erro ao deletar favorito' });
  }
});

// 🔍 BUSCAR FAVORITO POR ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const favorito = await prisma.favorito.findUnique({
      where: { id }
    });

    if (!favorito) {
      return res.status(404).json({ error: 'Favorito não encontrado' });
    }
    if (!req.user || req.user.id !== favorito.userId) {
      return res.status(403).json({ erro: 'Acesso negado' });
    }

    res.json(favorito);

  } catch (error) {
    console.error('Erro ao buscar favorito:', error);
    res.status(500).json({ error: 'Erro ao buscar favorito' });
  }
});

module.exports = router;
