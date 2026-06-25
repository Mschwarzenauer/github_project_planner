const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JSONBIN_KEY = process.env.JSONBIN_KEY;

app.use(express.json());
app.use(express.static(__dirname));

// Globale Users-Bin-ID (wird beim ersten Start erstellt und im Speicher gehalten)
let USERS_BIN_ID = process.env.USERS_BIN_ID || null;

// ===== USERS BIN ID =====
// Gibt die Bin-ID der gemeinsamen Benutzerdatenbank zurück
app.get('/api/users-bin', async (req, res) => {
    if (USERS_BIN_ID) return res.json({ binId: USERS_BIN_ID });

    // Erstelle neue Users-Bin beim ersten Start
    if (!JSONBIN_KEY) return res.status(500).json({ error: 'JSONBIN_KEY fehlt' });

    try {
        const response = await fetch('https://api.jsonbin.io/v3/b', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Master-Key': JSONBIN_KEY,
                'X-Bin-Name': 'WMC_Users_DB',
                'X-Bin-Private': 'true'
            },
            body: JSON.stringify({ users: {} })
        });
        const data = await response.json();
        USERS_BIN_ID = data.metadata?.id;
        console.log('✅ Users-Bin erstellt:', USERS_BIN_ID);
        res.json({ binId: USERS_BIN_ID });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ===== JSONBIN PROXY =====
app.post('/api/jsonbin', async (req, res) => {
    if (!JSONBIN_KEY) {
        return res.status(500).json({ error: 'JSONBIN_KEY nicht gesetzt in Render Environment Variables.' });
    }

    const { action, binId, data } = req.body;

    try {
        let url, options;

        if (action === 'create') {
            url = 'https://api.jsonbin.io/v3/b';
            options = {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Master-Key': JSONBIN_KEY,
                    'X-Bin-Name': `WMC_${data.username}`,
                    'X-Bin-Private': 'true'
                },
                body: JSON.stringify({ projects: {}, version: 1 })
            };
        } else if (action === 'read') {
            url = `https://api.jsonbin.io/v3/b/${binId}/latest`;
            options = { method: 'GET', headers: { 'X-Master-Key': JSONBIN_KEY } };
        } else if (action === 'write') {
            url = `https://api.jsonbin.io/v3/b/${binId}`;
            options = {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'X-Master-Key': JSONBIN_KEY },
                body: JSON.stringify({ ...data, lastSync: new Date().toISOString() })
            };
        } else {
            return res.status(400).json({ error: 'Unbekannte Aktion' });
        }

        const response = await fetch(url, options);
        const result = await response.json();
        res.status(response.status).json(result);

    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`✅ Server läuft auf Port ${PORT}`);
});
