const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

// In-Memory Database
let users = {}; 
let messages = []; 
let onlineUsers = {}; // Tracks socket.id <-> username

// Express API Routes for Login/Register
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (users[username] && users[username].password === password) {
        res.json({ success: true, username });
    } else {
        res.json({ success: false, message: 'Invalid username or password!' });
    }
});

app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.json({ success: false, message: 'All fields are required!' });
    }
    if (users[username]) {
        res.json({ success: false, message: 'Username already taken!' });
    } else {
        users[username] = {
            password,
            friends: [],
            friendRequests: [],
            bio: 'Hello! I am using Berryweb.',
            avatar: '',
            regDate: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
            unreadCounts: {} // tracks unread messages per sender
        };
        res.json({ success: true });
    }
});

// Page Routes
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'home.html')));
app.get('/home', (req, res) => res.sendFile(path.join(__dirname, 'home.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'register.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));
app.get('/chat', (req, res) => res.sendFile(path.join(__dirname, 'chat.html')));
app.get('/profile', (req, res) => res.sendFile(path.join(__dirname, 'profile.html')));

// Socket.io Handlers
io.on('connection', (socket) => {
    
    socket.on('user_online', (username) => {
        if (username) {
            onlineUsers[socket.id] = username;
            io.emit('update_online_status', Object.values(onlineUsers));
        }
    });

    socket.on('register_user', (data) => {
        const { username, password } = data;
        if (!username || !password) {
            socket.emit('register_error', 'All fields are required!');
            return;
        }
        if (users[username]) {
            socket.emit('register_error', 'Username already taken!');
        } else {
            users[username] = {
                password,
                friends: [],
                friendRequests: [],
                bio: 'Hello! I am using Berryweb.',
                avatar: '',
                regDate: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
                unreadCounts: {}
            };
            socket.emit('register_success');
        }
    });

    socket.on('login_user', (data) => {
        const { username, password } = data;
        if (users[username] && users[username].password === password) {
            socket.emit('login_success', username);
        } else {
            socket.emit('login_error', 'Invalid username or password!');
        }
    });

    socket.on('get_all_users', () => {
        socket.emit('all_users_list', Object.keys(users));
    });

    socket.on('get_user_data', (username) => {
        if (users[username]) {
            socket.emit('user_data_response', users[username]);
        }
    });

    socket.on('update_profile', (data) => {
        const { username, bio, avatar } = data;
        if (users[username]) {
            if (bio !== undefined) users[username].bio = bio;
            if (avatar !== undefined) users[username].avatar = avatar;
            io.emit('profile_updated_' + username, users[username]);
        }
    });

    socket.on('send_friend_request', (data) => {
        const { sender, receiver } = data;
        if (users[receiver] && !users[receiver].friendRequests.includes(sender) && !users[receiver].friends.includes(sender)) {
            users[receiver].friendRequests.push(sender);
            io.emit('refresh_requests_' + receiver);
        }
    });

    socket.on('respond_friend_request', (data) => {
        const { username, requester, action } = data;
        if (users[username]) {
            users[username].friendRequests = users[username].friendRequests.filter(u => u !== requester);
            if (action === 'accept') {
                if (!users[username].friends.includes(requester)) users[username].friends.push(requester);
                if (users[requester] && !users[requester].friends.includes(username)) {
                    users[requester].friends.push(username);
                }
                io.emit('refresh_friends_' + requester);
            }
            io.emit('refresh_friends_' + username);
            io.emit('refresh_requests_' + username);
        }
    });

    socket.on('get_messages', (data) => {
        const { user1, user2 } = data;
        const conversation = messages.filter(m => 
            (m.sender === user1 && m.receiver === user2) || 
            (m.sender === user2 && m.receiver === user1)
        );
        // Clear unread count for user1 from user2
        if (users[user1] && users[user1].unreadCounts) {
            users[user1].unreadCounts[user2] = 0;
        }
        socket.emit('loaded_messages', conversation);
        socket.emit('update_unread', users[user1]?.unreadCounts || {});
    });

    socket.on('send_message', (data) => {
        messages.push(data);
        if (users[data.receiver]) {
            if (!users[data.receiver].unreadCounts) users[data.receiver].unreadCounts = {};
            users[data.receiver].unreadCounts[data.sender] = (users[data.receiver].unreadCounts[data.sender] || 0) + 1;
            io.emit('update_unread_' + data.receiver, users[data.receiver].unreadCounts);
        }
        io.emit('receive_message', data);
    });

    socket.on('disconnect', () => {
        delete onlineUsers[socket.id];
        io.emit('update_online_status', Object.values(onlineUsers));
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running successfully on port ${PORT}`);
});
