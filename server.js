const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, '.')));

// Core Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'register.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});

app.get('/policy', (req, res) => {
    res.sendFile(path.join(__dirname, 'policy.html'));
});

    // Keep track of registered users in memory (or use a database later)
const registeredUsers = [];

app.post('/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ success: false, message: "All fields are required." });
    }

    // 1. Check if username already exists
    const existingUser = registeredUsers.find(user => user.username === username);
    if (existingUser) {
        return res.status(400).json({ success: false, message: "Username is already taken! Choose another." });
    }


    // High security regex: Min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char
    const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!\%*?&]{8,}$/;
    if (!strongPasswordRegex.test(password)) {
        return res.status(400).json({ 
            success: false, 
            message: "Password must be 8+ chars and include uppercase, lowercase, number, and special character." 
        });
    }

    // Save user to database logic here
    res.status(200).json({ success: true, message: "Registered successfully" });
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ success: false, message: "All fields are required." });
    }
    // Verify database login logic here
    res.status(200).json({ success: true, message: "Logged in successfully" });

    
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
