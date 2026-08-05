const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '.')));

// Root Landing Page Route (Fixes the "Cannot GET /" error)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

// Add this with your other page routes in server.js
app.get('/policy', (req, res) => {
    res.sendFile(path.join(__dirname, 'policy.html'));
});


// Routes for HTML Pages
app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'register.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// API Endpoint for Registration
app.post('/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ success: false, message: "All fields are required." });
    }
    // Add your database registration logic here
    res.status(200).json({ success: true, message: "Registered successfully" });
});

// API Endpoint for Login
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ success: false, message: "All fields are required." });
    }
    // Add your database verification logic here
    res.status(200).json({ success: true, message: "Logged in successfully" });
});

// Socket.io Connection
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
