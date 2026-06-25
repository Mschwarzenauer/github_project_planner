const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JSONBIN_KEY = process.env.JSONBIN_KEY;

app.use(express.json());

// Statische Dateien (index.html, style.css, etc.)
app.use(express.static(path.join(__dirname, 'public')));

// ===== API PROXY: JSONBin (Key bleibt versteckt) =====
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
            options = {
                method: 'GET',
                headers: { 'X-Master-Key': JSONBIN_KEY }
            };
        } else if (action === 'write') {
            url = `https://api.jsonbin.io/v3/b/${binId}`;
            options = {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Master-Key': JSONBIN_KEY
                },
                body: JSON.stringify({
                    projects: data.projects,
                    version: 1,
                    lastSync: new Date().toISOString()
                })
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

// Alle anderen Routen → index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`✅ Server läuft auf Port ${PORT}`);
});
