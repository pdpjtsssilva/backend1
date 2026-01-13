// backend/websocket.js
const socketIO = require('socket.io');

let io;
const motoristasOnline = new Map(); // { motoristaId: socketId }
const corridasAtivas = new Map();   // { corridaId: { passageiroSocket, motoristaSocket } }

function initializeWebSocket(server) {
  io = socketIO(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    },
    pingTimeout: 60000,
    pingInterval: 25000
  });

  io.on('connection', (socket) => {
    console.log('🔌 Novo cliente conectado:', socket.id);

    // ========================================
    // 🚗 MOTORISTA SE CONECTA
    // ========================================
    socket.on('motorista:online', (dados) => {
      const { motoristaId, nome, latitude, longitude } = dados;
      
      motoristasOnline.set(motoristaId, {
        socketId: socket.id,
        nome,
        latitude,
        longitude,
        disponivel: true,
        corridaAtual: null
      });

      console.log(`✅ Motorista ${nome} (${motoristaId}) está online`);
      console.log(`📊 Total de motoristas online: ${motoristasOnline.size}`);

      // Notifica todos que há um novo motorista
      io.emit('motoristas:atualizar', {
        total: motoristasOnline.size,
        motoristas: Array.from(motoristasOnline.entries()).map(([id, data]) => ({
          id,
          nome: data.nome,
          disponivel: data.disponivel
        }))
      });
    });

    // ========================================
    // 📍 MOTORISTA ATUALIZA SUA POSIÇÃO
    // ========================================
    socket.on('motorista:atualizarPosicao', (dados) => {
      const { motoristaId, latitude, longitude } = dados;
      
      const motorista = motoristasOnline.get(motoristaId);
      if (motorista) {
        motorista.latitude = latitude;
        motorista.longitude = longitude;

        // Se está em uma corrida, envia posição para o passageiro
        if (motorista.corridaAtual) {
          const corrida = corridasAtivas.get(motorista.corridaAtual);
          if (corrida && corrida.passageiroSocket) {
            io.to(corrida.passageiroSocket).emit('motorista:posicaoAtualizada', {
              corridaId: motorista.corridaAtual,
              latitude,
              longitude
            });
          }
        }
      }
    });

    // ========================================
    // 🚕 PASSAGEIRO SOLICITA CORRIDA
    // ========================================
    socket.on('passageiro:solicitarCorrida', (dados) => {
      const { corridaId, passageiroId, origemLat, origemLng, destinoLat, destinoLng, distancia, preco } = dados;
      
      console.log(`🚕 Nova corrida solicitada: ${corridaId}`);
      console.log(`📍 Origem: ${origemLat}, ${origemLng}`);
      console.log(`🎯 Destino: ${destinoLat}, ${destinoLng}`);

      // Salva o socket do passageiro
      corridasAtivas.set(corridaId, {
        passageiroSocket: socket.id,
        motoristaSocket: null,
        passageiroId,
        origemLat,
        origemLng,
        destinoLat,
        destinoLng,
        distancia,
        preco,
        status: 'aguardando'
      });

      // Notifica TODOS os motoristas disponíveis
      let notificados = 0;
      motoristasOnline.forEach((motorista, motoristaId) => {
        if (motorista.disponivel && !motorista.corridaAtual) {
          io.to(motorista.socketId).emit('corrida:novaSolicitacao', {
            corridaId,
            passageiroId,
            origemLat,
            origemLng,
            destinoLat,
            destinoLng,
            distancia,
            preco
          });
          notificados++;
        }
      });

      console.log(`📢 Corrida enviada para ${notificados} motoristas`);

      // Confirma para o passageiro
      socket.emit('passageiro:corridaSolicitada', {
        corridaId,
        motoristasNotificados: notificados
      });
    });

    // ========================================
    // ✅ MOTORISTA ACEITA CORRIDA
    // ========================================
    socket.on('motorista:aceitarCorrida', (dados) => {
      const { corridaId, motoristaId, motoristaNome, motoristaLat, motoristaLng } = dados;
      
      const corrida = corridasAtivas.get(corridaId);
      if (!corrida) {
        socket.emit('erro', { mensagem: 'Corrida não encontrada' });
        return;
      }

      if (corrida.status !== 'aguardando') {
        socket.emit('erro', { mensagem: 'Corrida já foi aceita por outro motorista' });
        return;
      }

      // Atualiza a corrida
      corrida.status = 'aceita';
      corrida.motoristaSocket = socket.id;
      corrida.motoristaId = motoristaId;
      corrida.motoristaNome = motoristaNome;
      corrida.motoristaLat = motoristaLat;
      corrida.motoristaLng = motoristaLng;

      // Atualiza o motorista
      const motorista = motoristasOnline.get(motoristaId);
      if (motorista) {
        motorista.disponivel = false;
        motorista.corridaAtual = corridaId;
      }

      console.log(`✅ Motorista ${motoristaNome} aceitou a corrida ${corridaId}`);

      // Notifica o passageiro
      io.to(corrida.passageiroSocket).emit('corrida:aceita', {
        corridaId,
        motoristaId,
        motoristaNome,
        motoristaLat,
        motoristaLng
      });

      // Notifica outros motoristas que a corrida foi aceita
      motoristasOnline.forEach((m, mId) => {
        if (mId !== motoristaId && m.disponivel) {
          io.to(m.socketId).emit('corrida:jaPega', { corridaId });
        }
      });

      // Confirma para o motorista
      socket.emit('motorista:corridaConfirmada', {
        corridaId,
        destinoLat: corrida.destinoLat,
        destinoLng: corrida.destinoLng
      });
    });

    // ========================================
    // 🎉 MOTORISTA CHEGOU NO PASSAGEIRO
    // ========================================
    socket.on('motorista:chegouOrigem', (dados) => {
      const { corridaId, motoristaId } = dados;
      
      const corrida = corridasAtivas.get(corridaId);
      if (corrida) {
        corrida.status = 'em_andamento';
        
        io.to(corrida.passageiroSocket).emit('motorista:chegou', {
          corridaId,
          mensagem: 'Seu motorista chegou! 🎉'
        });

        console.log(`🎉 Motorista chegou na origem da corrida ${corridaId}`);
      }
    });

    // ========================================
    // 🏁 CORRIDA INICIADA
    // ========================================
    socket.on('motorista:iniciarCorrida', (dados) => {
      const { corridaId } = dados;
      
      const corrida = corridasAtivas.get(corridaId);
      if (corrida) {
        corrida.status = 'em_viagem';
        
        io.to(corrida.passageiroSocket).emit('corrida:iniciada', {
          corridaId,
          mensagem: 'Corrida iniciada! Boa viagem! 🚗'
        });

        console.log(`🏁 Corrida ${corridaId} iniciada`);
      }
    });

    // ========================================
    // ✅ CORRIDA FINALIZADA
    // ========================================
    socket.on('motorista:finalizarCorrida', (dados) => {
      const { corridaId, motoristaId } = dados;
      
      const corrida = corridasAtivas.get(corridaId);
      if (corrida) {
        io.to(corrida.passageiroSocket).emit('corrida:finalizada', {
          corridaId,
          mensagem: 'Corrida finalizada! Obrigado! ⭐'
        });

        // Libera o motorista
        const motorista = motoristasOnline.get(motoristaId);
        if (motorista) {
          motorista.disponivel = true;
          motorista.corridaAtual = null;
        }

        corridasAtivas.delete(corridaId);
        console.log(`✅ Corrida ${corridaId} finalizada`);
      }
    });

    // ========================================
    // ❌ CANCELAR CORRIDA
    // ========================================
    socket.on('corrida:cancelar', (dados) => {
      const { corridaId, motivo, canceladoPor } = dados;
      
      const corrida = corridasAtivas.get(corridaId);
      if (corrida) {
        // Notifica a outra parte
        if (canceladoPor === 'passageiro') {
          if (corrida.motoristaSocket) {
            io.to(corrida.motoristaSocket).emit('corrida:cancelada', {
              corridaId,
              motivo,
              canceladoPor: 'passageiro'
            });
          }

          // Libera o motorista
          if (corrida.motoristaId) {
            const motorista = motoristasOnline.get(corrida.motoristaId);
            if (motorista) {
              motorista.disponivel = true;
              motorista.corridaAtual = null;
            }
          }
        } else if (canceladoPor === 'motorista') {
          io.to(corrida.passageiroSocket).emit('corrida:cancelada', {
            corridaId,
            motivo,
            canceladoPor: 'motorista'
          });
        }

        corridasAtivas.delete(corridaId);
        console.log(`❌ Corrida ${corridaId} cancelada por ${canceladoPor}`);
      }
    });

    // ========================================
    // 🔌 DESCONEXÃO
    // ========================================
    socket.on('disconnect', () => {
      console.log('❌ Cliente desconectado:', socket.id);

      // Remove motorista da lista
      motoristasOnline.forEach((motorista, motoristaId) => {
        if (motorista.socketId === socket.id) {
          motoristasOnline.delete(motoristaId);
          console.log(`🚗 Motorista ${motoristaId} ficou offline`);
          
          // Notifica todos
          io.emit('motoristas:atualizar', {
            total: motoristasOnline.size
          });
        }
      });

      // Cancela corridas ativas do socket desconectado
      corridasAtivas.forEach((corrida, corridaId) => {
        if (corrida.passageiroSocket === socket.id || corrida.motoristaSocket === socket.id) {
          if (corrida.passageiroSocket !== socket.id) {
            io.to(corrida.passageiroSocket).emit('corrida:cancelada', {
              corridaId,
              motivo: 'Motorista desconectou',
              canceladoPor: 'sistema'
            });
          }
          if (corrida.motoristaSocket && corrida.motoristaSocket !== socket.id) {
            io.to(corrida.motoristaSocket).emit('corrida:cancelada', {
              corridaId,
              motivo: 'Passageiro desconectou',
              canceladoPor: 'sistema'
            });
          }
          corridasAtivas.delete(corridaId);
        }
      });
    });
  });

  console.log('✅ WebSocket Server inicializado!');
  return io;
}

function getIO() {
  if (!io) {
    throw new Error('Socket.io não foi inicializado!');
  }
  return io;
}

function getMotoristaOnline(motoristaId) {
  return motoristasOnline.get(motoristaId);
}

function getCorridaAtiva(corridaId) {
  return corridasAtivas.get(corridaId);
}

function getTotalMotoristasOnline() {
  return motoristasOnline.size;
}

module.exports = {
  initializeWebSocket,
  getIO,
  getMotoristaOnline,
  getCorridaAtiva,
  getTotalMotoristasOnline
};