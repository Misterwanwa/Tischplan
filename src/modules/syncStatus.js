// Synchronisations- und Speicherstatus-Verwaltung

export const SYNC_STATES = {
  SYNCED: 'synced',        // Erfolgreich mit Cloudflare KV synchronisiert
  SAVING: 'saving',        // Speichervorgang läuft gerade
  OFFLINE: 'offline',      // Nur lokal im Cache gespeichert (Netzwerkfehler / offline)
  ERROR: 'error',          // Synchronisation fehlgeschlagen oder Serverfehler
};

export const SYNC_LABELS = {
  [SYNC_STATES.SYNCED]: 'Synchronisiert',
  [SYNC_STATES.SAVING]: 'Wird gespeichert...',
  [SYNC_STATES.OFFLINE]: 'Nur lokal gespeichert',
  [SYNC_STATES.ERROR]: 'Sync-Fehler',
};

// Simple event-based listener for sync status changes across the app
const listeners = new Set();
let currentStatus = SYNC_STATES.SYNCED;
let lastSyncTime = Date.now();
let lastError = null;

export function getSyncStatus() {
  return { status: currentStatus, lastSyncTime, lastError };
}

export function setSyncStatus(newStatus, error = null) {
  currentStatus = newStatus;
  if (newStatus === SYNC_STATES.SYNCED) {
    lastSyncTime = Date.now();
    lastError = null;
  } else if (newStatus === SYNC_STATES.ERROR || newStatus === SYNC_STATES.OFFLINE) {
    lastError = error;
  }
  listeners.forEach(fn => {
    try {
      fn({ status: currentStatus, lastSyncTime, lastError });
    } catch (_) {}
  });
}

export function subscribeSyncStatus(listener) {
  listeners.add(listener);
  listener({ status: currentStatus, lastSyncTime, lastError });
  return () => listeners.delete(listener);
}
