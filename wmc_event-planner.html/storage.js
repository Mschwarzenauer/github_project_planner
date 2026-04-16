// ========== UNIFIED STORAGE SOLUTION ==========
// Funktioniert mit file://, http://, https://
// Nutzt IndexedDB als Primär-Storage mit globaler Cache für schnelle Zugriffe

let DB = null;
let DB_READY = false;
let GLOBAL_CACHE = {}; // Globaler Cache für alle Tabs/Windows

// IndexedDB initialisieren
function initDB() {
    return new Promise((resolve) => {
        if (DB_READY) {
            resolve();
            return;
        }

        const request = indexedDB.open("ProjectPlannerDB", 1);

        request.onerror = () => {
            console.warn("IndexedDB not available, falling back to localStorage");
            DB_READY = true;
            resolve();
        };

        request.onsuccess = (event) => {
            DB = event.target.result;
            DB_READY = true;
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

// Projekte speichern (IndexedDB + localStorage + GlobalCache)
async function saveProjectsData(projects) {
    await initDB();
    
    // Update GlobalCache
    GLOBAL_CACHE = JSON.parse(JSON.stringify(projects));

    // IndexedDB speichern
    if (DB) {
        try {
            await new Promise((resolve, reject) => {
                const tx = DB.transaction(["projects"], "readwrite");
                const store = tx.objectStore("projects");

                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error || new Error("IndexedDB transaction failed"));
                tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));

                store.clear();
                Object.entries(projects).forEach(([key, item]) => {
                    store.put({ id: key, data: item });
                });
            });
        } catch (e) {
            console.warn("IndexedDB write failed:", e);
        }
    }

    // localStorage als Backup
    try {
        localStorage.setItem("projects", JSON.stringify(projects));
    } catch (e) {
        console.warn("localStorage write failed:", e);
    }

    // window.name als cross-origin/fallback Speicher
    try {
        window.name = JSON.stringify(projects);
    } catch (e) {
        console.warn("window.name write failed:", e);
    }
}

// Projekte laden (GlobalCache → IndexedDB → localStorage → window.name)
async function loadProjectsData() {
    // Wenn GlobalCache vorhanden, sofort nutzen
    if (Object.keys(GLOBAL_CACHE).length > 0) {
        return GLOBAL_CACHE;
    }

    await initDB();

    const fallbackFromLocal = () => {
        try {
            const fallback = JSON.parse(localStorage.getItem("projects") || "{}");
            if (Object.keys(fallback).length > 0) {
                GLOBAL_CACHE = JSON.parse(JSON.stringify(fallback));
                return fallback;
            }
        } catch (e) {
            console.warn("localStorage Fallback fehlgeschlagen:", e);
        }

        try {
            const windowFallback = JSON.parse(window.name || "{}");
            if (Object.keys(windowFallback).length > 0) {
                GLOBAL_CACHE = JSON.parse(JSON.stringify(windowFallback));
                console.log("✓ Projekte aus window.name geladen");
                return windowFallback;
            }
        } catch (e) {
            console.warn("window.name Fallback fehlgeschlagen:", e);
        }

        GLOBAL_CACHE = {};
        return {};
    };

    // Versuche IndexedDB zuerst
    if (DB) {
        try {
            return await new Promise((resolve) => {
                const tx = DB.transaction(["projects"], "readonly");
                const store = tx.objectStore("projects");
                const request = store.getAll();

                request.onsuccess = () => {
                    const projects = {};
                    request.result.forEach(item => {
                        projects[item.id] = item.data;
                    });

                    if (Object.keys(projects).length > 0) {
                        GLOBAL_CACHE = JSON.parse(JSON.stringify(projects));
                        console.log("✓ Projekte aus IndexedDB geladen (" + Object.keys(projects).length + " Stück)");
                        resolve(projects);
                    } else {
                        const fallback = fallbackFromLocal();
                        console.log("✓ Projekte aus localStorage geladen (" + Object.keys(fallback).length + " Stück)");
                        if (Object.keys(fallback).length > 0) {
                            saveProjectsData(fallback).catch(e => console.warn("Sync failed:", e));
                        }
                        resolve(fallback);
                    }
                };

                request.onerror = () => {
                    resolve(fallbackFromLocal());
                };
            });
        } catch (e) {
            console.warn("IndexedDB read failed:", e);
            return fallbackFromLocal();
        }
    }

    return fallbackFromLocal();
}

// ========== SYNCHRONE CONVENIENCE FUNCTIONS ==========

// Projekt-Getter (SYNCHRON aus Cache)
function getProjectById(projectId) {
    return GLOBAL_CACHE[projectId] || null;
}

// Alle Projekte laden (SYNCHRON aus Cache)
function getAllProjectsSync() {
    // Fallback falls Cache noch nicht initialisiert
    if (Object.keys(GLOBAL_CACHE).length === 0) {
        try {
            const fallback = JSON.parse(localStorage.getItem("projects") || "{}");
            GLOBAL_CACHE = fallback;
            console.log("✓ Cache aus localStorage geladen:", Object.keys(GLOBAL_CACHE).length, "Projekte");
        } catch (e) {
            console.warn("localStorage Fallback fehlgeschlagen:", e);
            return {};
        }
    }
    return GLOBAL_CACHE;
}

// ========== ASYNCHRONE FUNCTIONS ==========

// Projekt speichern
async function updateProject(projectId, projectData) {
    const projects = await loadProjectsData();
    projects[projectId] = projectData;
    await saveProjectsData(projects);
}

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

// ========== INITIALIZATION ==========

// Erstelle ein Promise für Storage-Initialisierung - IMMER zuverlässig
window.storageInitialized = false;
window.storageInitPromise = new Promise(async (resolve) => {
    console.log("🔄 Storage.js: Starte Initialisierung...");
    
    let maxRetries = 3;
    let retryCount = 0;
    
    while (retryCount < maxRetries) {
        try {
            // Initialisiere IndexedDB
            await initDB();
            console.log("✓ IndexedDB initialisiert");
            
            // Lade Projekte
            const projects = await loadProjectsData();
            console.log("✓ Projekte geladen: " + Object.keys(projects).length + " Stück");
            
            // Stelle sicher dass GLOBAL_CACHE gefüllt ist
            if (Object.keys(GLOBAL_CACHE).length === 0) {
                console.warn("⚠️ GLOBAL_CACHE leer, versuche localStorage Fallback...");
                const fallback = JSON.parse(localStorage.getItem("projects") || "{}");
                GLOBAL_CACHE = fallback;
                if (Object.keys(GLOBAL_CACHE).length > 0) {
                    console.log("✓ Cache aus localStorage gefüllt: " + Object.keys(GLOBAL_CACHE).length + " Projekte");
                    // Synchronisiere mit IndexedDB
                    await saveProjectsData(GLOBAL_CACHE);
                }
            }
            
            window.storageInitialized = true;
            console.log("✅ Storage.js Initialisierung ERFOLGREICH");
            resolve(true);
            break;
            
        } catch (e) {
            retryCount++;
            console.warn("⚠️ Storage-Init Versuch " + retryCount + " fehlgeschlagen:", e.message);
            
            if (retryCount >= maxRetries) {
                console.error("❌ Storage-Initialisierung nach " + maxRetries + " Versuchen fehlgeschlagen");
                // Fallback: Laden aus localStorage
                try {
                    const fallback = JSON.parse(localStorage.getItem("projects") || "{}");
                    GLOBAL_CACHE = JSON.parse(JSON.stringify(fallback));
                    window.storageInitialized = true;
                    console.log("✓ Fallback zu localStorage erfolgreich");
                    resolve(true);
                } catch (fallbackError) {
                    console.error("❌ Auch localStorage Fallback fehlgeschlagen:", fallbackError);
                    GLOBAL_CACHE = {};
                    window.storageInitialized = false;
                    resolve(false);
                }
                break;
            }
            
            // Warte kurz vor erneutem Versuch
            await new Promise(r => setTimeout(r, 100));
        }
    }
});

// Hilfsfunktion für andere Skripte, um auf Storage-Initialisierung zu warten - ZUVERLÄSSIG
window.waitForStorage = function() {
    // Nutze das Promise, nicht irgendwelche Callbacks
    return window.storageInitPromise;
};

console.log("✓ Storage.js geladen (IndexedDB + localStorage hybrid mit GlobalCache)");
