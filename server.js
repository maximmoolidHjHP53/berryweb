const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const { MongoClient } = require('mongodb');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const mongoUri = process.env.MONGO_URI || "mongodb+srv://airmountcompany_db_user:1VPKvXnqbkyKT4Fh@cluster0.2dihhnv.mongodb.net/telegram_clone?retryWrites=true&w=majority&appName=Cluster0";
let db;

MongoClient.connect(mongoUri)
    .then(client => {
        console.log("Connected to MongoDB Atlas Cloud Database successfully.");
        db = client.db('telegram_clone');
    })
    .catch(err => console.error("Database connection error:", err));

// Page Routes - Ensuring all views are properly mapped
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'home.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'register.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/policy', (req, res) => res.sendFile(path.join(__dirname, 'policy.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));
app.get('/chat', (req, res) => res.sendFile(path.join(__dirname, 'chat.html')));
app.get('/profile', (req, res) => res.sendFile(path.join(__dirname, 'profile.html')));

// API: Register User
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    const usernameRegex = /^[a-zA-Z0-9]{4,20}$/;
    const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,}$/;

    if (!usernameRegex.test(username) || !passwordRegex.test(password)) {
        return res.json({ success: false, message: "Invalid format. Check security requirements." });
    }

    try {
        const usersCollection = db.collection('users');
        const existingUser = await usersCollection.findOne({ username });
        if (existingUser) {
            return res.json({ success: false, message: "Username already exists!" });
        }

        await usersCollection.insertOne({
            username,
            password,
            policyAccepted: false,
            friends: []
        });

        res.json({ success: true, isNewUser: true });
    } catch (e) {
        res.json({ success: false, message: "Database error during registration." });
    }
});

// API: Login User
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const usersCollection = db.collection('users');
        const user = await usersCollection.findOne({ username, password });

        if (user) {
            res.json({ success: true, policyAccepted: user.policyAccepted });
        } else {
            res.json({ success: false, message: "Invalid username or password!" });
        }
    } catch (e) {
        res.json({ success: false, message: "Database lookup error." });
    }
});

// API: Accept Policy Status Update
app.post('/api/accept-policy', async (req, res) => {
    const { username } = req.body;

    try {
        const usersCollection = db.collection('users');
        const result = await usersCollection.updateOne(
            { username },
            { $set: { policyAccepted: true } }
        );

        if (result.modifiedCount > 0 || result.matchedCount > 0) {
            res.json({ success: true });
        } else {
            res.json({ success: false, message: "User not found." });
        }
    } catch (e) {
        res.json({ success: false, message: "Update failed." });
    }
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

io.on('connection', (socket) => {
    socket.on('add_friend', async (data) => {
        const { user, friend } = data;
        try {
            const usersCollection = db.collection('users');
            const targetUser = await usersCollection.findOne({ username: friend });

            if (targetUser && user !== friend) {
                const currentUser = await usersCollection.findOne({ username: user });
                let friends = currentUser.friends || [];

                if (!friends.includes(friend)) {
                    friends.push(friend);
                    await usersCollection.updateOne({ username: user }, { $set: { friends } });
                    socket.emit('friend_added_success', { friend, list: friends });
                } else {
                    socket.emit('error_msg', "Already friends!");
                }
            } else {
                socket.emit('error_msg', "User does not exist!");
            }
        } catch (e) {
            socket.emit('error_msg', "Database error adding friend.");
        }
    });

    socket.on('send_message', (data) => {
        io.emit('receive_message', data);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT} with full endpoint route mapping.`);
});
