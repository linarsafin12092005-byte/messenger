// chat.js - убедитесь, что функции объявлены глобально

let ws = null;
let currentUser = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

// Показать/скрыть вкладки авторизации
window.showAuthTab = function(tab) {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const authForms = document.querySelectorAll('.auth-form');
    
    tabBtns.forEach(btn => btn.classList.remove('active'));
    authForms.forEach(form => form.classList.remove('active'));
    
    if (tab === 'login') {
        const loginBtn = document.querySelector('.tab-btn:first-child');
        const loginForm = document.getElementById('login-form');
        if (loginBtn && loginForm) {
            loginBtn.classList.add('active');
            loginForm.classList.add('active');
        }
    } else {
        const registerBtn = document.querySelector('.tab-btn:last-child');
        const registerForm = document.getElementById('register-form');
        if (registerBtn && registerForm) {
            registerBtn.classList.add('active');
            registerForm.classList.add('active');
        }
    }
};

// Регистрация
window.register = async function() {
    console.log('register function called');
    const usernameInput = document.getElementById('reg-username');
    const passwordInput = document.getElementById('reg-password');
    const confirmInput = document.getElementById('reg-confirm');
    
    if (!usernameInput || !passwordInput || !confirmInput) {
        console.error('Registration form elements not found');
        alert('Ошибка: форма регистрации не найдена');
        return;
    }
    
    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    const confirm = confirmInput.value;
    
    if (!username || !password) {
        alert('Заполните все поля');
        return;
    }
    
    if (password !== confirm) {
        alert('Пароли не совпадают');
        return;
    }
    
    try {
        console.log('Sending registration request...');
        const response = await fetch('/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        console.log('Registration response:', data);
        
        if (response.ok) {
            alert('Регистрация успешна! Теперь войдите');
            window.showAuthTab('login');
            usernameInput.value = '';
            passwordInput.value = '';
            confirmInput.value = '';
        } else {
            alert(data.detail || 'Ошибка регистрации');
        }
    } catch (error) {
        console.error('Registration error:', error);
        alert('Ошибка соединения с сервером');
    }
};

// Вход
window.login = async function() {
    console.log('login function called');
    const usernameInput = document.getElementById('login-username');
    const passwordInput = document.getElementById('login-password');
    
    if (!usernameInput || !passwordInput) {
        console.error('Login form elements not found');
        alert('Ошибка: форма входа не найдена');
        return;
    }
    
    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    
    if (!username || !password) {
        alert('Введите логин и пароль');
        return;
    }
    
    try {
        console.log('Sending login request...');
        const response = await fetch('/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        console.log('Login response:', data);
        
        if (response.ok) {
            currentUser = {
                username: data.username || username,
                userId: data.user_id
            };
            
            const currentUserSpan = document.getElementById('current-user');
            const authScreen = document.getElementById('auth-screen');
            const chatScreen = document.getElementById('chat-screen');
            
            if (currentUserSpan) currentUserSpan.textContent = currentUser.username;
            if (authScreen) authScreen.style.display = 'none';
            if (chatScreen) chatScreen.style.display = 'flex';
            
            usernameInput.value = '';
            passwordInput.value = '';
            
            console.log('User logged in:', currentUser);
            window.connectWebSocket();
        } else {
            alert(data.detail || 'Неверный логин или пароль');
        }
    } catch (error) {
        console.error('Login error:', error);
        alert('Ошибка соединения с сервером');
    }
};

// Выход
window.logout = function() {
    console.log('logout function called');
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
    }
    currentUser = null;
    
    const authScreen = document.getElementById('auth-screen');
    const chatScreen = document.getElementById('chat-screen');
    const messagesDiv = document.getElementById('messages');
    const usersListDiv = document.getElementById('users-list');
    const onlineCountSpan = document.getElementById('online-count');
    
    if (authScreen) authScreen.style.display = 'flex';
    if (chatScreen) chatScreen.style.display = 'none';
    
    if (messagesDiv) {
        messagesDiv.innerHTML = `
            <div class="welcome-message">
                <p>✨ Добро пожаловать в чат! ✨</p>
                <p>Напишите первое сообщение...</p>
            </div>
        `;
    }
    
    if (usersListDiv) usersListDiv.innerHTML = '';
    if (onlineCountSpan) onlineCountSpan.textContent = '0 онлайн';
};

// Подключение WebSocket
window.connectWebSocket = function() {
    if (!currentUser) {
        console.error('No current user');
        return;
    }
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    console.log('Connecting to WebSocket:', wsUrl);
    
    try {
        ws = new WebSocket(wsUrl);
        
        ws.onopen = () => {
            console.log('✅ WebSocket connected');
            reconnectAttempts = 0;
            if (ws && currentUser) {
                ws.send(JSON.stringify({
                    type: 'auth',
                    username: currentUser.username
                }));
            }
        };
        
        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('Received message:', data.type);
                window.handleWebSocketMessage(data);
            } catch (error) {
                console.error('Error parsing message:', error);
            }
        };
        
        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            window.addSystemMessage('⚠️ Ошибка соединения');
        };
        
        ws.onclose = (event) => {
            console.log('WebSocket disconnected', event.code, event.reason);
            
            if (event.code === 4000) {
                window.addSystemMessage(`❌ Ошибка: ${event.reason || 'Соединение отклонено'}`);
                setTimeout(() => window.logout(), 2000);
                return;
            }
            
            window.addSystemMessage('🔌 Соединение потеряно. Переподключение...');
            
            if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS && currentUser) {
                reconnectAttempts++;
                const delay = Math.min(3000 * reconnectAttempts, 15000);
                console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
                setTimeout(() => window.connectWebSocket(), delay);
            } else if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
                window.addSystemMessage('❌ Не удалось переподключиться. Обновите страницу.');
            }
        };
    } catch (error) {
        console.error('Failed to create WebSocket:', error);
        window.addSystemMessage('❌ Не удалось создать WebSocket соединение');
    }
};

