const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Berryweb running live on port ${PORT}`);
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

let globalUsers = {};
let onlineUsers = {};
let messages = [];

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'home.html')));
app.get('/home', (req, res) => res.sendFile(path.join(__dirname, 'home.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'register.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));
app.get('/chat', (req, res) => res.sendFile(path.join(__dirname, 'chat.html')));
app.get('/profile', (req, res) => res.sendFile(path.join(__dirname, 'profile.html')));

io.on('connection', (socket) => {
    socket.on('user_online', (username) => {
        if (username) {
            onlineUsers[socket.id] = username;
            if (!globalUsers[username]) {
                globalUsers[username] = { friends: [], friendRequests: [], sentRequests: [], unreadCounts: {}, bio: 'Hello!', avatar: '', regDate: 'August 5, 2026' };
            }
            io.emit('update_online_status', Object.values(onlineUsers));
        }
    });

    socket.on('register_user', (data) => {
        const { username, password } = data;
        if (!username || !password) {
            socket.emit('register_error', 'All fields required!');
            return;
        }
        if (globalUsers[username]) {
            socket.emit('register_error', 'Username taken!');
        } else {
            globalUsers[username] = {
                password,
                friends: [],
                friendRequests: [],
                sentRequests: [],
                bio: 'Hello! I am using Berryweb.',
                avatar: '',
                regDate: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
                unreadCounts: {}
            };
            socket.emit('register_success');
            io.emit('all_users_list', Object.keys(globalUsers));
        }
    });

    socket.on('login_user', (data) => {
        const { username, password } = data;
        if (globalUsers[username] && globalUsers[username].password === password) {
            socket.emit('login_success', username);
        } else {
            socket.emit('login_error', 'Invalid username or password!');
        }
    });

    socket.on('get_all_users', () => {
        socket.emit('all_users_list', Object.keys(globalUsers));
    });

    socket.on('get_user_data', (username) => {
        if (globalUsers[username]) {
            if (!globalUsers[username].sentRequests) globalUsers[username].sentRequests = [];
            socket.emit('user_data_response', globalUsers[username]);
        } else {
            socket.emit('user_data_response', {
                bio: 'Hello!', avatar: '', regDate: 'August 5, 2026', friends: [], friendRequests: [], sentRequests: []
            });
        }
    });

    socket.on('update_profile', (data) => {
        const { username, bio, avatar } = data;
        if (globalUsers[username]) {
            if (bio !== undefined) globalUsers[username].bio = bio;
            if (avatar !== undefined) globalUsers[username].avatar = avatar;
            
            io.emit('profile_updated', { username, profile: globalUsers[username] });
            socket.emit('user_data_response', globalUsers[username]);
        }
    });

    socket.on('send_friend_request', (data) => {
        const { sender, receiver } = data;
        if (globalUsers[receiver] && !globalUsers[receiver].friendRequests.includes(sender) && !globalUsers[receiver].friends.includes(sender)) {
            globalUsers[receiver].friendRequests.push(sender);
            if (!globalUsers[sender].sentRequests) globalUsers[sender].sentRequests = [];
            if (!globalUsers[sender].sentRequests.includes(receiver)) globalUsers[sender].sentRequests.push(receiver);
            
            io.emit('refresh_requests_' + receiver);
            io.emit('refresh_friends_' + sender);
        }
    });

    socket.on('respond_friend_request', (data) => {
        const { username, requester, action } = data;
        if (globalUsers[username]) {
            globalUsers[username].friendRequests = globalUsers[username].friendRequests.filter(u => u !== requester);
            if (globalUsers[requester] && globalUsers[requester].sentRequests) {
                globalUsers[requester].sentRequests = globalUsers[requester].sentRequests.filter(u => u !== username);
            }
            if (action === 'accept') {
                if (!globalUsers[username].friends.includes(requester)) globalUsers[username].friends.push(requester);
                if (globalUsers[requester] && !globalUsers[requester].friends.includes(username)) {
                    globalUsers[requester].friends.push(username);
                }
                io.emit('refresh_friends_' + requester);
            }
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
        if (globalUsers[user1] && globalUsers[user1].unreadCounts) {
            globalUsers[user1].unreadCounts[user2] = 0;
            io.emit('update_unread_' + user1, globalUsers[user1].unreadCounts);
        }
        socket.emit('loaded_messages', conversation);
    });

    socket.on('send_message', (data) => {
        messages.push(data);
        if (globalUsers[data.receiver]) {
            if (!globalUsers[data.receiver].unreadCounts) globalUsers[data.receiver].unreadCounts = {};
            globalUsers[data.receiver].unreadCounts[data.sender] = (globalUsers[data.receiver].unreadCounts[data.sender] || 0) + 1;
            io.emit('update_unread_' + data.receiver, globalUsers[data.receiver].unreadCounts);
        }
        io.emit('receive_message', data);
    });

    socket.on('disconnect', () => {
        delete onlineUsers[socket.id];
        io.emit('update_online_status', Object.values(onlineUsers));
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Berryweb live on port ${PORT}`);
});

