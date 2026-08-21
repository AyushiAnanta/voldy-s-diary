/**
 * Production-Grade Storage & Persistence Engine for Voldy's Diary.
 * 
 * Uses IndexedDB (Schema v1) for infinite canvas strokes, drafts, viewport, and settings.
 * Features:
 * - QuotaExceededError handling with automatic stroke region compaction
 * - Schema versioning & graceful migration
 * - Multi-tab broadcast synchronization with active-drawing locks
 */

const DB_NAME = "VoldysDiaryDB";
const DB_VERSION = 1;
const STORE_NAME = "sessions";
const SESSION_KEY = "currentSession";

const broadcastChannel = typeof BroadcastChannel !== "undefined" 
  ? new BroadcastChannel("voldys_diary_sync") 
  : null;

/**
 * Opens IndexedDB with schema v1 initialization
 */
function openDB() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("IndexedDB is not supported in this browser environment"));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

const MAX_STROKES_THRESHOLD = 500;
const COMPACTED_STROKES_TARGET = 300;

/**
 * Executes a single IndexedDB put operation inside an isolated, fresh transaction.
 */
function executePut(db, payload) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME], "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(payload, SESSION_KEY);
    req.onsuccess = () => resolve();
    req.onerror = (event) => reject(event.target.error || new Error("IndexedDB write failed"));
  });
}

/**
 * Save session state to IndexedDB with multi-stage fresh transaction quota error recovery
 */
export async function saveSessionState(sessionData) {
  try {
    const db = await openDB();
    const payload = {
      version: DB_VERSION,
      timestamp: Date.now(),
      strokes: sessionData.strokes || [],
      drafts: sessionData.drafts || [],
      viewport: sessionData.viewport || { panX: 0, panY: 0, zoom: 1.0 },
      settings: sessionData.settings || { theme: "arcane", activeTool: "pen", reasoning: "medium" }
    };

    let prunedStrokes = false;

    try {
      // Primary Attempt (Fresh Transaction 1)
      await executePut(db, payload);
    } catch (primaryError) {
      if (primaryError && (primaryError.name === "QuotaExceededError" || primaryError.code === 22)) {
        console.warn("Storage quota exceeded. Executing Tier 1 Compaction: Pruning accepted drafts...");
        // Tier 1: Prune accepted drafts and retry in Fresh Transaction 2
        payload.drafts = payload.drafts.filter(d => !d.accepted);
        try {
          await executePut(db, payload);
        } catch (tier1Error) {
          if (tier1Error && (tier1Error.name === "QuotaExceededError" || tier1Error.code === 22)) {
            console.warn("Tier 1 compaction insufficient. Executing Tier 2 Compaction: Truncating stroke history...");
            // Tier 2: Truncate stroke history in Fresh Transaction 3 ONLY if Tier 1 failed
            if (payload.strokes.length > MAX_STROKES_THRESHOLD) {
              payload.strokes = payload.strokes.slice(-COMPACTED_STROKES_TARGET);
              prunedStrokes = true;
            }
            await executePut(db, payload);
          } else {
            throw tier1Error;
          }
        }
      } else {
        throw primaryError;
      }
    }

    // Notify other open tabs that state has updated
    if (broadcastChannel) {
      broadcastChannel.postMessage({ type: "SESSION_UPDATED", timestamp: payload.timestamp });
    }

    return { success: true, prunedStrokes };
  } catch (error) {
    console.warn("Failed to persist session to IndexedDB:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Load session state from IndexedDB
 */
/**
 * Normalizes reasoning effort input string against prototype pollution & non-string types.
 */
export function normalizeReasoningLevel(input) {
  if (typeof input !== "string") return "normal";
  const REASONING_MAP = {
    none: "normal",
    low: "normal",
    medium: "normal",
    high: "deep",
    max: "deep",
    normal: "normal",
    deep: "deep"
  };
  return Object.hasOwn(REASONING_MAP, input) ? REASONING_MAP[input] : "normal";
}

/**
 * Normalizes theme input string against legacy values and non-string types.
 */
export function normalizeTheme(input) {
  if (typeof input !== "string") return "arcane";
  const VALID_THEMES = ["arcane", "studio"];
  return VALID_THEMES.includes(input) ? input : "arcane";
}

export async function loadSessionState() {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const req = store.get(SESSION_KEY);

      req.onsuccess = (event) => {
        const result = event.target.result;
        if (!result) {
          resolve(null);
          return;
        }

        // Schema Migration check & setting normalization
        if (result.version !== DB_VERSION) {
          result.version = DB_VERSION;
        }
        if (result.settings) {
          result.settings.theme = normalizeTheme(result.settings.theme);
          result.settings.reasoning = normalizeReasoningLevel(result.settings.reasoning);
        }
        resolve(result);
      };
      req.onerror = (event) => reject(event.target.error);
    });
  } catch (error) {
    console.warn("Failed to load session from IndexedDB:", error);
    return null;
  }
}

/**
 * Clears saved session from IndexedDB
 */
export async function clearSessionState() {
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const req = store.delete(SESSION_KEY);
      req.onsuccess = () => resolve();
      req.onerror = (event) => reject(event.target.error);
    });

    if (broadcastChannel) {
      broadcastChannel.postMessage({ type: "SESSION_CLEARED" });
    }
  } catch (error) {
    console.warn("Failed to clear IndexedDB session:", error);
  }
}

/**
 * Subscribe to cross-tab updates with active-drawing lock check callback
 */
export function subscribeToCrossTabSync(onRemoteUpdate, isDrawingActiveCheck) {
  if (!broadcastChannel) return () => {};

  const handleMessage = async (event) => {
    if (!event.data) return;
    
    // Check lock: If user is actively drawing in this tab, ignore/defer remote sync
    if (isDrawingActiveCheck && isDrawingActiveCheck()) {
      return;
    }

    if (event.data.type === "SESSION_UPDATED") {
      const updatedState = await loadSessionState();
      if (updatedState && onRemoteUpdate) {
        onRemoteUpdate(updatedState);
      }
    } else if (event.data.type === "SESSION_CLEARED") {
      if (onRemoteUpdate) {
        onRemoteUpdate({ strokes: [], drafts: [], viewport: { panX: 0, panY: 0, zoom: 1.0 } });
      }
    }
  };

  broadcastChannel.addEventListener("message", handleMessage);
  return () => broadcastChannel.removeEventListener("message", handleMessage);
}
