const socketIO = require('socket.io');
// Prisma singleton
const jwt = require('jsonwebtoken');

let io;
const prisma = require('./lib/prisma');
const motoristasOnline = new Map();
const corridasAtivas = new Map();
const passageirosOnline = new Map();

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

function listarMotoristasOnline() {
  return Array.from(motoristasOnline.entries()).map(([motoristaId, data]) => ({
    motoristaId,
    nome: data.nome,
    localizacao: data.localizacao || null,
    disponivel: data.disponivel,
    corridaAtual: data.corridaAtual || null
  }));
}

function selecionarProximoMotorista(corrida) {
  if (!corrida) return null;
  const recusados = Array.isArray(corrida.recusados) ? corrida.recusados : [];
  const oferecidos = Array.isArray(corrida.oferecidos) ? corrida.oferecidos : [];
  for (const [motoristaId, motorista] of motoristasOnline.entries()) {
    if (!motorista?.disponivel || motorista?.corridaAtual) continue;
    if (recusados.includes(motoristaId)) continue;
    if (oferecidos.includes(motoristaId)) continue;
    return { motoristaId, motorista };
  }
  return null;
}

function enviarParaProximoMotorista(corrida) {
  if (!io || !corrida?.corridaId) return;
  const escolhido = selecionarProximoMotorista(corrida);
  if (!escolhido) return;
  const { motoristaId, motorista } = escolhido;
  const oferecidos = Array.isArray(corrida.oferecidos) ? corrida.oferecidos : [];
  oferecidos.push(motoristaId);
  corridasAtivas.set(corrida.corridaId, { ...corrida, oferecidos });
  const solicitacao = {
    corridaId: corrida.corridaId,
    passageiroId: corrida.passageiroId,
    passageiroNome: corrida.passageiroNome,
    origem: corrida.origem,
    destino: corrida.destino,
    origemEndereco: corrida.origemEndereco,
    destinoEndereco: corrida.destinoEndereco,
    preco: corrida.preco,
    recusados: corrida.recusados || []
  };
  io.to(motorista.socketId).emit('corrida:novaSolicitacao', solicitacao);
  console.log(`Corrida ${corrida.corridaId} enviada para motorista ${motoristaId}`);
}

function emitirNovaSolicitacaoParaMotoristas(data) {
  if (!io || !data?.corridaId || corridasAtivas.has(data.corridaId)) return;
  const passageiroSocket = passageirosOnline.get(data.passageiroId) || null;
  const corridaPayload = {
    corridaId: data.corridaId,
    passageiroSocket,
    passageiroId: data.passageiroId,
    passageiroNome: data.passageiroNome,
    origem: data.origem,
    destino: data.destino,
    origemEndereco: data.origemEndereco,
    destinoEndereco: data.destinoEndereco,
    preco: data.preco,
    status: 'aguardando',
    recusados: [],
    oferecidos: []
  };
  corridasAtivas.set(data.corridaId, corridaPayload);

  emitAdmin('admin:corridaNova', {
    corridaId: data.corridaId,
    passageiroId: data.passageiroId,
    origem: data.origem,
    destino: data.destino,
    preco: data.preco,
    status: 'aguardando'
  });

  enviarParaProximoMotorista(corridaPayload);
}

function initializeWebSocket(server) {
  io = socketIO(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
  });

  // Middleware de Autenticação (condicional)
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');

    // Se não tem token, permite conexão (Admin Panel)
    if (!token) {
      console.log(`Conexão sem token permitida (Admin): ${socket.id}`);
      socket.user = null; // Marca como não autenticado
      return next();
    }

    // Se tem token, valida (App Móvel)
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'defina_JWT_SECRET_no_env');
      socket.user = decoded; // Anexa o usuário ao socket
      console.log(`Conexão autenticada via JWT: ${socket.id} (User: ${decoded.id})`);
      next();
    } catch (err) {
      console.log(`Token inválido rejeitado: ${socket.id}`, err.message);
      next(new Error('Token inválido'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`Novo cliente conectado: ${socket.id} (User: ${socket.user?.id})`);

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
        io.emit('motorista:online', snapshot);
      }
      // Reenvia corridas pendentes para motoristas que entram online.
      corridasAtivas.forEach((corrida) => {
        if (!corrida || corrida.status !== 'aguardando') return;
        const recusados = Array.isArray(corrida.recusados) ? corrida.recusados : [];
        if (recusados.includes(motoristaId)) return;
        console.log(`Motorista ${motoristaId} entrou online; tentando enviar corrida ${corrida.corridaId}`);
        enviarParaProximoMotorista(corrida);
      });
    });

    // PASSAGEIRO: Registrar socket
    socket.on('passageiro:entrar', ({ passageiroId }) => {
      if (!passageiroId) return;
      console.log(`Passageiro ${passageiroId} conectado`);
      passageirosOnline.set(passageiroId, socket.id);
      io.to(socket.id).emit('motoristas:online', listarMotoristasOnline());
    });

    // MOTORISTA: Ficar offline
    socket.on('motorista:offline', ({ motoristaId }) => {
      if (motoristasOnline.has(motoristaId)) {
        const snapshot = snapshotMotorista(motoristaId);
        motoristasOnline.delete(motoristaId);
        console.log(`Motorista ${motoristaId} ficou offline`);
        emitAdmin('admin:motoristaOffline', snapshot || { motoristaId });
        io.emit('motorista:offline', { motoristaId });
      }
    });

    // PASSAGEIRO: Solicitar corrida
    socket.on('passageiro:solicitarCorrida', (data) => {
      console.log('Nova corrida solicitada (socket):', data.corridaId);
      if (corridasAtivas.has(data.corridaId)) return;
      passageirosOnline.set(data.passageiroId, socket.id);
      corridasAtivas.set(data.corridaId, {
        corridaId: data.corridaId,
        passageiroSocket: socket.id,
        passageiroId: data.passageiroId,
        passageiroNome: data.passageiroNome,
        origem: data.origem,
        destino: data.destino,
        origemEndereco: data.origemEndereco,
        destinoEndereco: data.destinoEndereco,
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
      const atualizado = { ...corrida, recusados, status: 'aguardando' };
      corridasAtivas.set(corridaId, atualizado);

      prisma.corrida.update({
        where: { id: corridaId },
        data: {
          recusaCount: { increment: 1 },
          ultimaRecusaMotoristaId: motoristaId,
          ultimaRecusaEm: new Date()
        }
      }).catch((err) => console.error('Erro ao registrar recusa:', err.message));

      const passageiroSocket = corrida.passageiroSocket || passageirosOnline.get(corrida.passageiroId);
      if (passageiroSocket) {
        io.to(passageiroSocket).emit('corrida:recusada', {
          corridaId,
          motoristaId
        });
      }

      enviarParaProximoMotorista(atualizado);
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
        io.emit('motorista:posicaoOnline', {
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
      passageirosOnline.forEach((sockId, passageiroId) => {
        if (sockId === socket.id) {
          passageirosOnline.delete(passageiroId);
        }
      });
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

module.exports = { initializeWebSocket, motoristasOnline, emitirNovaSolicitacaoParaMotoristas };