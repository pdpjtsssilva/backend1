const { Server } = require('socket.io');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function calcularDistancia(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Raio da Terra em metros
    const p1 = (lat1 * Math.PI) / 180;
    const p2 = (lat2 * Math.PI) / 180;
    const deltaLat = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLon = ((lon2 - lon1) * Math.PI) / 180;

    const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
              Math.cos(p1) * Math.cos(p2) *
              Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; 
}

const initializeWebSocket = (server) => {
    const io = new Server(server, {
        cors: { origin: "*", methods: ["GET", "POST"] }
    });

    io.on('connection', (socket) => {
        console.log(`[SOCKET] Conectado: ${socket.id}`);

        socket.on('motorista:atualizarPosicao', async (dados) => {
            const { motoristaId, latitude, longitude, corridaId } = dados;
            try {
                const corrida = await prisma.corrida.findUnique({
                    where: { id: corridaId },
                    select: { origemLat: true, origemLng: true, passageiroId: true, status: true }
                });

                if (corrida && corrida.status === 'aceita') {
                    // Envia posição para o passageiro
                    io.to(corrida.passageiroId).emit('corrida:posicaoMotorista', { latitude, longitude });

                    // Alerta de proximidade (200 metros)
                    const dist = calcularDistancia(latitude, longitude, corrida.origemLat, corrida.origemLng);
                    if (dist < 200) {
                        io.to(corrida.passageiroId).emit('corrida:motoristaChegando', {
                            mensagem: "O motorista está chegando ao local!",
                            distancia: Math.round(dist)
                        });
                    }
                }
            } catch (err) {
                console.error("[SOCKET ERROR]", err);
            }
        });

        socket.on('disconnect', () => console.log(`[SOCKET] Desconectado: ${socket.id}`));
    });
};

module.exports = { initializeWebSocket };