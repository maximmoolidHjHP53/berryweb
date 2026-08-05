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

    // Global user search
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
            
            // Notify receiver live if connected
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
            let requesterFriends = requesterDoc.friends || [];

            if (action === 'accept') {
                if (!userFriends.includes(requester)) userFriends.push(requester);
                if (!requesterFriends.includes(username)) requesterFriends.push(username);

                await usersCollection.updateOne({ username: requester }, { $set: { friends: requesterFriends } });
            }

            await usersCollection.updateOne({ username }, { $set: { friendRequests: requests, friends: userFriends } });

            socket.emit('friend_action_response', { success: true, list: userFriends, requests: requests });
            io.emit('refresh_friends_' + username);
            io.emit('refresh_friends_' + requester);
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
        // data: { sender, receiver, message, timestamp }
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

});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT} with full endpoint route mapping.`);
});
