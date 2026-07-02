const STORAGE_KEY = 'dialogue-simulator-save';

function getStorage() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null;
  }
  return window.localStorage;
}

function saveGameState(snapshot, storage = getStorage()) {
  if (!storage) return;
  const serializable = JSON.parse(JSON.stringify(snapshot));
  storage.setItem(STORAGE_KEY, JSON.stringify(serializable));
}

function loadGameState(storage = getStorage()) {
  if (!storage) return null;

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function clearGameState(storage = getStorage()) {
  if (!storage) return;
  storage.removeItem(STORAGE_KEY);
}

export { STORAGE_KEY, saveGameState, loadGameState, clearGameState };
