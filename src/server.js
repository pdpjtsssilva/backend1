const express = require('express');
const path = require('path');
const http = require('http');
const cors = require('cors');
require('dotenv').config();

// Importação da lógica de WebSocket (usando chaves para bater com o objeto exportado)
const { initializeWebSocket } = require('./websocket'); 

// Importação das rotas (Garantindo os caminhos padrão do seu projeto)
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');

const app = express();
const server = http.createServer(app);

// Middlewares essenciais
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 1. Servir o Painel Admin (Arquivos Estáticos)
// Permite que você acesse o painel via navegador em /admin
app.use('/admin', express.static(path.join(__dirname, '../admin-panel')));

// 2. Registro das Rotas da API
// Estas são as rotas que o seu aplicativo mobile e o painel vão chamar
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);

// 3. Inicialização do WebSocket
// Passamos o servidor HTTP para que o Socket.io funcione na mesma porta
initializeWebSocket(server);

// Rota de teste para verificar se o servidor está online
app.get('/api/status', (req, res) => {
    res.json({ 
        status: 'Servidor L\'europe Online', 
        timestamp: new Date(),
        node_version: process.version 
    });
});

// Definição da porta (Padrão 10000 para o Render ou 3002 local)
const PORT = process.env.PORT || 10000;

server.listen(PORT, () => {
    console.log(`=========================================`);
    console.log(`SERVIDOR ATIVO NA PORTA: ${PORT}`);
    console.log(`PAINEL ADMIN: http://localhost:${PORT}/admin`);
    console.log(`=========================================`);
});