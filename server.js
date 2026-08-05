const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json());
app.use(express.static(path.join(__dirname, '.')));

// Connect using the Render environment variable
const MONGO_URI = process.env.MONGO_URI; 

mongoose.connect(MONGO_URI)
    .then(() => console.log("Connected to MongoDB Atlas successfully!"))
    .catch(err => console.error("MongoDB Connection Error:", err.message));

// 1. Update User Schema to include pending requests and inbox state flags
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    friends: { type: [String], default: [] },
    friendRequests: { type: [String], default: [] }, // Incoming requests
    sentRequests: { type: [String], default: [] },   // Outgoing pending requests
    unreadInbox: { type: Boolean, default: false }   // Red badge tracker
});
const User = mongoose.models.User || mongoose.model('User', userSchema);



// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'home.html')); // or 'home.html'

app.get('/chat', (req, res) => res.sendFile(path.join(__dirname, 'chat.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'register.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));
app.get('/inbox', (req, res) => res.sendFile(path.join(__dirname, 'inbox.html')));
app.get('/policy', (req, res) => res.sendFile(path.join(__dirname, 'policy.html')));

app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ success: false, message: "All fields are required." });
    }

    const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!strongPasswordRegex.test(password)) {
        return res.status(400).json({ success: false, message: "Password must be 8+ chars with uppercase, lowercase, number & special symbol." });
    }

    try {
        const existing = await User.findOne({ username });
        if (existing) {
            return res.status(400).json({ success: false, message: "Username is already taken!" });
        }
        await User.create({ username, password });
        res.status(200).json({ success: true, message: "Registered successfully" });
    } catch (err) {
        res.status(500).json({ success: false, message: "Database server error." });
    }
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await User.findOne({ username, password });
        if (!user) {
            return res.status(400).json({ success: false, message: "Invalid username or password." });
        }
        res.status(200).json({ success: true, message: "Logged in successfully" });
    } catch (err) {
        res.status(500).json({ success: false, message: "Database login error." });
    }
});

// Enhanced Search Endpoint with request status flags
app.get('/api/search', async (req, res) => {
    const { q, user } = req.query;
    try {
        const currentUser = await User.findOne({ username: user });
        const allUsers = await User.find({
            username: { $regex: q, $options: 'i', $ne: user }
        }).limit(5);

        const formattedUsers = allUsers.map(u => {
            let status = 'none';
            if (currentUser.friends.includes(u.username)) status = 'friends';
            else if (currentUser.sentRequests.includes(u.username)) status = 'pending_sent';
            else if (currentUser.friendRequests.includes(u.username)) status = 'pending_received';
            return { username: u.username, status };
        });

        res.json({ users: formattedUsers });
    } catch (err) {
        res.status(500).json({ users: [] });
    }
});

// Send Friend Request Endpoint
app.post('/api/send-request', async (req, res) => {
    const { username, friendUsername } = req.body;
    try {
        const sender = await User.findOne({ username });
        const receiver = await User.findOne({ username: friendUsername });

        if (!receiver || sender.friends.includes(friendUsername) || sender.sentRequests.includes(friendUsername)) {
            return res.status(400).json({ success: false, message: "Request cannot be sent." });
        }

        sender.sentRequests.push(friendUsername);
        receiver.friendRequests.push(username);
        receiver.unreadInbox = true; // Trigger red notification badge

        await sender.save();
        await receiver.save();

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: "Server error." });
    }
});

// Get Pending Requests
app.get('/api/friend-requests', async (req, res) => {
    const { user } = req.query;
    try {
        const dbUser = await User.findOne({ username: user });
        if (dbUser) {
            dbUser.unreadInbox = false; // Clear unread badge when user opens inbox
            await dbUser.save();
        }
        res.json({ requests: dbUser ? dbUser.friendRequests : [] });
    } catch (err) {
        res.status(500).json({ requests: [] });
    }
});

// Respond to Request (Accept or Decline)
app.post('/api/respond-request', async (req, res) => {
    const { username, senderUsername, action } = req.body;
    try {
        const recipient = await User.findOne({ username });
        const sender = await User.findOne({ username: senderUsername });

        recipient.friendRequests = recipient.friendRequests.filter(u => u !== senderUsername);
        if (sender) {
            sender.sentRequests = sender.sentRequests.filter(u => u !== username);
        }

        if (action === 'accept') {
            if (!recipient.friends.includes(senderUsername)) recipient.friends.push(senderUsername);
            if (sender && !sender.friends.includes(username)) sender.friends.push(username);
        }

        await recipient.save();
        if (sender) await sender.save();

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: "Error processing request." });
    }
});

// Check Inbox Badge Count
app.get('/api/inbox-count', async (req, res) => {
    const { user } = req.query;
    try {
        const dbUser = await User.findOne({ username: user });
        const count = (dbUser && dbUser.unreadInbox) ? dbUser.friendRequests.length : 0;
        res.json({ count });
    } catch (err) {
        res.json({ count: 0 });
    }
});

// Get Only True Friends List
app.get('/api/friends', async (req, res) => {
    const { user } = req.query;
    try {
        const dbUser = await User.findOne({ username: user });
        if (!dbUser) return res.json({ friends: [] });

        const friendsData = dbUser.friends.map(friendName => ({
            username: friendName,
            unreadCount: 0 // Will connect to live chat counter next
        }));

        res.json({ friends: friendsData });
    } catch (err) {
        res.status(500).json({ friends: [] });
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

