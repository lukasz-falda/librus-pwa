/**
 * LIBRUS SYNERGIA PWA - GŁÓWNY SKRYPT APLIKACJI
 * Obsługuje logowanie, wyświetlanie wiadomości i komunikację z backendem
 */

// ============================================
// KONFIGURACJA
// ============================================

const CONFIG = {
    // URL backendu - ZMIEŃ NA SWÓJ URL PO WDROŻENIU!
    API_URL: 'https://librus-pwa-backend.onrender.com',

    // Klucze localStorage
    STORAGE_KEYS: {
        TOKEN: 'librus_token',
        USERNAME: 'librus_username',
        PASSWORD: 'librus_password',
        MESSAGES_CACHE: 'librus_messages_cache',
        LAST_FETCH: 'librus_last_fetch'
    },

    // Czas cache'owania wiadomości (5 minut)
    CACHE_DURATION: 5 * 60 * 1000
};

// ============================================
// STAN APLIKACJI
// ============================================

const state = {
    token: null,
    currentFolder: 'received',
    messages: {
        received: [],
        sent: []
    },
    isLoading: false,
    isOnline: navigator.onLine
};

// ============================================
// ELEMENTY DOM
// ============================================

const elements = {
    // Ekrany
    loadingScreen: document.getElementById('loading-screen'),
    loginScreen: document.getElementById('login-screen'),
    mainScreen: document.getElementById('main-screen'),

    // Formularz logowania
    loginForm: document.getElementById('login-form'),
    usernameInput: document.getElementById('username'),
    passwordInput: document.getElementById('password'),
    rememberMe: document.getElementById('remember-me'),
    loginBtn: document.getElementById('login-btn'),
    loginError: document.getElementById('login-error'),

    // Nagłówek i akcje
    refreshBtn: document.getElementById('refresh-btn'),
    logoutBtn: document.getElementById('logout-btn'),

    // Zakładki
    tabs: document.querySelectorAll('.tab'),

    // Lista wiadomości
    messagesContainer: document.getElementById('messages-container'),
    messagesList: document.getElementById('messages-list'),
    messagesLoader: document.getElementById('messages-loader'),
    emptyState: document.getElementById('empty-state'),

    // Pull to refresh
    pullIndicator: document.getElementById('pull-indicator'),

    // Modal
    messageModal: document.getElementById('message-modal'),
    modalBack: document.getElementById('modal-back'),
    detailSubject: document.getElementById('detail-subject'),
    detailSender: document.getElementById('detail-sender'),
    detailDate: document.getElementById('detail-date'),
    detailBody: document.getElementById('detail-body'),
    detailAttachments: document.getElementById('detail-attachments'),
    attachmentsList: document.getElementById('attachments-list'),
    messageDetailLoader: document.getElementById('message-detail-loader'),
    messageDetail: document.getElementById('message-detail'),

    // Offline bar
    offlineBar: document.getElementById('offline-bar'),

    // Toast container
    toastContainer: document.getElementById('toast-container')
};

// ============================================
// FUNKCJE POMOCNICZE
// ============================================

/**
 * Wyświetla powiadomienie toast
 */
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    elements.toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

/**
 * Formatuje datę do czytelnej postaci
 */
function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;

    // Dzisiaj - pokaż godzinę
    if (diff < 24 * 60 * 60 * 1000 && date.getDate() === now.getDate()) {
        return date.toLocaleTimeString('pl-PL', {hour: '2-digit', minute: '2-digit'});
    }

    // Wczoraj
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.getDate() === yesterday.getDate()) {
        return 'Wczoraj';
    }

    // Ten rok - bez roku
    if (date.getFullYear() === now.getFullYear()) {
        return date.toLocaleDateString('pl-PL', {day: 'numeric', month: 'short'});
    }

    // Pełna data
    return date.toLocaleDateString('pl-PL', {day: 'numeric', month: 'short', year: 'numeric'});
}

/**
 * Formatuje pełną datę
 */
function formatFullDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('pl-PL', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * Skraca tekst do określonej długości
 */
function truncateText(text, maxLength) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

/**
 * Sanityzuje HTML (podstawowa ochrona XSS)
 */
function sanitizeHTML(html) {
    const temp = document.createElement('div');
    temp.textContent = html;
    return temp.innerHTML;
}

// ============================================
// API - KOMUNIKACJA Z BACKENDEM
// ============================================

const api = {
    /**
     * Wykonuje żądanie do API
     */
    async request(endpoint, options = {}) {
        const url = `${CONFIG.API_URL}${endpoint}`;

        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json'
            }
        };

        // Dodaj token jeśli istnieje
        if (state.token) {
            defaultOptions.headers['Authorization'] = `Bearer ${state.token}`;
        }

        const response = await fetch(url, {...defaultOptions, ...options});

        if (!response.ok) {
            const error = await response.json().catch(() => ({message: 'Błąd serwera'}));
            throw new Error(error.message || `HTTP ${response.status}`);
        }

        return response.json();
    },

    /**
     * Logowanie użytkownika
     */
    async login(username, password) {
        const data = await this.request('/api/login', {
            method: 'POST',
            body: JSON.stringify({username, password})
        });

        return data;
    },

    /**
     * Pobiera listę wiadomości
     */
    async getMessages(folder = 'received') {
        const data = await this.request(`/api/messages?folder=${folder}`);
        return data.messages || [];
    },

    /**
     * Pobiera szczegóły wiadomości
     */
    async getMessage(id) {
        const data = await this.request(`/api/messages/${id}`);
        return data;
    },

    /**
     * Wylogowanie
     */
    async logout() {
        try {
            await this.request('/api/logout', {method: 'POST'});
        } catch (e) {
            // Ignoruj błędy wylogowania
        }
    }
};

// ============================================
// ZARZĄDZANIE STANEM I STORAGE
// ============================================

const storage = {
    /**
     * Zapisuje dane logowania
     */
    saveCredentials(username, password) {
        localStorage.setItem(CONFIG.STORAGE_KEYS.USERNAME, username);
        localStorage.setItem(CONFIG.STORAGE_KEYS.PASSWORD, btoa(password)); // Podstawowe kodowanie
    },

    /**
     * Pobiera zapisane dane logowania
     */
    getCredentials() {
        const username = localStorage.getItem(CONFIG.STORAGE_KEYS.USERNAME);
        const password = localStorage.getItem(CONFIG.STORAGE_KEYS.PASSWORD);

        if (username && password) {
            return {username, password: atob(password)};
        }
        return null;
    },

    /**
     * Usuwa dane logowania
     */
    clearCredentials() {
        localStorage.removeItem(CONFIG.STORAGE_KEYS.USERNAME);
        localStorage.removeItem(CONFIG.STORAGE_KEYS.PASSWORD);
    },

    /**
     * Zapisuje token sesji
     */
    saveToken(token) {
        localStorage.setItem(CONFIG.STORAGE_KEYS.TOKEN, token);
        state.token = token;
    },

    /**
     * Pobiera token sesji
     */
    getToken() {
        return localStorage.getItem(CONFIG.STORAGE_KEYS.TOKEN);
    },

    /**
     * Usuwa token sesji
     */
    clearToken() {
        localStorage.removeItem(CONFIG.STORAGE_KEYS.TOKEN);
        state.token = null;
    },

    /**
     * Cache'uje wiadomości
     */
    cacheMessages(folder, messages) {
        const cache = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.MESSAGES_CACHE) || '{}');
        cache[folder] = messages;
        localStorage.setItem(CONFIG.STORAGE_KEYS.MESSAGES_CACHE, JSON.stringify(cache));
        localStorage.setItem(CONFIG.STORAGE_KEYS.LAST_FETCH, Date.now().toString());
    },

    /**
     * Pobiera cache'owane wiadomości
     */
    getCachedMessages(folder) {
        const lastFetch = parseInt(localStorage.getItem(CONFIG.STORAGE_KEYS.LAST_FETCH) || '0');
        const isExpired = Date.now() - lastFetch > CONFIG.CACHE_DURATION;

        if (isExpired && state.isOnline) {
            return null;
        }

        const cache = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.MESSAGES_CACHE) || '{}');
        return cache[folder] || null;
    },

    /**
     * Czyści cały cache
     */
    clearCache() {
        localStorage.removeItem(CONFIG.STORAGE_KEYS.MESSAGES_CACHE);
        localStorage.removeItem(CONFIG.STORAGE_KEYS.LAST_FETCH);
    },

    // Oznaczanie wiadomości jako przeczytanej
    markAsRead: (messageId) => {
        const read = storage.getReadMessages();
        read.add(String(messageId));
        localStorage.setItem(CONFIG.STORAGE_KEYS.READ_MESSAGES, JSON.stringify([...read]));
    },

    // Pobieranie listy przeczytanych wiadomości
    getReadMessages: () => {
        const data = localStorage.getItem(CONFIG.STORAGE_KEYS.READ_MESSAGES);
        return new Set(data ? JSON.parse(data) : []);
    },

    // Sprawdzanie czy wiadomość jest przeczytana
    isMessageRead: (messageId) => {
        return storage.getReadMessages().has(String(messageId));
    }
};

