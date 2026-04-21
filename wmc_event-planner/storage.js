// ========== UNIFIED STORAGE SOLUTION - FIXED ==========
// Funktioniert mit file://, http://, https://
// Nutzt localStorage als PRIMARY Storage für bessere Kompatibilität zwischen Seiten

let GLOBAL_CACHE = {}; // Globaler Cache für schnelle Zugriffe
let STORAGE_READY = false;

// ========== PRIMARY STORAGE: localStorage ==========
// localStorage funktioniert zuverlässig zwischen verschiedenen Tabs/Seiten

function loadFromLocalStorage() {
    try {
        const data = localStorage.getItem('projects');
        if (data) {
            const projects = JSON.parse(data);
            if (Object.keys(projects).length > 0) {
                console.log("✓ Projekte aus localStorage geladen:", Object.keys(projects).length);
                return projects;
            }
        }
    } catch (e) {
        console.warn("localStorage lesen fehlgeschlagen:", e);
    }
    return {};
}

function saveToLocalStorage(projects) {
    try {
        localStorage.setItem('projects', JSON.stringify(projects));
        console.log("✓ Projekte in localStorage gespeichert:", Object.keys(projects).length);
        return true;
    } catch (e) {
        console.warn("localStorage schreiben fehlgeschlagen:", e);
        return false;
    }
}

// ========== BACKUP STORAGE: IndexedDB (nur für größere Datenmengen) ==========
let DB = null;

function initDB() {
    return new Promise((resolve) => {
        if (DB) {
            resolve();
            return;
        }

        const request = indexedDB.open("ProjectPlannerDB", 1);

        request.onerror = () => {
            console.warn("IndexedDB nicht verfügbar, nutze nur localStorage");
            resolve();
        };

        request.onsuccess = (event) => {
            DB = event.target.result;
            resolve();
        };

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains("projects")) {
                db.createObjectStore("projects", { keyPath: "id" });
            }
        };
    });
}

async function saveToIndexedDB(projects) {
    if (!DB) return false;
    try {
        await new Promise((resolve, reject) => {
            const tx = DB.transaction(["projects"], "readwrite");
            const store = tx.objectStore("projects");
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            store.clear();
            Object.entries(projects).forEach(([key, item]) => {
                store.put({ id: key, data: item });
            });
        });
        console.log("✓ Backup in IndexedDB gespeichert");
        return true;
    } catch (e) {
        console.warn("IndexedDB write failed:", e);
        return false;
    }
}

async function loadFromIndexedDB() {
    if (!DB) return null;
    try {
        const projects = await new Promise((resolve) => {
            const tx = DB.transaction(["projects"], "readonly");
            const store = tx.objectStore("projects");
            const request = store.getAll();
            request.onsuccess = () => {
                const result = {};
                request.result.forEach(item => {
                    result[item.id] = item.data;
                });
                resolve(result);
            };
            request.onerror = () => resolve(null);
        });
        if (projects && Object.keys(projects).length > 0) {
            console.log("✓ Backup aus IndexedDB geladen:", Object.keys(projects).length);
            return projects;
        }
    } catch (e) {
        console.warn("IndexedDB read failed:", e);
    }
    return null;
}

// ========== HAUPT-FUNKTIONEN ==========

// Projekte speichern (primär localStorage, sekundär IndexedDB)
async function saveProjectsData(projects) {
    // Update GlobalCache
    GLOBAL_CACHE = JSON.parse(JSON.stringify(projects));
    
    // Primary: localStorage
    const localSuccess = saveToLocalStorage(projects);
    
    // Secondary: IndexedDB als Backup
    await initDB();
    await saveToIndexedDB(projects);
    
    // window.name als weiterer Fallback
    try {
        window.name = JSON.stringify(projects);
    } catch (e) {
        console.warn("window.name write failed:", e);
    }
    
    STORAGE_READY = true;
    return localSuccess;
}

