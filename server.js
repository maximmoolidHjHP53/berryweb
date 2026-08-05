const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { MongoClient } = require('mongodb');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
    cors: { origin: "*", methods: ["GET", "POST"] } 
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

// MongoDB Atlas Connection Setup
const mongoUri = process.env.MONGO_URI || process.env.DATABASE_URL || "mongodb+srv://maximoolid123:maximoolid123@cluster0.b737s.mongodb.net/?retryWrites=true&w=majority";
let db;

MongoClient.connect(mongoUri, { useUnifiedTopology: true })
    .then(client => {
        db = client.db('berryweb');
        console.log("Connected successfully to MongoDB Atlas database.");
    })
    .catch(err => {
        console.error("Database connection failure:", err);
    });

// Page Route Endpoints
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'home.html')); // Serves your landing page first
});

app.get('/home', (req, res) => {
    res.sendFile(path.join(__dirname, 'home.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'register.html')); // Serves the registration page
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});

app.get('/chat', (req, res) => {
    res.sendFile(path.join(__dirname, 'chat.html'));
});

app.get('/profile', (req, res) => {
    res.sendFile(path.join(__dirname, 'profile.html'));
});


// Authentication Routes
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const usersCollection = db.collection('users');
        const user = await usersCollection.findOne({ username, password });
        if (user) {
            res.json({ success: true, message: "Login successful!" });
        } else {
            res.json({ success: false, message: "Invalid username or password." });
        }
    } catch (e) {
        res.json({ success: false, message: "Server error during login." });
    }
});

app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        const usersCollection = db.collection('users');
        const existing = await usersCollection.findOne({ username });
        if (existing) {
            res.json({ success: false, message: "Username already taken." });
            return;
        }
        await usersCollection.insertOne({ 
            username, 
            password, 
            friends: [], 
            friendRequests: [] 
        });
        res.json({ success: true, message: "Registration successful!" });
    } catch (e) {
        res.json({ success: false, message: "Server error during registration." });
    }
});

// Socket.io Real-Time Event Handlers
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Global user directory search
    socket.on('get_all_users', async () => {
        try {
            const usersCollection = db.collection('users');
            const usersList = await usersCollection.find({}).toArray();
            const usernames = usersList.map(u => u.username || u.user).filter(Boolean);
            socket.emit('all_users_list', usernames);
        } catch (e) {
            socket.emit('all_users_list', []);
        }
    });

    // Fetch user profile data including friends and pending requests
    socket.on('get_user_data', async (username) => {
        try {
            const usersCollection = db.collection('users');
            const user = await usersCollection.findOne({ username });
            if (user) {
                socket.emit('user_data_response', {
                    friends: user.friends || [],
                    friendRequests: user.friendRequests || []
                });
            }
        } catch (e) {
            socket.emit('user_data_response', { friends: [], friendRequests: [] });
        }
    });

    // Send Friend Request
    socket.on('send_friend_request', async ({ sender, receiver }) => {
        try {
            const usersCollection = db.collection('users');
            const targetUser = await usersCollection.findOne({ username: receiver });
            if (!targetUser) {
                socket.emit('friend_action_response', { success: false, message: 'User does not exist!' });
                return;
            }

            let requests = targetUser.friendRequests || [];
            let friends = targetUser.friends || [];

            if (friends.includes(sender)) {
                socket.emit('friend_action_response', { success: false, message: 'You are already friends!' });
                return;
            }

            if (requests.includes(sender)) {
                socket.emit('friend_action_response', { success: false, message: 'Friend request already sent!' });
                return;
            }

            requests.push(sender);
            await usersCollection.updateOne({ username: receiver }, { $set: { friendRequests: requests } });
            
            socket.emit('friend_action_response', { success: true, message: 'Friend request sent successfully!' });
            io.emit('refresh_requests_' + receiver);
        } catch (e) {
            socket.emit('friend_action_response', { success: false, message: 'Server error sending request.' });
        }
    });

    // Accept or Reject Friend Request
    socket.on('respond_friend_request', async ({ username, requester, action }) => {
        try {
            const usersCollection = db.collection('users');
            const userDoc = await usersCollection.findOne({ username });
            const requesterDoc = await usersCollection.findOne({ username: requester });

            let requests = userDoc.friendRequests || [];
            requests = requests.filter(r => r !== requester);

            let userFriends = userDoc.friends || [];
            let requesterFriends = requesterDoc ? (requesterDoc.friends || []) : [];

            if (action === 'accept') {
                if (!userFriends.includes(requester)) userFriends.push(requester);
                if (requesterDoc && !requesterFriends.includes(username)) {
                    requesterFriends.push(username);
                    await usersCollection.updateOne({ username: requester }, { $set: { friends: requesterFriends } });
                }
            }

            await usersCollection.updateOne({ username }, { $set: { friendRequests: requests, friends: userFriends } });

            socket.emit('friend_action_response', { success: true, list: userFriends, requests: requests });
            io.emit('refresh_friends_' + username);
            if (requesterDoc) io.emit('refresh_friends_' + requester);
            io.emit('refresh_requests_' + username);
        } catch (e) {
            console.error(e);
        }
    });

    // Real-time typing indicators & Messaging
    socket.on('typing', (data) => {
        io.emit('display_typing', data);
    });

    socket.on('send_message', async (data) => {
        try {
            const messagesCollection = db.collection('messages');
            await messagesCollection.insertOne(data);
            io.emit('receive_message', data);
        } catch (e) {
            console.error(e);
        }
    });

    socket.on('get_messages', async ({ user1, user2 }) => {
        try {
            const messagesCollection = db.collection('messages');
            const msgs = await messagesCollection.find({
                $or: [
                    { sender: user1, receiver: user2 },
                    { sender: user2, receiver: user1 }
                ]
            }).sort({ timestamp: 1 }).toArray();
            socket.emit('loaded_messages', msgs);
        } catch (e) {
            socket.emit('loaded_messages', []);
        }
    });

    socket.on('disconnect', () => {
        // User disconnected
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running smoothly on port ${PORT}`);
});
