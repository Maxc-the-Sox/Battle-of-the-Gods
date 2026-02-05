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
const https = require('https'); // Wichtig für den Download

app.use(express.static(path.join(__dirname, 'public')));

// --- DER KARTEN-LADER (FIX FÜR REPLIT) ---
app.get('/api/map', (req, res) => {
    // Hier nutzen wir encodeURI, damit die Leerzeichen in "Battle of the Gods" zu "%20" werden
    const rawUrl = 'https://raw.githubusercontent.com/Maxc-the-Sox/Battle-of-the-Gods/main/Battle of the Gods.json';
    const url = encodeURI(rawUrl);
    
    https.get(url, (externalRes) => {
        let data = '';
        externalRes.on('data', (chunk) => { data += chunk; });
        externalRes.on('end', () => {
            try {
                // Prüfen ob wir wirklich JSON bekommen haben
                const jsonData = JSON.parse(data);
                res.json(jsonData);
            } catch (e) {
                console.error("Fehler beim Parsen:", data.substring(0, 100)); // Zeigt die ersten 100 Zeichen des Fehlers
                res.status(500).send("Fehler: GitHub hat kein gültiges JSON geliefert. (Evtl. 404?)");
            }
        });
    }).on("error", (err) => {
        res.status(500).send("Server-Fehler beim Laden von GitHub: " + err.message);
    });
});

let games = {}; 
const PLAYER_COLORS = ["#ff4757", "#2e86de", "#2ecc71", "#f1c40f", "#9b59b6", "#e67e22"];

io.on('connection', (socket) => {
    console.log('Verbindung:', socket.id);

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

    socket.on('joinGame', (roomName) => {
        const game = games[roomName];
        if (!game) { socket.emit('errorMsg', 'Raum nicht gefunden!'); return; }
        if (game.players.length >= game.maxPlayers) { socket.emit('errorMsg', 'Raum ist voll!'); return; }
        if (game.started) { socket.emit('errorMsg', 'Spiel läuft schon!'); return; }

        socket.join(roomName);
        addPlayerToGame(game, socket, roomName);
    });

    socket.on('requestStartGame', (roomName) => {
        const game = games[roomName];
        if (!game) return;
        if (game.players[0].id !== socket.id) return;
        
        game.started = true;
        io.to(roomName).emit('gameStarted', { 
            playerCount: game.players.length, 
            settings: game.settings 
        });
    });

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

http.listen(3000, '0.0.0.0', () => {
    console.log('SERVER LÄUFT AUF REPLIT (PORT 3000)');
});