// Projekte laden (primär Cache, dann localStorage, dann IndexedDB)
async function loadProjectsData() {
    // 1. Wenn Cache vorhanden, sofort zurückgeben
    if (Object.keys(GLOBAL_CACHE).length > 0) {
        return GLOBAL_CACHE;
    }
    
    // 2. localStorage (Primary)
    let projects = loadFromLocalStorage();
    if (Object.keys(projects).length > 0) {
        GLOBAL_CACHE = JSON.parse(JSON.stringify(projects));
        return projects;
    }
    
    // 3. IndexedDB (Backup)
    await initDB();
    const indexedDBProjects = await loadFromIndexedDB();
    if (indexedDBProjects && Object.keys(indexedDBProjects).length > 0) {
        GLOBAL_CACHE = JSON.parse(JSON.stringify(indexedDBProjects));
        // Synchronisiere zurück zu localStorage
        saveToLocalStorage(indexedDBProjects);
        return indexedDBProjects;
    }
    
    // 4. window.name (letzter Fallback)
    try {
        if (window.name && window.name !== '') {
            const nameData = JSON.parse(window.name);
            if (Object.keys(nameData).length > 0) {
                GLOBAL_CACHE = JSON.parse(JSON.stringify(nameData));
                saveToLocalStorage(nameData);
                console.log("✓ Projekte aus window.name geladen");
                return nameData;
            }
        }
    } catch (e) {
        console.warn("window.name Fallback fehlgeschlagen:", e);
    }
    
    GLOBAL_CACHE = {};
    return {};
}

// ========== SYNCHRONE CONVENIENCE FUNCTIONS ==========

// Projekt-Getter (SYNCHRON aus Cache)
function getProjectById(projectId) {
    if (Object.keys(GLOBAL_CACHE).length === 0) {
        // Versuche localStorage synchron zu laden
        const localData = loadFromLocalStorage();
        if (Object.keys(localData).length > 0) {
            GLOBAL_CACHE = localData;
        }
    }
    return GLOBAL_CACHE[projectId] || null;
}

// Alle Projekte laden (SYNCHRON aus Cache)
function getAllProjectsSync() {
    if (Object.keys(GLOBAL_CACHE).length === 0) {
        const localData = loadFromLocalStorage();
        if (Object.keys(localData).length > 0) {
            GLOBAL_CACHE = localData;
            console.log("✓ Cache aus localStorage geladen:", Object.keys(GLOBAL_CACHE).length);
        } else {
            // Versuche window.name
            try {
                if (window.name && window.name !== '') {
                    const nameData = JSON.parse(window.name);
                    if (Object.keys(nameData).length > 0) {
                        GLOBAL_CACHE = nameData;
                        saveToLocalStorage(nameData);
                        console.log("✓ Cache aus window.name geladen:", Object.keys(GLOBAL_CACHE).length);
                    }
                }
            } catch (e) {}
        }
    }
    return GLOBAL_CACHE;
}

// ========== ASYNCHRONE FUNCTIONS ==========

// Alle Projekte laden (async)
async function getAllProjects() {
    return await loadProjectsData();
}

// Projekt löschen
async function deleteProjectData(projectId) {
    const projects = await loadProjectsData();
    delete projects[projectId];
    await saveProjectsData(projects);
}

// Projekt aktualisieren
async function updateProject(projectId, projectData) {
    const projects = await loadProjectsData();
    projects[projectId] = projectData;
    await saveProjectsData(projects);
}

// ========== INITIALIZATION ==========

// Initialisierung - stellt sicher dass der Cache gefüllt ist
window.storageInitialized = false;
window.storageInitPromise = new Promise(async (resolve) => {
    console.log("🔄 Storage.js: Starte Initialisierung...");
    
    try {
        // Lade Projekte in den Cache
        const projects = await loadProjectsData();
        console.log("✓ Initial geladen:", Object.keys(projects).length, "Projekte");
        
        // Initialisiere IndexedDB für Backup (asynchron, nicht blockierend)
        initDB().catch(e => console.warn("IndexedDB Init:", e));
        
        window.storageInitialized = true;
        STORAGE_READY = true;
        console.log("✅ Storage.js Initialisierung ERFOLGREICH");
        resolve(true);
    } catch (e) {
        console.error("❌ Storage-Initialisierung fehlgeschlagen:", e);
        window.storageInitialized = false;
        resolve(false);
    }
});

// Hilfsfunktion für andere Skripte
window.waitForStorage = function() {
    return window.storageInitPromise;
};

console.log("✓ Storage.js geladen (localStorage primary, IndexedDB backup)");