// Обработка сообщений WebSocket
window.handleWebSocketMessage = function(data) {
    if (!data || typeof data !== 'object') return;
    
    switch (data.type) {
        case 'message':
            window.addChatMessage(data.username, data.text, data.created_at);
            break;
        case 'system':
            window.addSystemMessage(data.text);
            break;
        case 'users_list':
            if (Array.isArray(data.users)) {
                window.updateUsersList(data.users);
            }
            break;
        default:
            console.log('Unknown message type:', data);
    }
};

// Добавить сообщение в чат
window.addChatMessage = function(username, text, timestamp) {
    const messagesDiv = document.getElementById('messages');
    if (!messagesDiv) return;
    
    const messageDiv = document.createElement('div');
    const isMyMessage = username === (currentUser ? currentUser.username : null);
    
    messageDiv.className = `message ${isMyMessage ? 'my-message' : 'other-message'}`;
    
    const header = document.createElement('div');
    header.className = 'message-header';
    
    const time = timestamp ? new Date(timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();
    header.innerHTML = `<strong>${window.escapeHtml(username)}</strong> <span>${time}</span>`;
    
    const content = document.createElement('div');
    content.textContent = window.escapeHtml(text);
    
    messageDiv.appendChild(header);
    messageDiv.appendChild(content);
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    
    const welcomeMsg = messagesDiv.querySelector('.welcome-message');
    if (welcomeMsg && messagesDiv.children.length > 1) {
        welcomeMsg.remove();
    }
};

// Добавить системное сообщение
window.addSystemMessage = function(text) {
    const messagesDiv = document.getElementById('messages');
    if (!messagesDiv) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message system-message';
    messageDiv.textContent = text;
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
};

// Обновить список пользователей онлайн
window.updateUsersList = function(users) {
    const usersListDiv = document.getElementById('users-list');
    const onlineCountSpan = document.getElementById('online-count');
    
    if (!usersListDiv) return;
    
    const onlineCount = users.length;
    
    if (onlineCountSpan) {
        onlineCountSpan.textContent = `${onlineCount} онлайн`;
    }
    
    if (users.length === 0) {
        usersListDiv.innerHTML = '<div class="user-item">Нет пользователей онлайн</div>';
        return;
    }
    
    usersListDiv.innerHTML = users.map(username => `
        <div class="user-item">
            <div class="user-avatar">${window.getInitials(username)}</div>
            <div class="user-name">${window.escapeHtml(username)}</div>
            <div class="user-status"></div>
        </div>
    `).join('');
};

// Вспомогательные функции
window.getInitials = function(username) {
    if (!username) return '?';
    return username.charAt(0).toUpperCase();
};

window.escapeHtml = function(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
};

// Отправить сообщение
window.sendMessage = function() {
    const input = document.getElementById('messageInput');
    if (!input) return;
    
    const message = input.value.trim();
    
    if (!message) return;
    
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'message',
            text: message
        }));
        input.value = '';
    } else {
        alert('Соединение потеряно. Попробуйте позже.');
    }
};

// Отправка по Enter
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing...');
    const input = document.getElementById('messageInput');
    if (input) {
        input.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                window.sendMessage();
            }
        });
    }
});

console.log('chat.js loaded');