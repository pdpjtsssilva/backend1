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

    return R * c; 
}

const initializeWebSocket = (server) => {
    // Inicializa o Socket.io usando o servidor HTTP
    const io = new Server(server, {
        cors: {
            origin: "*", // Permite conexões de qualquer origem (ajuste em produção se necessário)
            methods: ["GET", "POST"]
        }
    });

    io.on('connection', (socket) => {
        console.log(`[SOCKET] Novo cliente conectado: ${socket.id}`);

        socket.on('atualizar_localizacao_motorista', async (dados) => {
            const { idMotorista, latitude, longitude, idCorrida } = dados;

            try {
                // Busca a corrida no banco (nomes em português conforme o novo schema)
                const corrida = await prisma.usuario.findUnique({
                    where: { id: idCorrida }, // Ajuste aqui se a relação for direta
                });
                
                // Nota: Usando a lógica de busca de Corrida que definimos
                const corridaAtiva = await prisma.corrida.findUnique({
                    where: { id: idCorrida },
                    select: {
                        latitude_origem: true,
                        longitude_origem: true,
                        id_passageiro: true,
                        status: true
                    }
                });

                if (corridaAtiva && corridaAtiva.status === 'ACEITA') {
                    // 1. Repassa a localização para o passageiro
                    io.to(corridaAtiva.id_passageiro).emit('posicao_motorista', {
                        latitude,
                        longitude
                    });

                    // 2. Geofencing (Cerca Virtual de 200m)
                    const distancia = calcularDistancia(
                        latitude,
                        longitude,
                        corridaAtiva.latitude_origem,
                        corridaAtiva.longitude_origem
                    );

                    if (distancia < 200) {
                        io.to(corridaAtiva.id_passageiro).emit('motorista_chegando', {
                            mensagem: "Seu motorista está chegando ao local!",
                            distancia: Math.round(distancia)
                        });
                    }
                }
            } catch (error) {
                console.error('[SOCKET ERROR] Erro ao processar localização:', error);
            }
        });

        socket.on('disconnect', () => {
            console.log(`[SOCKET] Cliente desconectado: ${socket.id}`);
        });
    });
};

// EXPORTAÇÃO IMPORTANTE: Deve ser um objeto contendo a função
module.exports = { initializeWebSocket };