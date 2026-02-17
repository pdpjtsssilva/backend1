const express = require('express');
const router = express.Router();
// Prisma singleton

const prisma = require('../lib/prisma');

// Rotas legadas em /api/carros

// Listar carros do motorista
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const carros = await prisma.carro.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });
    res.json(carros);
  } catch (error) {
    console.error('Erro ao listar carros:', error);
    res.status(500).json({ erro: 'Erro ao listar carros' });
  }
});

// Criar carro
router.post('/', async (req, res) => {
  try {
    const { userId, marca, modelo, placa, cor, ano, principal, seguro, inspecao, licenciamento } = req.body;
    if (!userId || !marca || !modelo || !placa) {
      return res.status(400).json({ erro: 'Campos obrigatorios: userId, marca, modelo, placa' });
    }

    if (principal) {
      await prisma.carro.updateMany({ where: { userId }, data: { principal: false } });
    }

    const carro = await prisma.carro.create({
      data: {
        userId,
        marca,
        modelo,
        placa,
        cor,
        ano: ano ? Number(ano) : null,
        principal: !!principal,
        seguro,
        inspecao,
        licenciamento
      }
    });
    res.status(201).json(carro);
  } catch (error) {
    console.error('Erro ao criar carro:', error);
    res.status(500).json({ erro: 'Erro ao criar carro' });
  }
});

// Atualizar carro
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { marca, modelo, placa, cor, ano, principal, ativo, seguro, inspecao, licenciamento } = req.body;

    const carro = await prisma.carro.findUnique({ where: { id } });
    if (!carro) return res.status(404).json({ erro: 'Carro nao encontrado' });

    if (principal) {
      await prisma.carro.updateMany({ where: { userId: carro.userId }, data: { principal: false } });
    }

    const atualizado = await prisma.carro.update({
      where: { id },
      data: {
        marca: marca ?? carro.marca,
        modelo: modelo ?? carro.modelo,
        placa: placa ?? carro.placa,
        cor: cor ?? carro.cor,
        ano: typeof ano !== 'undefined' ? Number(ano) : carro.ano,
        principal: typeof principal !== 'undefined' ? !!principal : carro.principal,
        ativo: typeof ativo !== 'undefined' ? !!ativo : carro.ativo,
        seguro: typeof seguro !== 'undefined' ? seguro : carro.seguro,
        inspecao: typeof inspecao !== 'undefined' ? inspecao : carro.inspecao,
        licenciamento: typeof licenciamento !== 'undefined' ? licenciamento : carro.licenciamento
      }
    });

    res.json(atualizado);
  } catch (error) {
    console.error('Erro ao atualizar carro:', error);
    res.status(500).json({ erro: 'Erro ao atualizar carro' });
  }
});

// Remover carro
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.carro.delete({ where: { id } });
    res.json({ ok: true });
  } catch (error) {
    console.error('Erro ao remover carro:', error);
    res.status(500).json({ erro: 'Erro ao remover carro' });
  }
});

module.exports = router;