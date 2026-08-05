const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs'); // Added file system module to save data persistently locally

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, '.')));


// Path to a persistent storage file (or connect to MongoDB Atlas)
const DB_FILE = path.join(__dirname, 'users.json');

// Helper to read users
function getUsers() {
    if (!fs.existsSync(DB_FILE)) return [];
    try {
        const data = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        return [];
    }
}

// Helper to save users
function saveUsers(users) {
    fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));
}

// Core Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'home.html'));
});

// Routes
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'register.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));
app.get('/policy', (req, res) => res.sendFile(path.join(__dirname, 'policy.html')));

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

    // Save new user permanently
    users.push({ username, password });
    saveUsers(users);

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