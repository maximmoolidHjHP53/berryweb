const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Persistent JSON Database File Path
const dbFile = path.join(__dirname, 'users.json');

// Helper functions to read and write database safely
function loadDatabase() {
    if (!fs.existsSync(dbFile)) {
        fs.writeFileSync(dbFile, JSON.stringify({ users: {} }, null, 2));
    }
    const data = fs.readFileSync(dbFile, 'utf8');
    try {
        return JSON.parse(data);
    } catch (e) {
        return { users: {} };
    }
}

function saveDatabase(dbData) {
    fs.writeFileSync(dbFile, JSON.stringify(dbData, null, 2));
}

// Page Routes
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'home.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'register.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/policy', (req, res) => res.sendFile(path.join(__dirname, 'policy.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));
app.get('/chat', (req, res) => res.sendFile(path.join(__dirname, 'chat.html')));

// API: Register User (Saved persistently to users.json)
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    const usernameRegex = /^[a-zA-Z0-9]{4,20}$/;
    const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,}$/;

    if (!usernameRegex.test(username) || !passwordRegex.test(password)) {
        return res.json({ success: false, message: "Invalid format. Check security requirements." });
    }

    const db = loadDatabase();
    if (db.users[username]) {
        return res.json({ success: false, message: "Username already exists!" });
    }

    // Save new user profile
    db.users[username] = {
        password: password,
        policyAccepted: false,
        friends: []
    };
    saveDatabase(db);

    res.json({ success: true, isNewUser: true });
});

// API: Login User (Verified from users.json)
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const db = loadDatabase();

    const user = db.users[username];
    if (user && user.password === password) {
        res.json({ success: true, policyAccepted: user.policyAccepted });
    } else {
        res.json({ success: false, message: "Invalid username or password!" });
    }
});

// API: Accept Policy Status Update in Database
app.post('/api/accept-policy', (req, res) => {
    const { username } = req.body;
    const db = loadDatabase();

    if (db.users[username]) {
        db.users[username].policyAccepted = true;
        saveDatabase(db);
        return res.json({ success: true });
    }
    res.json({ success: false, message: "User not found." });
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

io.on('connection', (socket) => {
    socket.on('add_friend', (data) => {
        const { user, friend } = data;
        const db = loadDatabase();

        if (db.users[friend] && user !== friend) {
            if (!db.users[user].friends) db.users[user].friends = [];
            
            if (!db.users[user].friends.includes(friend)) {
                db.users[user].friends.push(friend);
                saveDatabase(db);
                socket.emit('friend_added_success', { friend, list: db.users[user].friends });
            } else {
                socket.emit('error_msg', "Already friends!");
            }
        } else {
            socket.emit('error_msg', "User does not exist!");
        }
    });

    socket.on('send_message', (data) => {
        io.emit('receive_message', data);
    });
});

server.listen(3000, () => {
    console.log('Server running on http://localhost:3000 with robust file database storage.');
});
