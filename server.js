const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// CORS ayarlarıyla sunucuyu dış dünyaya açıyoruz
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Render'a yüklediğimizde index.html'i direkt ana sayfada göstermesi için
app.use(express.static(path.join(__dirname)));

const rooms = {};

io.on('connection', (socket) => {
    socket.on('join_room', ({ username, room }) => {
        socket.join(room);
        socket.currentRoom = room;
        socket.username = username;

        if (!rooms[room]) rooms[room] = {};
        rooms[room][socket.id] = { name: username };

        socket.to(room).emit('user_joined', { name: username });
        io.to(room).emit('update_users', rooms[room]);
    });

    socket.on('send_message', (msgData) => {
        socket.to(socket.currentRoom).emit('receive_message', msgData);
    });

    socket.on('send_reaction', (reactionData) => {
        socket.to(socket.currentRoom).emit('receive_reaction', reactionData);
    });

    socket.on('typing', (isTyping) => {
        socket.to(socket.currentRoom).emit('user_typing', { from: socket.username, on: isTyping });
    });

    // CANLI SESLİ GÖRÜŞME SİNYALLERİ (WebRTC)
    socket.on('vc_call', ({ offer }) => {
        socket.to(socket.currentRoom).emit('vc_call_incoming', { offer, from: socket.username, fromId: socket.id });
    });

    socket.on('vc_accept', ({ toId }) => {
        io.to(toId).emit('vc_call_accepted', { from: socket.username });
    });

    socket.on('vc_reject', ({ toId }) => {
        io.to(toId).emit('vc_call_rejected', { from: socket.username });
    });

    socket.on('vc_answer', ({ answer, toId }) => {
        io.to(toId).emit('vc_call_answer', { answer });
    });

    socket.on('vc_ice', ({ candidate }) => {
        socket.to(socket.currentRoom).emit('vc_call_ice', { candidate });
    });

    socket.on('vc_end', () => {
        socket.to(socket.currentRoom).emit('vc_call_ended', { from: socket.username });
    });

    socket.on('disconnect', () => {
        const room = socket.currentRoom;
        if (room && rooms[room] && rooms[room][socket.id]) {
            const username = socket.username;
            delete rooms[room][socket.id];
            socket.to(room).emit('user_left', { name: username });
            io.to(room).emit('update_users', rooms[room]);
        }
    });
});

// Render portu otomatik verir, vermezse 3000'i kullanır
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda aktif!`);
});