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

const MONGO_URI = process.env.MONGO_URI;

mongoose.connect(MONGO_URI)
    .then(() => console.log("Connected to MongoDB Atlas successfully!"))
    .catch(err => console.error("MongoDB Connection Error:", err.message));

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    friends: { type: [String], default: [] },
    friendRequests: { type: [String], default: [] },
    sentRequests: { type: [String], default: [] },
    unreadInbox: { type: Boolean, default: true }
});
const User = mongoose.models.User || mongoose.model('User', userSchema);

const messageSchema = new mongoose.Schema({
    sender: String,
    receiver: String,
    text: String,
    image: { type: String, default: '' },
    read: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});
const Message = mongoose.models.Message || mongoose.model('Message', messageSchema);

// Routes
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/home', (req, res) => res.sendFile(path.join(__dirname, 'home.html')));
app.get('/chat', (req, res) => res.sendFile(path.join(__dirname, 'chat.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'register.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));
app.get('/inbox', (req, res) => res.sendFile(path.join(__dirname, 'inbox.html')));
app.get('/policy', (req, res) => res.sendFile(path.join(__dirname, 'policy.html')));

app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, message: "All fields are required." });
    try {
        const existingUser = await User.findOne({ username });
        if (existingUser) return res.status(400).json({ success: false, message: "Username already taken." });
        await User.create({ username, password });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: "Server error." });
    }
});

// --- Socket.io Real-Time Messaging & Unread Counter ---
io.on('connection', (socket) => {
    socket.on('join', (username) => {
        socket.join(username);
    });

    socket.on('send_message', (data) => {
        // data: { sender, receiver, text, image }
        // Broadcast the message live to the receiver's room
        io.to(data.receiver).emit('receive_message', data);
        
        // Also notify receiver's inbox list to update the unread badge and snippet
        io.to(data.receiver).emit('update_inbox', {
            sender: data.sender,
            text: data.text || 'Sent a photo',
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
    });

    socket.on('typing', ({ sender, receiver, typing }) => {
        io.to(receiver).emit('display_typing', { sender, typing });
    });
});


// --- Socket.io Real-Time Messaging & Unread Counter ---
io.on('connection', (socket) => {
    socket.on('join', (username) => {
        socket.join(username);
    });

    socket.on('send_message', async (data) => {
        try {
            // Save message to MongoDB database so it persists
            const newMessage = new Message({
                sender: data.sender,
                receiver: data.receiver,
                text: data.text || '',
                image: data.image || '',
                read: false,
                createdAt: new Date()
            });
            await newMessage.save();

            const formattedTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            // Broadcast the message live to the receiver's room
            io.to(data.receiver).emit('receive_message', {
                sender: data.sender,
                receiver: data.receiver,
                text: data.text,
                image: data.image,
                time: formattedTime,
                read: false
            });
            
            // Notify receiver's inbox list to update unread badge and snippet live
            io.to(data.receiver).emit('update_inbox', {
                sender: data.sender,
                text: data.text || 'Sent a photo',
                time: formattedTime
            });
        } catch (err) {
            console.error("Socket message save error:", err.message);
        }
    });

    socket.on('typing', ({ sender, receiver, typing }) => {
        io.to(receiver).emit('display_typing', { sender, typing });
    });
});




app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await User.findOne({ username, password });
        if (!user) return res.status(400).json({ success: false, message: "Invalid credentials." });
        res.json({ success: true, username: user.username });
    } catch (err) {
        res.status(500).json({ success: false, message: "Server error." });
    }
});

app.get('/api/search', async (req, res) => {
    const { q, user } = req.query;
    try {
        const currentUser = await User.findOne({ username: user });
        const allUsers = await User.find({ username: { $regex: q, $options: 'i', $ne: user } }).limit(5);
        const formattedUsers = allUsers.map(u => {
            let status = 'none';
            if (currentUser && currentUser.friends && currentUser.friends.includes(u.username)) status = 'friends';
            else if (currentUser && currentUser.sentRequests && currentUser.sentRequests.includes(u.username)) status = 'pending_sent';
            else if (currentUser && currentUser.friendRequests && currentUser.friendRequests.includes(u.username)) status = 'pending_received';
            return { username: u.username, status };
        });
        res.json({ users: formattedUsers });
    } catch (err) {
        res.status(500).json({ users: [] });
    }
});