// ============================================
// RENDEROWANIE UI
// ============================================

const ui = {
    /**
     * Pokazuje ekran logowania
     */
    showLoginScreen() {
        elements.loginScreen.classList.remove('hidden');
        elements.mainScreen.classList.add('hidden');
        elements.messageModal.classList.add('hidden');

        // Wypełnij zapisane dane
        const credentials = storage.getCredentials();
        if (credentials) {
            elements.usernameInput.value = credentials.username;
            elements.passwordInput.value = credentials.password;
        }
    },

    /**
     * Pokazuje główny ekran
     */
    showMainScreen() {
        elements.loginScreen.classList.add('hidden');
        elements.mainScreen.classList.remove('hidden');
    },

    /**
     * Ukrywa ekran ładowania
     */
    hideLoadingScreen() {
        elements.loadingScreen.classList.add('fade-out');
        setTimeout(() => {
            elements.loadingScreen.style.display = 'none';
        }, 300);
    },

    /**
     * Pokazuje/ukrywa loader wiadomości
     */
    setMessagesLoading(loading) {
        state.isLoading = loading;

        if (loading) {
            elements.messagesLoader.classList.remove('hidden');
            elements.messagesList.innerHTML = '';
            elements.emptyState.classList.add('hidden');
        } else {
            elements.messagesLoader.classList.add('hidden');
        }
    },

    /**
     * Renderuje listę wiadomości
     */
    renderMessages(messages) {
        elements.messagesList.innerHTML = '';

        if (!messages || messages.length === 0) {
            elements.emptyState.classList.remove('hidden');
            return;
        }

        elements.emptyState.classList.add('hidden');

        messages.forEach(msg => {
            const isRead = storage.isMessageRead(msg.id) || msg.read;

            const item = document.createElement('div');
            item.className = `message-item ${isRead ? '' : 'unread'}`;
            item.dataset.id = msg.id;

            item.innerHTML = `
                <div class="message-header">
                    <span class="message-sender">${sanitizeHTML(msg.sender || msg.recipient || 'Nieznany')}</span>
                    <span class="message-date">${formatDate(msg.date)}</span>
                </div>
                <div class="message-subject">${sanitizeHTML(msg.subject || '(Brak tematu)')}</div>
                <div class="message-preview">${sanitizeHTML(truncateText(msg.preview, 100))}</div>
            `;

            item.addEventListener('click', () => openMessage(msg.id));
            elements.messagesList.appendChild(item);
        });
    },

    /**
     * Pokazuje szczegóły wiadomości
     */
    showMessageDetail(message) {
        elements.detailSubject.textContent = message.subject || '(Brak tematu)';
        elements.detailSender.textContent = message.sender || message.recipient || 'Nieznany';
        elements.detailDate.textContent = formatFullDate(message.date);

        // Renderuj treść (zachowaj formatowanie HTML)
        elements.detailBody.innerHTML = message.body || '<p>Brak treści</p>';

        // Załączniki
        if (message.attachments && message.attachments.length > 0) {
            elements.detailAttachments.classList.remove('hidden');
            elements.attachmentsList.innerHTML = message.attachments.map(att => `
                <li>
                    <a href="${att.url}" target="_blank" rel="noopener">
                        <svg viewBox="0 0 24 24" width="16" height="16">
                            <path fill="currentColor" d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z"/>
                        </svg>
                        ${sanitizeHTML(att.name)}
                    </a>
                </li>
            `).join('');
        } else {
            elements.detailAttachments.classList.add('hidden');
        }

        elements.messageDetailLoader.classList.add('hidden');
        elements.messageDetail.style.display = 'block';

        // Oznacz jako przeczytaną
        storage.markAsRead(message.id);
    },

    /**
     * Pokazuje modal wiadomości
     */
    showModal() {
        elements.messageModal.classList.remove('hidden');
        // Animacja wejścia
        requestAnimationFrame(() => {
            elements.messageModal.classList.add('visible');
        });
    },

    /**
     * Ukrywa modal wiadomości
     */
    hideModal() {
        elements.messageModal.classList.remove('visible');
        setTimeout(() => {
            elements.messageModal.classList.add('hidden');
            elements.messageDetail.style.display = 'none';
            elements.messageDetailLoader.classList.remove('hidden');
        }, 300);
    },

    /**
     * Aktualizuje status online/offline
     */
    updateOnlineStatus(isOnline) {
        state.isOnline = isOnline;

        if (isOnline) {
            elements.offlineBar.classList.add('hidden');
        } else {
            elements.offlineBar.classList.remove('hidden');
        }
    },

    /**
     * Pokazuje błąd logowania
     */
    showLoginError(message) {
        elements.loginError.textContent = message;
        elements.loginError.classList.add('show');
    },

    /**
     * Ukrywa błąd logowania
     */
    hideLoginError() {
        elements.loginError.classList.remove('show');
    },

    /**
     * Ustawia stan ładowania przycisku logowania
     */
    setLoginLoading(loading) {
        if (loading) {
            elements.loginBtn.classList.add('loading');
            elements.loginBtn.disabled = true;
        } else {
            elements.loginBtn.classList.remove('loading');
            elements.loginBtn.disabled = false;
        }
    }
};

