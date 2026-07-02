export function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] ** 2;
    nb += b[i] ** 2;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

export async function queryByVector(index, queryVector, limit = 15) {
  if (!index || !queryVector) return [];
  // LocalIndex.queryItems(vector, queryText, topK)
  const results = await index.queryItems(queryVector, '', limit);
  return (results || []).map(r => ({
    id: r.item.id,
    score: r.score,
    metadata: r.item.metadata,
    text: r.item.metadata?.text || ''
  }));
}

export async function queryByVectorScoped(index, queryVector, npcIds = [], locationId, limit = 15) {
  if (!index || !queryVector) return [];

  const orClauses = [];

  // 1. Entity lore cards (type != 'dialogue') matching present entities
  if (locationId) {
    orClauses.push({
      '$and': [
        { type: { '$ne': 'dialogue' } },
        { id: { '$eq': locationId } }
      ]
    });
  }
  for (const id of npcIds) {
    orClauses.push({
      '$and': [
        { type: { '$ne': 'dialogue' } },
        { id: { '$eq': id } }
      ]
    });
  }

  // 2. Dialogue turns (type == 'dialogue') matching present entities or location
  if (locationId) {
    orClauses.push({
      '$and': [
        { type: { '$eq': 'dialogue' } },
        { locationId: { '$eq': locationId } }
      ]
    });
  }
  for (const id of npcIds) {
    orClauses.push({
      '$and': [
        { type: { '$eq': 'dialogue' } },
        { npcId: { '$eq': id } }
      ]
    });
  }

  // If there are no clauses (e.g. ambient environment turn with no NPCs or locationId), return empty
  if (orClauses.length === 0) return [];

  const filter = { '$or': orClauses };
  const results = await index.queryItems(queryVector, '', limit, filter);

  return (results || []).map(r => ({
    id: r.item.id,
    score: r.score,
    metadata: r.item.metadata,
    text: r.item.metadata?.text || ''
  }));
}