app.post('/api/send-request', async (req, res) => {
    const { username, friendUsername } = req.body;
    try {
        const sender = await User.findOne({ username });
        const receiver = await User.findOne({ username: friendUsername });
        if (!receiver || sender.friends.includes(friendUsername) || sender.sentRequests.includes(friendUsername)) {
            return res.status(400).json({ success: false });
        }
        sender.sentRequests.push(friendUsername);
        receiver.friendRequests.push(username);
        receiver.unreadInbox = true;
        await sender.save();
        await receiver.save();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

app.get('/api/friend-requests', async (req, res) => {
    const { user } = req.query;
    try {
        const dbUser = await User.findOne({ username: user });
        if (dbUser) {
            dbUser.unreadInbox = false;
            await dbUser.save();
        }
        res.json({ requests: dbUser ? dbUser.friendRequests : [] });
    } catch (err) {
        res.status(500).json({ requests: [] });
    }
});

app.post('/api/respond-request', async (req, res) => {
    const { username, senderUsername, action } = req.body;
    try {
        const recipient = await User.findOne({ username });
        const sender = await User.findOne({ username: senderUsername });
        recipient.friendRequests = recipient.friendRequests.filter(u => u !== senderUsername);
        if (sender) sender.sentRequests = sender.sentRequests.filter(u => u !== username);
        if (action === 'accept') {
            if (!recipient.friends.includes(senderUsername)) recipient.friends.push(senderUsername);
            if (sender && !sender.friends.includes(username)) sender.friends.push(username);
        }
        await recipient.save();
        if (sender) await sender.save();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// --- Persistent Typing Status (Using Database/File storage) ---
let typingStore = {}; // Fallback storage or map linked to your database schema if applicable

app.post('/api/typing', (req, res) => {
    try {
        const { user, friend, typing } = req.body;
        if (!user || !friend) return res.status(400).json({ error: 'Missing parameters' });
        
        if (!global.activeTyping) global.activeTyping = {};
        global.activeTyping[`${user}_${friend}`] = { typing, time: Date.now() };
        
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/get-typing', (req, res) => {
    try {
        const { user, friend } = req.query; // user = friend you are chatting with, friend = you
        if (!user || !friend || !global.activeTyping) {
            return res.json({ isTyping: false });
        }
        
        const record = global.activeTyping[`${user}_${friend}`];
        // Expire typing status automatically if no heartbeat for 4 seconds
        if (record && record.typing && (Date.now() - record.time < 4000)) {
            return res.json({ isTyping: true });
        }
        
        res.json({ isTyping: false });
    } catch (err) {
        res.json({ isTyping: false });
    }
});


// Add these routes to your server.js file alongside your other API routes

app.get('/api/unread-counts', (req, res) => {
    try {
        const { user } = req.query;
        if (!user) return res.json({ counts: {} });

        const db = readDatabase();
        const counts = {};

        if (db.messages && Array.isArray(db.messages)) {
            db.messages.forEach(msg => {
                if (msg.receiver === user && !msg.read) {
                    counts[msg.sender] = (counts[msg.sender] || 0) + 1;
                }
            });
        }

        res.json({ counts });
    } catch (err) {
        res.json({ counts: {} });
    }
});

app.post('/api/mark-read', (req, res) => {
    try {
        const { user, friend } = req.body;
        const db = readDatabase();
        
        if (db.messages && Array.isArray(db.messages)) {
            db.messages.forEach(msg => {
                if (msg.receiver === user && msg.sender === friend) {
                    msg.read = true;
                }
            });
            writeDatabase(db);
        }
        
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false });
    }
});


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

app.get('/api/friends', async (req, res) => {
    const { user } = req.query;
    try {
        const dbUser = await User.findOne({ username: user });
        if (!dbUser) return res.json({ friends: [] });
        const friendsData = await Promise.all(dbUser.friends.map(async (friendName) => {
            const unreadCount = await Message.countDocuments({ sender: friendName, receiver: user, read: false });
            return { username: friendName, unreadCount };
        }));
        res.json({ friends: friendsData });
    } catch (err) {
        res.status(500).json({ friends: [] });
    }
});

app.get('/api/messages', async (req, res) => {
    const { user, friend } = req.query;
    try {
        await Message.updateMany({ sender: friend, receiver: user, read: false }, { $set: { read: true } });
        const messages = await Message.find({
            $or: [
                { sender: user, receiver: friend },
                { sender: friend, receiver: user }
            ]
        }).sort({ createdAt: 1 });
        res.json({ messages });
    } catch (err) {
        res.status(500).json({ messages: [] });
    }
});

app.post('/api/send-message', async (req, res) => {
    const { sender, receiver, text, image } = req.body;
    try {
        await Message.create({ sender, receiver, text: text || '', image: image || '', read: false });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

