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

// Full In-Memory Database for Users and Messages
let users = {}; 
/* Structure of users[username]:
  {
     password: '...',
     friends: [],
     friendRequests: [],
     bio: '...',
     avatar: '...',
     regDate: '...'
  }
*/
let messages = []; // Array of message objects

// Routing
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'register.html'));
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

// Real-Time Socket.io Communication Handling
io.on('connection', (socket) => {
    console.log('A user connected via socket ID:', socket.id);

    // 1. User Registration Handler
    socket.on('register_user', (data) => {
        const { username, password } = data;
        if (!username || !password) {
            socket.emit('register_error', 'Username and password are required!');
            return;
        }

        if (users[username]) {
            socket.emit('register_error', 'Username is already taken!');
        } else {
            users[username] = {
                password: password,
                friends: [],
                friendRequests: [],
                bio: 'Hello! I am using Berryweb.',
                avatar: '',
                regDate: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
            };
            socket.emit('register_success');
            console.log(`User registered successfully: ${username}`);
        }
    });

    // 2. User Login Handler
    socket.on('login_user', (data) => {
        const { username, password } = data;
        if (users[username] && users[username].password === password) {
            socket.emit('login_success', username);
            console.log(`User logged in: ${username}`);
        } else {
            socket.emit('login_error', 'Invalid username or password!');
        }
    });

    // 3. Get All Registered Users for Search Bar
    socket.on('get_all_users', () => {
        const allUsernames = Object.keys(users);
        socket.emit('all_users_list', allUsernames);
    });

    // 4. Get Specific User Data (Friends, Requests, Profile Info)
    socket.on('get_user_data', (username) => {
        if (users[username]) {
            socket.emit('user_data_response', users[username]);
        }
    });

    // 5. Update Profile Handler (Bio & Avatar Sync)
    socket.on('update_profile', (data) => {
        const { username, bio, avatar } = data;
        if (users[username]) {
            if (bio !== undefined) {
                users[username].bio = bio;
            }
            if (avatar !== undefined) {
                users[username].avatar = avatar;
            }
            // Broadcast profile changes across the network
            io.emit('profile_updated_' + username, users[username]);
            console.log(`Profile updated for: ${username}`);
        }
    });

    // 6. Friend Request Handler (Inbox)
    socket.on('send_friend_request', (data) => {
        const { sender, receiver } = data;
        if (users[receiver]) {
            if (!users[receiver].friendRequests.includes(sender) && !users[receiver].friends.includes(sender)) {
                users[receiver].friendRequests.push(sender);
                io.emit('refresh_requests_' + receiver);
                console.log(`Friend request sent from ${sender} to ${receiver}`);
            }
        }
    });

    // 7. Accept or Decline Friend Request Handler
    socket.on('respond_friend_request', (data) => {
        const { username, requester, action } = data;
        if (users[username]) {
            // Remove from pending requests
            users[username].friendRequests = users[username].friendRequests.filter(u => u !== requester);

            if (action === 'accept') {
                // Add each other to respective friend lists
                if (!users[username].friends.includes(requester)) {
                    users[username].friends.push(requester);
                }
                if (users[requester] && !users[requester].friends.includes(username)) {
                    users[requester].friends.push(username);
                }
                io.emit('refresh_friends_' + requester);
                console.log(`Friend request accepted between ${username} and ${requester}`);
            }

            io.emit('refresh_friends_' + username);
            io.emit('refresh_requests_' + username);
        }
    });

    // 8. Chat Messaging History Handler
    socket.on('get_messages', (data) => {
        const { user1, user2 } = data;
        const conversation = messages.filter(m => 
            (m.sender === user1 && m.receiver === user2) || 
            (m.sender === user2 && m.receiver === user1)
        );
        socket.emit('loaded_messages', conversation);
    });

    // 9. Send Real-Time Chat Message Handler
    socket.on('send_message', (data) => {
        messages.push(data);
        io.emit('receive_message', data);
    });

    socket.on('disconnect', () => {
        console.log('A user disconnected from socket ID:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Berryweb server is successfully running on port ${PORT}`);
});
