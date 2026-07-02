export async function pruneOrphanMemories(context) {
  const { vectorManager, npcsList, locationsList } = context;
  if (!vectorManager) return;

  try {
    const items = await vectorManager.index.listItems();
    if (!items || items.length === 0) return;

    const npcIds = new Set(npcsList.map(n => n.id));
    const locationIds = new Set(locationsList.map(l => l.id));
    let prunedCount = 0;

    for (const item of items) {
      const type = item.metadata?.type;
      
      if (type === 'npc') {
        const id = item.metadata?.id || item.id.replace('npc_', '');
        if (!npcIds.has(id)) {
          console.log(`[MemoryPruner] Deleting orphan NPC memory: ${item.id}`);
          await vectorManager.deleteItem(item.id);
          prunedCount++;
        }
      } else if (type === 'location') {
        const id = item.metadata?.id || item.id.replace('location_', '');
        if (!locationIds.has(id)) {
          console.log(`[MemoryPruner] Deleting orphan Location memory: ${item.id}`);
          await vectorManager.deleteItem(item.id);
          prunedCount++;
        }
      }
    }

    if (prunedCount > 0) {
      console.log(`[MemoryPruner] Cleaned up ${prunedCount} orphan memories from RAG.`);
    }
  } catch (err) {
    console.error('[MemoryPruner] Failed to prune orphan memories:', err.message);
  }
}