// ============================================
// LOGIKA BIZNESOWA
// ============================================

/**
 * Obsługuje logowanie
 */
async function handleLogin(e) {
    e.preventDefault();

    const username = elements.usernameInput.value.trim();
    const password = elements.passwordInput.value;
    const rememberMe = elements.rememberMe.checked;

    if (!username || !password) {
        ui.showLoginError('Wprowadź login i hasło');
        return;
    }

    ui.hideLoginError();
    ui.setLoginLoading(true);

    try {
        const data = await api.login(username, password);

        // Zapisz token
        storage.saveToken(data.token);

        // Zapisz dane logowania jeśli zaznaczono
        if (rememberMe) {
            storage.saveCredentials(username, password);
        } else {
            storage.clearCredentials();
        }

        // Przejdź do głównego ekranu
        ui.showMainScreen();

        // Pobierz wiadomości
        await loadMessages();

        showToast('Zalogowano pomyślnie', 'success');

    } catch (error) {
        console.error('Błąd logowania:', error);
        ui.showLoginError(error.message || 'Błąd logowania. Sprawdź dane.');
    } finally {
        ui.setLoginLoading(false);
    }
}

/**
 * Obsługuje wylogowanie
 */
async function handleLogout() {
    try {
        await api.logout();
    } catch (e) {
        // Ignoruj
    }

    // Wyczyść dane
    storage.clearToken();
    storage.clearCache();
    state.messages = {received: [], sent: []};

    // Pokaż ekran logowania
    ui.showLoginScreen();

    showToast('Wylogowano');
}

/**
 * Ładuje wiadomości
 */
async function loadMessages(forceRefresh = false) {
    const folder = state.currentFolder;

    // Sprawdź cache
    if (!forceRefresh) {
        const cached = storage.getCachedMessages(folder);
        if (cached) {
            state.messages[folder] = cached;
            ui.renderMessages(cached);
            return;
        }
    }

    // Jeśli offline, pokaż cache lub pusty stan
    if (!state.isOnline) {
        const cached = storage.getCachedMessages(folder);
        if (cached) {
            state.messages[folder] = cached;
            ui.renderMessages(cached);
        } else {
            ui.renderMessages([]);
        }
        showToast('Tryb offline - pokazuję zapisane wiadomości');
        return;
    }

    ui.setMessagesLoading(true);

    try {
        const messages = await api.getMessages(folder);
        state.messages[folder] = messages;

        // Cache'uj
        storage.cacheMessages(folder, messages);

        ui.renderMessages(messages);

    } catch (error) {
        console.error('Błąd pobierania wiadomości:', error);

        // Jeśli błąd autoryzacji, wyloguj
        if (error.message.includes('401') || error.message.includes('Unauthorized')) {
            showToast('Sesja wygasła. Zaloguj się ponownie.', 'error');
            handleLogout();
            return;
        }

        // Pokaż cache jeśli dostępny
        const cached = storage.getCachedMessages(folder);
        if (cached) {
            state.messages[folder] = cached;
            ui.renderMessages(cached);
            showToast('Błąd połączenia - pokazuję zapisane wiadomości', 'error');
        } else {
            ui.renderMessages([]);
            showToast('Błąd pobierania wiadomości', 'error');
        }
    } finally {
        ui.setMessagesLoading(false);
    }
}

