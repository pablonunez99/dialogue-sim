import test from 'node:test';
import assert from 'node:assert/strict';

import { loadGameState, saveGameState, STORAGE_KEY } from './gameStorage.js';

test('saveGameState stores a serializable snapshot and loadGameState reads it back', () => {
  const storage = createMemoryStorage();
  const snapshot = { locationId: 'plaza', history: [{ type: 'player', line: 'Hola' }] };

  saveGameState(snapshot, storage);

  assert.equal(storage.getItem(STORAGE_KEY), JSON.stringify(snapshot));
  assert.deepEqual(loadGameState(storage), snapshot);
});

test('loadGameState returns null for invalid JSON', () => {
  const storage = createMemoryStorage();
  storage.setItem(STORAGE_KEY, '{bad json');

  assert.equal(loadGameState(storage), null);
});

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
    clear() {
      values.clear();
    }
  };
}
