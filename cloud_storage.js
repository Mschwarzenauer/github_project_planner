// ========== CLOUD STORAGE + LOGIN SYSTEM ==========
// Nutzt Netlify Function als sicheren Proxy zu JSONBin.io
// Der API Key bleibt versteckt auf dem Server

const API_ENDPOINT = '/api/jsonbin';

let currentUser = null;
let cloudSyncEnabled = false;

// ========== EINFACHES HASH ==========
function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
}

// ========== USER MANAGEMENT ==========

function getUsers() {
    try { return JSON.parse(localStorage.getItem('wmc_users') || '{}'); } catch (e) { return {}; }
}

function saveUsers(users) {
    localStorage.setItem('wmc_users', JSON.stringify(users));
}

function getUserStorageKey(username) {
    return `wmc_projects_${username}`;
}

// ========== REGISTER / LOGIN ==========

function registerUser(username, password) {
    const users = getUsers();
    const cleanUser = username.trim().toLowerCase();

    if (!cleanUser || cleanUser.length < 2)
        return { success: false, error: 'Benutzername muss mindestens 2 Zeichen haben.' };
    if (!password || password.length < 4)
        return { success: false, error: 'Passwort muss mindestens 4 Zeichen haben.' };
    if (users[cleanUser])
        return { success: false, error: 'Benutzername bereits vergeben.' };

    users[cleanUser] = {
        passwordHash: simpleHash(password + cleanUser),
        createdAt: new Date().toISOString(),
        binId: null
    };
    saveUsers(users);
    return { success: true };
}

function loginUser(username, password) {
    const users = getUsers();
    const cleanUser = username.trim().toLowerCase();

    if (!users[cleanUser])
        return { success: false, error: 'Benutzername nicht gefunden.' };

    if (users[cleanUser].passwordHash !== simpleHash(password + cleanUser))
        return { success: false, error: 'Falsches Passwort.' };

    currentUser = {
        username: cleanUser,
        data: users[cleanUser],
        storageKey: getUserStorageKey(cleanUser)
    };

    sessionStorage.setItem('wmc_session', JSON.stringify({ username: cleanUser }));
    cloudSyncEnabled = !!users[cleanUser].binId;
    return { success: true };
}

function logoutUser() {
    currentUser = null;
    cloudSyncEnabled = false;
    sessionStorage.removeItem('wmc_session');
    showLoginScreen();
}

function checkSession() {
    try {
        const session = JSON.parse(sessionStorage.getItem('wmc_session') || 'null');
        if (session && session.username) {
            const users = getUsers();
            if (users[session.username]) {
                currentUser = {
                    username: session.username,
                    data: users[session.username],
                    storageKey: getUserStorageKey(session.username)
                };
                cloudSyncEnabled = !!users[session.username].binId;
                return true;
            }
        }
    } catch (e) {}
    return false;
}

// ========== NETLIFY PROXY CALLS ==========

async function callProxy(action, extra = {}) {
    try {
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, ...extra })
        });
        return { ok: response.ok, status: response.status, data: await response.json() };
    } catch (e) {
        console.warn('Proxy-Fehler:', e);
        return { ok: false, error: e.message };
    }
}

async function createCloudBin() {
    const result = await callProxy('create', { data: { username: currentUser.username } });
    if (!result.ok) return null;
    return result.data.metadata?.id || null;
}

async function loadFromCloud() {
    if (!currentUser?.data?.binId) return null;
    const result = await callProxy('read', { binId: currentUser.data.binId });
    if (!result.ok) return null;
    return result.data.record?.projects || {};
}

async function saveToCloud(projects) {
    if (!currentUser?.data?.binId) return false;
    const result = await callProxy('write', {
        binId: currentUser.data.binId,
        data: { projects }
    });
    return result.ok;
}

// ========== AUTO CLOUD SETUP beim ersten Login ==========

async function ensureCloudBin() {
    if (currentUser.data.binId) return; // Bereits vorhanden

    updateSyncStatus('☁️ Cloud wird eingerichtet...', 'warning');
    const binId = await createCloudBin();
    if (binId) {
        const users = getUsers();
        users[currentUser.username].binId = binId;
        saveUsers(users);
        currentUser.data.binId = binId;
        cloudSyncEnabled = true;
        updateSyncStatus('✅ Cloud bereit', 'success');
    } else {
        updateSyncStatus('⚠️ Cloud nicht verfügbar – nur lokal', 'warning');
    }
}

// ========== LOAD / SAVE ==========

function loadLocalProjects() {
    if (!currentUser) return {};
    try { return JSON.parse(localStorage.getItem(currentUser.storageKey) || '{}'); } catch (e) { return {}; }
}

function saveLocalProjects(projects) {
    if (!currentUser) return;
    localStorage.setItem(currentUser.storageKey, JSON.stringify(projects));
}

async function cloudLoadProjects() {
    if (!currentUser) return {};

    // Versuche Cloud Bin anzulegen falls noch keiner existiert
    await ensureCloudBin();

    if (cloudSyncEnabled) {
        const cloudData = await loadFromCloud();
        if (cloudData !== null) {
            saveLocalProjects(cloudData);
            updateSyncStatus('✅ Cloud synchronisiert', 'success');
            return cloudData;
        }
        updateSyncStatus('⚠️ Cloud nicht erreichbar – lokale Daten', 'warning');
    }

    return loadLocalProjects();
}

async function cloudSaveProjects(projects) {
    if (!currentUser) return;
    saveLocalProjects(projects);

    if (cloudSyncEnabled) {
        saveToCloud(projects).then(ok => {
            updateSyncStatus(
                ok ? '✅ Gespeichert ' + new Date().toLocaleTimeString() : '⚠️ Cloud-Sync fehlgeschlagen',
                ok ? 'success' : 'warning'
            );
        });
    }
}

function updateSyncStatus(message, type) {
    const el = document.getElementById('syncStatus');
    if (el) {
        el.textContent = message;
        el.className = `sync-status sync-${type}`;
    }
}

// ========== LOGIN SCREEN UI ==========

function showLoginScreen() {
    document.getElementById('appContainer').style.display = 'none';
    document.getElementById('loginContainer').style.display = 'flex';
    document.getElementById('loginTab').click();
}

function showApp() {
    document.getElementById('loginContainer').style.display = 'none';
    document.getElementById('appContainer').style.display = 'block';
    document.getElementById('currentUserDisplay').textContent = `👤 ${currentUser.username}`;
    const badge = document.getElementById('cloudBadge');
    if (badge) badge.textContent = cloudSyncEnabled ? '☁️ Cloud' : '☁️ Verbinde...';
}

console.log('✅ cloud_storage.js geladen (Netlify Proxy)');
