const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function calcularDistancia(lat1, lon1, lat2, lon2) {
    const R = 6371e3; 
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
              Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; 
}

module.exports = (io) => {
    io.on('connection', (socket) => {
        console.log(`[SOCKET] Conectado: ${socket.id}`);

        socket.on('atualizar_localizacao_motorista', async (dados) => {
            const { idMotorista, latitude, longitude, idCorrida } = dados;

            try {
                const corrida = await prisma.corrida.findUnique({
                    where: { id: idCorrida },
                    select: {
                        latitude_origem: true,
                        longitude_origem: true,
                        id_passageiro: true,
                        status: true
                    }
                });

                if (corrida && corrida.status === 'ACEITA') {
                    // Envia posição para o passageiro
                    io.to(corrida.id_passageiro).emit('posicao_motorista', {
                        latitude,
                        longitude
                    });

                    // Geofencing: 200 metros da ORIGEM (onde o passageiro está)
                    const distancia = calcularDistancia(
                        latitude,
                        longitude,
                        corrida.latitude_origem,
                        corrida.longitude_origem
                    );

                    if (distancia < 200) {
                        io.to(corrida.id_passageiro).emit('motorista_chegando', {
                            mensagem: "Seu motorista está chegando!",
                            distancia: Math.round(distancia)
                        });
                    }
                }
            } catch (erro) {
                console.error('[ERRO SOCKET]', erro);
            }
        });

        socket.on('disconnect', () => {
            console.log(`[SOCKET] Desconectado: ${socket.id}`);
        });
    });
};