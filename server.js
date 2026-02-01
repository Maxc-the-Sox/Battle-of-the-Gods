const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});
const path = require('path');

// Replit soll den Ordner "public" als Webseite anzeigen
app.use(express.static(path.join(__dirname, 'public')));

let games = {}; 
const PLAYER_COLORS = ["#ff4757", "#2e86de", "#2ecc71", "#f1c40f", "#9b59b6", "#e67e22"];

io.on('connection', (socket) => {
    console.log('Verbindung:', socket.id);

    // --- RAUM ERSTELLEN ---
    socket.on('createGame', (data) => {
        const roomName = data.roomName;
        const maxPlayers = data.maxPlayers ? parseInt(data.maxPlayers) : 2; 

        if (games[roomName]) {
            socket.emit('errorMsg', 'Raum existiert bereits!');
            return;
        }
        socket.join(roomName);
        
        games[roomName] = {
            players: [],
            maxPlayers: maxPlayers,
            settings: data.settings,
            started: false
        };
        addPlayerToGame(games[roomName], socket, roomName);
    });

    // --- RAUM BEITRETEN ---
    socket.on('joinGame', (roomName) => {
        const game = games[roomName];
        if (!game) { socket.emit('errorMsg', 'Raum nicht gefunden!'); return; }
        if (game.players.length >= game.maxPlayers) { socket.emit('errorMsg', 'Raum ist voll!'); return; }
        if (game.started) { socket.emit('errorMsg', 'Spiel läuft schon!'); return; }

        socket.join(roomName);
        addPlayerToGame(game, socket, roomName);
    });

    // --- SPIEL STARTEN ---
    socket.on('requestStartGame', (roomName) => {
        const game = games[roomName];
        if (!game) return;
        if (game.players[0].id !== socket.id) return; // Nur Host
        
        game.started = true;
        io.to(roomName).emit('gameStarted', { 
            playerCount: game.players.length, 
            settings: game.settings 
        });
    });

    // --- SPIELZÜGE ---
    socket.on('sendAction', (data) => {
        io.to(data.room).emit('receiveAction', {
            playerID: socket.id,
            type: data.actionType,
            payload: data.payload
        });
    });

    function addPlayerToGame(game, socket, roomName) {
        const idx = game.players.length;
        const newPlayer = { id: socket.id, index: idx, color: PLAYER_COLORS[idx], name: `Spieler ${idx + 1}` };
        game.players.push(newPlayer);
        
        socket.emit('joinedSuccess', { room: roomName, myIndex: idx, myColor: newPlayer.color, isHost: (idx === 0) });
        io.to(roomName).emit('updatePlayerList', game.players);
    }
});

// WICHTIG: Replit nutzt Port 3000 standardmäßig
http.listen(3000, () => {
    console.log('SERVER LÄUFT AUF REPLIT (PORT 3000)');
});