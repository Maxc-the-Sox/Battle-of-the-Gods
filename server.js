const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

// Wir sagen dem Server: "Alle Dateien im Ordner 'public' sind für den Browser sichtbar"
app.use(express.static(path.join(__dirname, 'public')));

// Speicher für alle laufenden Spiele
let games = {}; 

// Die festen Farben für Spieler 1 bis 6
const PLAYER_COLORS = ["#ff4757", "#2e86de", "#2ecc71", "#f1c40f", "#9b59b6", "#e67e22"];

io.on('connection', (socket) => {
    console.log('Verbindung:', socket.id);

    // --- 1. SPIEL ERSTELLEN ---
    socket.on('createGame', (data) => {
        const roomName = data.roomName;
        // Fallback, falls maxPlayers nicht gesendet wurde
        const maxPlayers = data.maxPlayers ? parseInt(data.maxPlayers) : 2; 

        if (games[roomName]) {
            socket.emit('errorMsg', 'Raum existiert bereits!');
            return;
        }

        socket.join(roomName);
        
        games[roomName] = {
            players: [],
            maxPlayers: maxPlayers, // Das Limit aus dem Menü
            settings: data.settings, // Die Spielregeln (Ringe, Artefakte)
            started: false
        };

        // Host hinzufügen
        addPlayerToGame(games[roomName], socket, roomName);
        console.log(`Spiel "${roomName}" erstellt (Max: ${maxPlayers})`);
    });

    // --- 2. SPIEL BEITRETEN ---
    socket.on('joinGame', (roomName) => {
        const game = games[roomName];

        if (!game) {
            socket.emit('errorMsg', 'Raum nicht gefunden!');
            return;
        }
        
        // Prüfen gegen das gewählte Limit
        if (game.players.length >= game.maxPlayers) {
            socket.emit('errorMsg', `Raum ist voll! (Max ${game.maxPlayers} Spieler)`);
            return;
        }
        
        if (game.started) {
            socket.emit('errorMsg', 'Das Spiel läuft bereits!');
            return;
        }

        socket.join(roomName);
        addPlayerToGame(game, socket, roomName);
        console.log(`Spieler beigetreten zu "${roomName}"`);
    });

    // --- 3. SPIEL STARTEN (Nur Host) ---
    socket.on('requestStartGame', (roomName) => {
        const game = games[roomName];
        if (!game) return;

        // Nur Host darf starten (Index 0)
        if (game.players[0].id !== socket.id) return;

        game.started = true;
        
        // Einstellungen an ALLE senden
        io.to(roomName).emit('gameStarted', { 
            playerCount: game.players.length,
            settings: game.settings 
        });
        console.log(`Spiel "${roomName}" gestartet!`);
    });

    // --- 4. SPIELZUG WEITERLEITEN ---
    socket.on('sendAction', (data) => {
        const game = games[data.room];
        if (!game) return;

        // Leitet Aktion an ALLE im Raum weiter (inklusive Sender)
        io.to(data.room).emit('receiveAction', {
            playerID: socket.id,
            type: data.actionType,
            payload: data.payload
        });
    });

    // Hilfsfunktion: Spieler hinzufügen
    function addPlayerToGame(game, socket, roomName) {
        const playerIndex = game.players.length;
        
        const newPlayer = {
            id: socket.id,
            index: playerIndex,
            color: PLAYER_COLORS[playerIndex],
            name: `Spieler ${playerIndex + 1}`
        };

        game.players.push(newPlayer);

        // Antwort an den Spieler
        socket.emit('joinedSuccess', {
            room: roomName,
            myIndex: playerIndex,
            myColor: newPlayer.color,
            isHost: (playerIndex === 0)
        });

        // Update für alle in der Lobby
        io.to(roomName).emit('updatePlayerList', game.players);
    }

    socket.on('disconnect', () => {
        // (Optional: Cleanup Logik, falls nötig)
    });
});

// --- SERVER STARTEN (MIT PORT ERKENNUNG) ---
// WICHTIG FÜR GLITCH: process.env.PORT nutzen!
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`✅ SERVER LÄUFT AUF PORT ${PORT}`);
});