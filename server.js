const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

const USERS_FILE = path.join(__dirname, 'users.json');

function loadUsers() {
    try {
        if (fs.existsSync(USERS_FILE)) {
            return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
        }
    } catch (e) { console.error(e); }
    return {};
}

function saveUsers() {
    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    } catch (e) { console.error(e); }
}

let users = loadUsers();
let onlineUsers = {};
let messages = [];

// Routes
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'home.html')));
app.get('/home', (req, res) => res.sendFile(path.join(__dirname, 'home.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'register.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));
app.get('/chat', (req, res) => res.sendFile(path.join(__dirname, 'chat.html')));
app.get('/profile', (req, res) => res.sendFile(path.join(__dirname, 'profile.html')));

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (users[username] && users[username].password === password) {
        res.json({ success: true, username });
    } else {
        res.json({ success: false, message: 'Invalid credentials!' });
    }
});

app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.json({ success: false, message: 'All fields required!' });
    if (users[username]) return res.json({ success: false, message: 'Username taken!' });

    users[username] = {
        password,
        friends: [],
        friendRequests: [],
        sentRequests: [],
        bio: 'Hello! I am using Berryweb.',
        avatar: '',
        regDate: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
        unreadCounts: {}
    };
    saveUsers();
    res.json({ success: true });
});

io.on('connection', (socket) => {
    socket.on('user_online', (username) => {
        if (username) {
            onlineUsers[socket.id] = username;
            if (!users[username]) {
                users[username] = { friends: [], friendRequests: [], sentRequests: [], unreadCounts: {} };
            }
            saveUsers();
            io.emit('update_online_status', Object.values(onlineUsers));
        }
    });

    socket.on('register_user', (data) => {
        const { username, password } = data;
        if (!username || !password) {
            socket.emit('register_error', 'All fields required!');
            return;
        }
        if (users[username]) {
            socket.emit('register_error', 'Username taken!');
        } else {
            users[username] = {
                password,
                friends: [],
                friendRequests: [],
                sentRequests: [],
                bio: 'Hello! I am using Berryweb.',
                avatar: '',
                regDate: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
                unreadCounts: {}
            };
            saveUsers();
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
            if (!users[username].sentRequests) users[username].sentRequests = [];
            socket.emit('user_data_response', users[username]);
        } else {
            socket.emit('user_data_response', {
                bio: 'Hello!', avatar: '', regDate: 'August 5, 2026', friends: [], friendRequests: [], sentRequests: []
            });
        }
    });

    socket.on('update_profile', (data) => {
        const { username, bio, avatar } = data;
        if (users[username]) {
            if (bio !== undefined) users[username].bio = bio;
            if (avatar !== undefined) users[username].avatar = avatar;
            saveUsers();
            io.emit('profile_updated_' + username, users[username]);
        }
    });

    socket.on('send_friend_request', (data) => {
        const { sender, receiver } = data;
        if (users[receiver] && !users[receiver].friendRequests.includes(sender) && !users[receiver].friends.includes(sender)) {
            users[receiver].friendRequests.push(sender);
            if (!users[sender].sentRequests) users[sender].sentRequests = [];
            if (!users[sender].sentRequests.includes(receiver)) users[sender].sentRequests.push(receiver);
            saveUsers();
            io.emit('refresh_requests_' + receiver);
            io.emit('refresh_friends_' + sender);
        }
    });

    socket.on('respond_friend_request', (data) => {
        const { username, requester, action } = data;
        if (users[username]) {
            users[username].friendRequests = users[username].friendRequests.filter(u => u !== requester);
            if (users[requester] && users[requester].sentRequests) {
                users[requester].sentRequests = users[requester].sentRequests.filter(u => u !== username);
            }
            if (action === 'accept') {
                if (!users[username].friends.includes(requester)) users[username].friends.push(requester);
                if (users[requester] && !users[requester].friends.includes(username)) {
                    users[requester].friends.push(username);
                }
                saveUsers();
                io.emit('refresh_friends_' + requester);
            }
            saveUsers();
            io.emit('refresh_friends_' + username);
            io.emit('refresh_requests_' + username);
        }
    });

    socket.on('typing', (data) => {
        io.emit('typing_status', data);
    });

    socket.on('get_messages', (data) => {
        const { user1, user2 } = data;
        const conversation = messages.filter(m => 
            (m.sender === user1 && m.receiver === user2) || 
            (m.sender === user2 && m.receiver === user1)
        );
        if (users[user1] && users[user1].unreadCounts) {
            users[user1].unreadCounts[user2] = 0;
            saveUsers();
            io.emit('update_unread_' + user1, users[user1].unreadCounts);
        }
        socket.emit('loaded_messages', conversation);
    });

    socket.on('send_message', (data) => {
        messages.push(data);
        if (users[data.receiver]) {
            if (!users[data.receiver].unreadCounts) users[data.receiver].unreadCounts = {};
            users[data.receiver].unreadCounts[data.sender] = (users[data.receiver].unreadCounts[data.sender] || 0) + 1;
            saveUsers();
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
    console.log(`Berryweb running live on port ${PORT}`);
});
