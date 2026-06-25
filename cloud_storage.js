// ========== CLOUD STORAGE + LOGIN SYSTEM ==========
// Benutzer-Accounts werden in JSONBin gespeichert (geräteübergreifend)

const API_ENDPOINT = '/api/jsonbin';
const USERS_BIN_ID_KEY = 'wmc_users_bin_id'; // Bin ID für alle User-Accounts

let currentUser = null;
let cloudSyncEnabled = false;

// ========== HASH ==========
function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
}

// ========== SERVER API ==========
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

// ========== USERS BIN (gemeinsame Benutzerdatenbank) ==========

async function getUsersBinId() {
    // Erst lokal schauen
    let binId = localStorage.getItem(USERS_BIN_ID_KEY);
    if (binId) return binId;

    // Vom Server holen (server.js gibt eine feste Bin-ID zurück)
    try {
        const res = await fetch('/api/users-bin');
        const data = await res.json();
        if (data.binId) {
            localStorage.setItem(USERS_BIN_ID_KEY, data.binId);
            return data.binId;
        }
    } catch(e) {}
    return null;
}

async function loadAllUsers() {
    const binId = await getUsersBinId();
    if (!binId) return {};
    const result = await callProxy('read', { binId });
    if (!result.ok) return {};
    return result.data.record?.users || {};
}

async function saveAllUsers(users) {
    const binId = await getUsersBinId();
    if (!binId) return false;
    const result = await callProxy('write', { binId, data: { users } });
    return result.ok;
}

// ========== REGISTER / LOGIN ==========

async function registerUser(username, password) {
    const cleanUser = username.trim().toLowerCase();

    if (!cleanUser || cleanUser.length < 2)
        return { success: false, error: 'Benutzername muss mindestens 2 Zeichen haben.' };
    if (!password || password.length < 4)
        return { success: false, error: 'Passwort muss mindestens 4 Zeichen haben.' };

    const users = await loadAllUsers();

    if (users[cleanUser])
        return { success: false, error: 'Benutzername bereits vergeben.' };

    users[cleanUser] = {
        passwordHash: simpleHash(password + cleanUser),
        createdAt: new Date().toISOString(),
        binId: null
    };

    const saved = await saveAllUsers(users);
    if (!saved) return { success: false, error: 'Fehler beim Speichern. Bitte nochmal versuchen.' };

    return { success: true };
}

async function loginUser(username, password) {
    const cleanUser = username.trim().toLowerCase();
    const users = await loadAllUsers();

    if (!users[cleanUser])
        return { success: false, error: 'Benutzername nicht gefunden.' };

    if (users[cleanUser].passwordHash !== simpleHash(password + cleanUser))
        return { success: false, error: 'Falsches Passwort.' };

    currentUser = {
        username: cleanUser,
        data: users[cleanUser],
        storageKey: `wmc_projects_${cleanUser}`
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

async function checkSession() {
    try {
        const session = JSON.parse(sessionStorage.getItem('wmc_session') || 'null');
        if (session && session.username) {
            const users = await loadAllUsers();
            if (users[session.username]) {
                currentUser = {
                    username: session.username,
                    data: users[session.username],
                    storageKey: `wmc_projects_${session.username}`
                };
                cloudSyncEnabled = !!users[session.username].binId;
                return true;
            }
        }
    } catch (e) {}
    return false;
}

// ========== PROJEKT CLOUD SYNC ==========

async function ensureCloudBin() {
    if (currentUser.data.binId) { cloudSyncEnabled = true; return; }

    updateSyncStatus('☁️ Cloud wird eingerichtet...', 'warning');
    const result = await callProxy('create', { data: { username: currentUser.username } });
    if (!result.ok) { updateSyncStatus('⚠️ Nur lokal verfügbar', 'warning'); return; }

    const binId = result.data.metadata?.id;
    if (!binId) return;

    // Bin ID beim User speichern
    const users = await loadAllUsers();
    if (users[currentUser.username]) {
        users[currentUser.username].binId = binId;
        await saveAllUsers(users);
        currentUser.data.binId = binId;
        cloudSyncEnabled = true;
        updateSyncStatus('✅ Cloud bereit', 'success');
    }
}

async function loadFromCloud() {
    if (!currentUser?.data?.binId) return null;
    const result = await callProxy('read', { binId: currentUser.data.binId });
    if (!result.ok) return null;
    return result.data.record?.projects || {};
}

async function saveToCloud(projects) {
    if (!currentUser?.data?.binId) return false;
    const result = await callProxy('write', { binId: currentUser.data.binId, data: { projects } });
    return result.ok;
}

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
    if (el) { el.textContent = message; el.className = `sync-status sync-${type}`; }
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
    if (badge) badge.textContent = '☁️ Cloud';
}

function openCloudSetup() {
    alert('☁️ Cloud-Sync ist automatisch aktiv!\n\nDu kannst dich von jedem Computer mit deinem Benutzernamen + Passwort anmelden und deine Projekte sind überall verfügbar.');
}
function closeCloudSetup() {}
async function saveCloudSettings() {}
async function connectExistingBin() {}

console.log('✅ cloud_storage.js geladen (Cloud-Accounts)');
