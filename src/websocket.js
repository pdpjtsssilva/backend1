const { Server } = require('socket.io');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Calcula a distância entre dois pontos (Haversine) em metros.
 */
function calcularDistancia(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Raio da Terra em metros
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
              Math.cos(phi1) * Math.cos(phi2) *
              Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Retorno em metros
}

const initializeWebSocket = (server) => {
    const io = new Server(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        }
    });

    io.on('connection', (socket) => {
        console.log(`[SOCKET] Novo dispositivo conectado: ${socket.id}`);

        // Evento disparado pelo App do Motorista
        socket.on('motorista:atualizarPosicao', async (dados) => {
            const { motoristaId, latitude, longitude, corridaId } = dados;

            try {
                // Busca a corrida usando os nomes EXATOS do seu schema.prisma
                const corrida = await prisma.corrida.findUnique({
                    where: { id: corridaId },
                    select: {
                        origemLat: true,
                        origemLng: true,
                        passageiroId: true,
                        status: true
                    }
                });

                // Se a corrida existe e está aceita, processamos a localização
                if (corrida && corrida.status === 'aceita') {
                    
                    // 1. Repassa a posição em tempo real para o passageiro
                    // O canal é o ID do passageiro para garantir privacidade
                    io.to(corrida.passageiroId).emit('corrida:posicaoMotorista', {
                        latitude,
                        longitude
                    });

                    // 2. GEOFENCING: Verifica se está a menos de 200 metros da ORIGEM
                    const distancia = calcularDistancia(
                        latitude,
                        longitude,
                        corrida.origemLat,
                        corrida.origemLng
                    );

                    if (distancia < 200) {
                        io.to(corrida.passageiroId).emit('corrida:motoristaChegando', {
                            mensagem: "Seu motorista está chegando!",
                            distancia: Math.round(distancia)
                        });
                        console.log(`[GEOFENCE] Alerta enviado: Motorista a ${Math.round(distancia)}m`);
                    }
                }
            } catch (error) {
                console.error("[SOCKET ERROR] Erro ao processar GPS:", error);
            }
        });

        socket.on('disconnect', () => {
            console.log(`[SOCKET] Dispositivo desconectado: ${socket.id}`);
        });
    });
};

// Exportação correta para bater com o seu server.js
module.exports = { initializeWebSocket };