/**
 * Otwiera szczegóły wiadomości
 */
async function openMessage(id) {
    ui.showModal();

    try {
        const data = await api.getMessage(id);
        ui.showMessageDetail(data.message);

        // Oznacz jako przeczytaną w UI
        const item = document.querySelector(`.message-item[data-id="${id}"]`);
        if (item) {
            item.classList.remove('unread');
        }

    } catch (error) {
        console.error('Błąd pobierania wiadomości:', error);
        showToast('Błąd pobierania wiadomości', 'error');
        ui.hideModal();
    }
}

/**
 * Zmienia folder (zakładkę)
 */
function changeFolder(folder) {
    if (folder === state.currentFolder) return;

    state.currentFolder = folder;

    // Aktualizuj zakładki
    elements.tabs.forEach(tab => {
        tab.classList.toggle('active', tab.dataset.folder === folder);
    });

    // Załaduj wiadomości
    loadMessages();
}

// ============================================
// PULL TO REFRESH
// ============================================

let pullStartY = 0;
let isPulling = false;

function initPullToRefresh() {
    const container = elements.messagesContainer;

    container.addEventListener('touchstart', (e) => {
        if (container.scrollTop === 0) {
            pullStartY = e.touches[0].clientY;
            isPulling = true;
        }
    }, {passive: true});

    container.addEventListener('touchmove', (e) => {
        if (!isPulling) return;

        const pullDistance = e.touches[0].clientY - pullStartY;

        if (pullDistance > 0 && pullDistance < 150) {
            elements.pullIndicator.classList.add('visible');
            elements.pullIndicator.style.transform = `translateY(${Math.min(pullDistance - 50, 0)}px)`;
        }
    }, {passive: true});

    container.addEventListener('touchend', async () => {
        if (!isPulling) return;

        isPulling = false;

        if (elements.pullIndicator.classList.contains('visible')) {
            // Odśwież
            await loadMessages(true);
            showToast('Odświeżono');
        }

        elements.pullIndicator.classList.remove('visible');
        elements.pullIndicator.style.transform = '';
    });
}

// ============================================
// INICJALIZACJA
// ============================================

async function init() {
    // Sprawdź status online
    ui.updateOnlineStatus(navigator.onLine);

    // Nasłuchuj zmian statusu online
    window.addEventListener('online', () => {
        ui.updateOnlineStatus(true);
        showToast('Połączono z internetem', 'success');
        loadMessages(true);
    });

    window.addEventListener('offline', () => {
        ui.updateOnlineStatus(false);
        showToast('Brak połączenia z internetem', 'error');
    });

    // Sprawdź zapisany token
    const token = storage.getToken();

    if (token) {
        state.token = token;

        // Spróbuj załadować wiadomości
        try {
            ui.showMainScreen();
            await loadMessages();
        } catch (error) {
            // Token wygasł - pokaż logowanie
            storage.clearToken();
            ui.showLoginScreen();
        }
    } else {
        ui.showLoginScreen();
    }

    // Ukryj ekran ładowania
    ui.hideLoadingScreen();

    // Event listeners
    elements.loginForm.addEventListener('submit', handleLogin);
    elements.logoutBtn.addEventListener('click', handleLogout);
    elements.refreshBtn.addEventListener('click', () => loadMessages(true));
    elements.modalBack.addEventListener('click', ui.hideModal);

    // Zakładki
    elements.tabs.forEach(tab => {
        tab.addEventListener('click', () => changeFolder(tab.dataset.folder));
    });

    // Pull to refresh
    initPullToRefresh();

    // Obsługa przycisku wstecz
    window.addEventListener('popstate', () => {
        if (!elements.messageModal.classList.contains('hidden')) {
            ui.hideModal();
        }
    });

    // Dodaj stan do historii przy otwieraniu modala
    const originalShowModal = ui.showModal;
    ui.showModal = function () {
        history.pushState({modal: true}, '');
        originalShowModal.call(ui);
    };
}

// Start aplikacji
document.addEventListener('DOMContentLoaded', init);
