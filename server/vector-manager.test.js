import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { VectorManager } from './vector-manager.js';

test('rehydrates persisted memories from existing vector index when no backup file exists', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'vector-manager-'));
  const manager = new VectorManager(null);
  manager.persistPath = path.join(tempDir, 'vector_memories.json');
  manager.index = {
    isIndexCreated: async () => true,
    createIndex: async () => {},
    upsertItem: async () => {},
    listItems: async () => [
      {
        id: 'dialogue_turn_1',
        vector: [0.1, 0.2],
        metadata: { type: 'dialogue', text: 'Hola' }
      }
    ]
  };

  try {
    await manager.init();
    assert.equal(manager.persistedItems.length, 1);
    assert.equal(manager.persistedItems[0].id, 'dialogue_turn_1');
    assert.equal(manager.persistedItems[0].metadata.type, 'dialogue');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
