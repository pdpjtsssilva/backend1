const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

const ensureVeiculosDir = () => {
  const dir = path.join(__dirname, '..', '..', 'uploads', 'veiculos');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
};

const ensureCnhDir = () => {
  const dir = path.join(__dirname, '..', '..', 'uploads', 'cnh');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
};

const salvarArquivo = (file, userId, tipo) => {
  if (!file) return null;
  const dir = ensureVeiculosDir();
  const filename = `${userId}_${tipo}_${Date.now()}_${file.originalname.replace(/\s+/g, '_')}`;
  const filepath = path.join(dir, filename);
  fs.writeFileSync(filepath, file.buffer);
  return `/uploads/veiculos/${filename}`;
};

const salvarArquivoCnh = (file, userId, tipo) => {
  if (!file) return null;
  const dir = ensureCnhDir();
  const filename = `${userId}_${tipo}_${Date.now()}_${file.originalname.replace(/\s+/g, '_')}`;
  const filepath = path.join(dir, filename);
  fs.writeFileSync(filepath, file.buffer);
  return `/uploads/cnh/${filename}`;
};

// Lista carros do motorista
router.get('/:userId/carros', async (req, res) => {
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

// Cria carro para motorista
router.post('/:userId/carros', upload.fields([
  { name: 'fotoSeguro', maxCount: 1 },
  { name: 'fotoInspecao', maxCount: 1 },
  { name: 'fotoLicenciamento', maxCount: 1 },
]), async (req, res) => {
  try {
    const { userId } = req.params;
    const { marca, modelo, placa, cor, ano, seguro, inspecao, licenciamento, principal } = req.body;
    if (!marca || !modelo || !placa) {
      return res.status(400).json({ erro: 'Informe marca, modelo e placa' });
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
        seguro,
        inspecao,
        licenciamento,
        docSeguroUri: salvarArquivo(req.files?.fotoSeguro?.[0], userId, 'seguro'),
        docInspecaoUri: salvarArquivo(req.files?.fotoInspecao?.[0], userId, 'inspecao'),
        docLicenciamentoUri: salvarArquivo(req.files?.fotoLicenciamento?.[0], userId, 'licenciamento'),
        principal: !!principal
      }
    });
    res.status(201).json(carro);
  } catch (error) {
    console.error('Erro ao criar carro:', error);
    res.status(500).json({ erro: 'Erro ao criar carro' });
  }
});

// Atualiza carro de um motorista
router.put('/:userId/carros/:carroId', upload.fields([
  { name: 'fotoSeguro', maxCount: 1 },
  { name: 'fotoInspecao', maxCount: 1 },
  { name: 'fotoLicenciamento', maxCount: 1 },
]), async (req, res) => {
  try {
    const { userId, carroId } = req.params;
    const { marca, modelo, placa, cor, ano, seguro, inspecao, licenciamento, principal, ativo } = req.body;

    const carro = await prisma.carro.findUnique({ where: { id: carroId } });
    if (!carro || carro.userId !== userId) {
      return res.status(404).json({ erro: 'Carro nao encontrado' });
    }

    if (principal) {
      await prisma.carro.updateMany({ where: { userId }, data: { principal: false } });
    }

    const atualizado = await prisma.carro.update({
      where: { id: carroId },
      data: {
        marca: typeof marca !== 'undefined' ? marca : carro.marca,
        modelo: typeof modelo !== 'undefined' ? modelo : carro.modelo,
        placa: typeof placa !== 'undefined' ? placa : carro.placa,
        cor: typeof cor !== 'undefined' ? cor : carro.cor,
        ano: typeof ano !== 'undefined' ? Number(ano) : carro.ano,
        seguro: typeof seguro !== 'undefined' ? seguro : carro.seguro,
        inspecao: typeof inspecao !== 'undefined' ? inspecao : carro.inspecao,
        licenciamento: typeof licenciamento !== 'undefined' ? licenciamento : carro.licenciamento,
        docSeguroUri: req.files?.fotoSeguro?.[0] ? salvarArquivo(req.files.fotoSeguro[0], userId, 'seguro') : carro.docSeguroUri,
        docInspecaoUri: req.files?.fotoInspecao?.[0] ? salvarArquivo(req.files.fotoInspecao[0], userId, 'inspecao') : carro.docInspecaoUri,
        docLicenciamentoUri: req.files?.fotoLicenciamento?.[0] ? salvarArquivo(req.files.fotoLicenciamento[0], userId, 'licenciamento') : carro.docLicenciamentoUri,
        principal: typeof principal !== 'undefined' ? !!principal : carro.principal,
        ativo: typeof ativo !== 'undefined' ? !!ativo : carro.ativo
      }
    });

    res.json(atualizado);
  } catch (error) {
    console.error('Erro ao atualizar carro:', error);
    res.status(500).json({ erro: 'Erro ao atualizar carro' });
  }
});

// Define principal
router.patch('/:userId/carros/:carroId/principal', async (req, res) => {
  try {
    const { userId, carroId } = req.params;

    const carro = await prisma.carro.findUnique({ where: { id: carroId } });
    if (!carro || carro.userId !== userId) {
      return res.status(404).json({ erro: 'Carro nao encontrado' });
    }

    await prisma.carro.updateMany({ where: { userId }, data: { principal: false } });
    const atualizado = await prisma.carro.update({
      where: { id: carroId },
      data: { principal: true }
    });

    res.json(atualizado);
  } catch (error) {
    console.error('Erro ao definir carro principal:', error);
    res.status(500).json({ erro: 'Erro ao definir carro principal' });
  }
});

// Remove carro
router.delete('/:userId/carros/:carroId', async (req, res) => {
  try {
    const { userId, carroId } = req.params;
    const carro = await prisma.carro.findUnique({ where: { id: carroId } });
    if (!carro || carro.userId !== userId) {
      return res.status(404).json({ erro: 'Carro nao encontrado' });
    }

    await prisma.carro.delete({ where: { id: carroId } });
    res.json({ ok: true });
  } catch (error) {
    console.error('Erro ao remover carro:', error);
    res.status(500).json({ erro: 'Erro ao remover carro' });
  }
});

// Upload da CNH (frente/verso)
router.post('/:userId/cnh', upload.fields([
  { name: 'cnhFrente', maxCount: 1 },
  { name: 'cnhVerso', maxCount: 1 },
]), async (req, res) => {
  try {
    const { userId } = req.params;
    const frenteUri = salvarArquivoCnh(req.files?.cnhFrente?.[0], userId, 'frente');
    const versoUri = salvarArquivoCnh(req.files?.cnhVerso?.[0], userId, 'verso');

    await prisma.user.update({
      where: { id: userId },
      data: {
        cnhFrenteUri: frenteUri || undefined,
        cnhVersoUri: versoUri || undefined,
        cnhStatus: 'enviado'
      }
    });

    res.json({ ok: true, cnhFrenteUri: frenteUri, cnhVersoUri: versoUri, cnhStatus: 'enviado' });
  } catch (error) {
    console.error('Erro ao salvar CNH:', error);
    res.status(500).json({ erro: 'Erro ao salvar CNH' });
  }
});

module.exports = router;
