const socketIO = require('socket.io');
const { PrismaClient } = require('@prisma/client');

let io;
const prisma = new PrismaClient();
const motoristasOnline = new Map();
const corridasAtivas = new Map();

function emitAdmin(event, payload) {
  if (!io) return;
  io.emit(event, payload);
}

function snapshotMotorista(motoristaId) {
  const motorista = motoristasOnline.get(motoristaId);
  if (!motorista) return null;
  return {
    motoristaId,
    nome: motorista.nome,
    localizacao: motorista.localizacao || null,
    disponivel: motorista.disponivel,
    corridaAtual: motorista.corridaAtual || null
  };
}

function initializeWebSocket(server) {
  io = socketIO(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
  });

  io.on('connection', (socket) => {
    console.log('Novo cliente conectado:', socket.id);

    // MOTORISTA: Ficar online
    socket.on('motorista:online', (data) => {
      const { motoristaId, nome, latitude, longitude } = data;
      motoristasOnline.set(motoristaId, {
        socketId: socket.id,
        nome,
        localizacao: { latitude, longitude },
        disponivel: true,
        corridaAtual: null
      });
      console.log(`Motorista ${nome} (${motoristaId}) esta online`);
      const snapshot = snapshotMotorista(motoristaId);
      if (snapshot) {
        emitAdmin('admin:motoristaOnline', snapshot);
      }
      // Reenvia corridas pendentes para motoristas que entram online.
      corridasAtivas.forEach((corrida) => {
        if (!corrida || corrida.status !== 'aguardando') return;
        const recusados = Array.isArray(corrida.recusados) ? corrida.recusados : [];
        if (recusados.includes(motoristaId)) return;
        io.to(socket.id).emit('corrida:novaSolicitacao', {
          corridaId: corrida.corridaId,
          passageiroId: corrida.passageiroId,
          origem: corrida.origem,
          destino: corrida.destino,
          preco: corrida.preco
        });
      });
    });

    // MOTORISTA: Ficar offline
    socket.on('motorista:offline', ({ motoristaId }) => {
      if (motoristasOnline.has(motoristaId)) {
        const snapshot = snapshotMotorista(motoristaId);
        motoristasOnline.delete(motoristaId);
        console.log(`Motorista ${motoristaId} ficou offline`);
        emitAdmin('admin:motoristaOffline', snapshot || { motoristaId });
      }
    });

    // PASSAGEIRO: Solicitar corrida
    socket.on('passageiro:solicitarCorrida', (data) => {
      console.log('Nova corrida solicitada:', data.corridaId);
      corridasAtivas.set(data.corridaId, {
        corridaId: data.corridaId,
        passageiroSocket: socket.id,
        passageiroId: data.passageiroId,
        origem: data.origem,
        destino: data.destino,
        preco: data.preco,
        status: 'aguardando',
        recusados: []
      });
      emitAdmin('admin:corridaNova', {
        corridaId: data.corridaId,
        passageiroId: data.passageiroId,
        origem: data.origem,
        destino: data.destino,
        preco: data.preco,
        status: 'aguardando'
      });
      // Envia para motoristas online no momento; se nenhum, permanece aguardando (sem reenviar depois)
      motoristasOnline.forEach((motorista, motoristaId) => {
        if (motorista.disponivel && !motorista.corridaAtual) {
          io.to(motorista.socketId).emit('corrida:novaSolicitacao', data);
        }
      });
    });

    // MOTORISTA: Aceitar corrida
    socket.on('motorista:aceitarCorrida', (data) => {
      console.log('Motorista aceitou corrida:', data.corridaId);
      const corrida = corridasAtivas.get(data.corridaId) || {};
      corridasAtivas.set(data.corridaId, {
        ...corrida,
        motoristaId: data.motoristaId,
        motoristaNome: data.motoristaNome,
        motoristaSocket: socket.id,
        motoristaLocalizacao: data.motoristaLocalizacao,
        status: 'aceita'
      });

      io.emit('corrida:aceita', {
        corridaId: data.corridaId,
        motoristaId: data.motoristaId,
        motoristaNome: data.motoristaNome,
        motoristaLocalizacao: data.motoristaLocalizacao
      });
      emitAdmin('admin:corridaAtualizada', {
        corridaId: data.corridaId,
        status: 'aceita',
        motoristaId: data.motoristaId,
        motoristaNome: data.motoristaNome,
        motoristaLocalizacao: data.motoristaLocalizacao
      });

      socket.emit('motorista:corridaConfirmada', {
        corridaId: data.corridaId,
        status: 'aceita',
        destinoLat: corrida.destino?.latitude,
        destinoLng: corrida.destino?.longitude
      });
    });

    // MOTORISTA: Recusar corrida
    socket.on('motorista:recusarCorrida', (data) => {
      const { corridaId, motoristaId } = data || {};
      if (!corridaId || !motoristaId) return;
      const corrida = corridasAtivas.get(corridaId);
      if (!corrida) return;

      const recusados = Array.isArray(corrida.recusados) ? corrida.recusados : [];
      if (!recusados.includes(motoristaId)) recusados.push(motoristaId);
      corridasAtivas.set(corridaId, { ...corrida, recusados, status: 'aguardando' });

      if (corrida.passageiroSocket) {
        io.to(corrida.passageiroSocket).emit('corrida:recusada', {
          corridaId,
          motoristaId
        });
      }

      motoristasOnline.forEach((motorista, outroId) => {
        if (!motorista.disponivel || motorista.corridaAtual) return;
        if (recusados.includes(outroId)) return;
        io.to(motorista.socketId).emit('corrida:novaSolicitacao', {
          corridaId: corrida.corridaId,
          passageiroId: corrida.passageiroId,
          origem: corrida.origem,
          destino: corrida.destino,
          preco: corrida.preco
        });
      });
    });

    // MOTORISTA: Chegou na origem
    socket.on('motorista:chegouOrigem', (data) => {
      console.log('Motorista chegou na origem:', data.corridaId);
      io.emit('motorista:chegou', { corridaId: data.corridaId });
      corridasAtivas.set(data.corridaId, {
        ...(corridasAtivas.get(data.corridaId) || {}),
        status: 'chegou'
      });
      emitAdmin('admin:corridaAtualizada', {
        corridaId: data.corridaId,
        status: 'chegou'
      });
      prisma.corrida.update({ where: { id: data.corridaId }, data: { status: 'chegou' } })
        .catch((err) => console.error('Erro ao marcar chegada:', err.message));
    });

    // MOTORISTA: Iniciar corrida
    socket.on('motorista:iniciarCorrida', (data) => {
      console.log('Corrida iniciada:', data.corridaId);
      io.emit('corrida:iniciada', { corridaId: data.corridaId });
      corridasAtivas.set(data.corridaId, {
        ...(corridasAtivas.get(data.corridaId) || {}),
        status: 'em_andamento'
      });
      emitAdmin('admin:corridaAtualizada', {
        corridaId: data.corridaId,
        status: 'em_andamento'
      });
      prisma.corrida.update({ where: { id: data.corridaId }, data: { status: 'em_andamento' } })
        .catch((err) => console.error('Erro ao iniciar corrida:', err.message));
    });

    // MOTORISTA: Finalizar corrida
    socket.on('motorista:finalizarCorrida', async (data) => {
      console.log('Corrida finalizada:', data.corridaId);
      io.emit('corrida:finalizada', { corridaId: data.corridaId });
      corridasAtivas.delete(data.corridaId);
      emitAdmin('admin:corridaAtualizada', {
        corridaId: data.corridaId,
        status: 'finalizada'
      });

      try {
        await prisma.corrida.update({
          where: { id: data.corridaId },
          data: { status: 'finalizada' }
        });
      } catch (err) {
        console.error('Erro ao finalizar corrida no banco:', err.message);
      }
    });

    // MOTORISTA: Atualizar posicao
    socket.on('motorista:atualizarPosicao', (data) => {
      const { motoristaId, latitude, longitude } = data;
      if (motoristasOnline.has(motoristaId)) {
        const motorista = motoristasOnline.get(motoristaId);
        motorista.localizacao = { latitude, longitude };
        motoristasOnline.set(motoristaId, motorista);
        emitAdmin('admin:motoristaPosicao', {
          motoristaId,
          localizacao: { latitude, longitude }
        });
      }
      corridasAtivas.forEach((corrida, corridaId) => {
        if (corrida.motoristaId === motoristaId) {
          io.emit('motorista:posicaoAtualizada', {
            corridaId,
            motoristaId,
            localizacao: { latitude, longitude },
            distancia: 0.5,
            tempoEstimado: 5
          });
        }
      });
    });

    // Desconexao
    socket.on('disconnect', () => {
      console.log('Cliente desconectado:', socket.id);
      motoristasOnline.forEach((motorista, motoristaId) => {
        if (motorista.socketId === socket.id) {
          const snapshot = snapshotMotorista(motoristaId);
          motoristasOnline.delete(motoristaId);
          console.log(`Motorista ${motoristaId} offline`);
          emitAdmin('admin:motoristaOffline', snapshot || { motoristaId });
        }
      });
    });
  });

  console.log('WS Server inicializado!');
}

module.exports = { initializeWebSocket, motoristasOnline };
