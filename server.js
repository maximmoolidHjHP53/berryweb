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

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    friends: { type: [String], default: [] } // Added friend list tracking
});
const User = mongoose.models.User || mongoose.model('User', userSchema);


// Routes
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'register.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));
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

// Live Search Endpoint
app.get('/api/search', async (req, res) => {
    const { q, user } = req.query;
    try {
        const users = await User.find({
            username: { $regex: q, $options: 'i', $ne: user }
        }).limit(5);
        res.json(users);
    } catch (err) {
        res.status(500).json([]);
    }
});

// Add Friend Endpoint
app.post('/api/add-friend', async (req, res) => {
    const { username, friendUsername } = req.body;
    try {
        const user = await User.findOne({ username });
        if (user && !user.friends.includes(friendUsername)) {
            user.friends.push(friendUsername);
            await user.save();
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: "Could not add friend." });
    }
});

// Get Friends Endpoint
app.get('/api/friends', async (req, res) => {
    const { user } = req.query;
    try {
        const dbUser = await User.findOne({ username: user });
        res.json({ friends: dbUser ? dbUser.friends : [] });
    } catch (err) {
        res.status(500).json({ friends: [] });
    }
});


const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

