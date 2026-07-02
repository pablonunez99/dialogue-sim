import { LocalIndex } from 'vectra';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

export class VectorManager {
  constructor(geminiClient) {
    this.client = geminiClient;
    this.model = 'gemini-embedding-001';
    this.indexPath = path.join(rootDir, 'server', 'data', 'vector_index');
    this.persistPath = path.join(rootDir, 'server', 'data', 'vector_memories.json');
    this.index = new LocalIndex(this.indexPath);
    this.persistedItems = [];
  }

  async init() {
    try {
      if (!(await this.index.isIndexCreated())) {
        await this.index.createIndex();
        console.log('[VectorManager] Created new local vector index.');
      } else {
        console.log('[VectorManager] Loaded existing local vector index.');
      }
    } catch (err) {
      console.error('[VectorManager] Error initializing vector index (likely corrupted index.json). Resetting index...', err.message);
      await this.resetIndex();
      return;
    }

    await this.loadPersistedItems();

    let corruptionDetected = false;
    for (const item of this.persistedItems) {
      try {
        await this.index.upsertItem({
          id: item.id,
          vector: item.vector || new Array(768).fill(0),
          metadata: item.metadata
        });
      } catch (err) {
        console.warn(`[VectorManager] Rehydration skipped for ${item.id}:`, err.message);
        if (err.message.includes('JSON') || err.message.includes('position') || err.message.includes('SyntaxError')) {
          corruptionDetected = true;
          break;
        }
      }
    }

    if (corruptionDetected) {
      console.error('[VectorManager] Critical index corruption detected. Resetting index...');
      await this.resetIndex();
    }
  }

  async resetIndex() {
    try {
      // Purge the corrupted vector_index directory on disk
      await rm(this.indexPath, { recursive: true, force: true });
      console.log('[VectorManager] Deleted corrupted vector index directory.');
      
      // Reinitialize LocalIndex
      this.index = new LocalIndex(this.indexPath);
      await this.index.createIndex();
      console.log('[VectorManager] Recreated clean vector index.');

      // Reload persisted backup items
      await this.loadPersistedItems();

      // Rehydrate all items from the memories backup list
      for (const item of this.persistedItems) {
        await this.index.upsertItem({
          id: item.id,
          vector: item.vector || new Array(768).fill(0),
          metadata: item.metadata
        });
      }
      console.log('[VectorManager] Self-healing rehydration complete. Successfully restored vector index from backup.');
    } catch (err) {
      console.error('[VectorManager] Failed to self-heal and reset index:', err.message);
    }
  }

  async loadPersistedItems() {
    try {
      const data = await readFile(this.persistPath, 'utf8');
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed) && parsed.length > 0) {
        this.persistedItems = parsed;
        return;
      }
    } catch {
      // Ignore and fall back to the vector index contents.
    }

    try {
      const items = await this.index.listItems();
      this.persistedItems = (items || []).map((item) => ({
        id: item.id,
        text: item.metadata?.text || '',
        metadata: item.metadata || {},
        vector: item.vector || []
      }));
    } catch {
      this.persistedItems = [];
    }
  }

  async savePersistedItems() {
    await mkdir(path.dirname(this.persistPath), { recursive: true });
    await writeFile(this.persistPath, JSON.stringify(this.persistedItems, null, 2), 'utf8');
  }

  async getEmbedding(text) {
    if (!this.client?.models?.embedContent) {
      return new Array(768).fill(0);
    }

    try {
      const response = await this.client.models.embedContent({
        model: this.model,
        contents: text
      });
      return response.embeddings[0].values;
    } catch (err) {
      console.error('[VectorManager] Error generating embedding:', err.message);
      return new Array(768).fill(0);
    }
  }

  async upsertItem(id, text, metadata) {
    try {
      const vector = await this.getEmbedding(text);
      const normalizedMetadata = { ...metadata, text };
      const existingIndex = this.persistedItems.findIndex((item) => item.id === id);

      if (existingIndex >= 0) {
        this.persistedItems[existingIndex] = { id, text, metadata: normalizedMetadata, vector };
      } else {
        this.persistedItems.push({ id, text, metadata: normalizedMetadata, vector });
      }

      await this.savePersistedItems();
      await this.index.upsertItem({
        id,
        vector,
        metadata: normalizedMetadata
      });
      console.log(`[VectorManager] Upserted item: ${id} (${metadata.type})`);
    } catch (err) {
      console.error(`[VectorManager] Failed to upsert item ${id}:`, err.message);
    }
  }

  async deleteItem(id) {
    try {
      this.persistedItems = this.persistedItems.filter((item) => item.id !== id);
      await this.savePersistedItems();
      await this.index.deleteItem(id);
    } catch (err) {
      // Ignored if it doesn't exist
    }
  }

  async query(queryText, typeFilter = '', limit = 5) {
    try {
      await this.loadPersistedItems();

      const normalizedQuery = String(queryText || '').toLowerCase();
      const filteredItems = this.persistedItems.filter((item) => {
        if (typeFilter && item.metadata?.type !== typeFilter) {
          return false;
        }
        return true;
      });

      if (!filteredItems.length) {
        return [];
      }

      const scored = filteredItems
        .map((item) => ({
          id: item.id,
          score: this.scoreText(item.text || '', normalizedQuery),
          metadata: item.metadata,
          text: item.text
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      return scored;
    } catch (err) {
      console.error('[VectorManager] Query failed:', err.message);
      return [];
    }
  }

  scoreText(text, query) {
    if (!query) return 0;
    const words = query.split(/\W+/).filter(Boolean);
    if (!words.length) return 0;

    const target = String(text || '').toLowerCase();
    let score = 0;
    for (const word of words) {
      if (target.includes(word)) {
        score += 2;
      }
    }
    return score;
  }

  async clearDialogues() {
    try {
      const dialogueIds = this.persistedItems
        .filter((item) => item.metadata?.type === 'dialogue')
        .map((item) => item.id);

      if (dialogueIds.length > 0) {
        for (const id of dialogueIds) {
          await this.deleteItem(id);
        }
        console.log(`[VectorManager] Cleared ${dialogueIds.length} dialogue memories.`);
      }
    } catch (err) {
      console.error('[VectorManager] Failed to clear dialogues:', err.message);
    }
  }
}
