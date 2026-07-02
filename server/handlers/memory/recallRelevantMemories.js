import { getEmbedding } from '../../helpers/embeddingHelper.js';
import { queryByVectorScoped } from '../../helpers/vectorSearchHelper.js';

export async function recallRelevantMemories(context) {
  const { vectorManager, manager, playerText, participants, location } = context;
  if (!vectorManager || !manager?.client) return;

  const activeNpcIds = (participants || []).map(p => p.id);
  const npcNames = (participants || []).map(p => p.name).join(' ');
  const locName = location?.name || '';
  const provider = manager.isGemini ? 'gemini' : 'openai';

  let dialogueResults = [];
  let entityResults = [];

  // Query 1: Semantic Dialogue Retrieval (Only dialogue turns, queried with player's message)
  if (playerText && playerText.trim().length > 0) {
    const dialogueQuery = playerText.trim();
    console.log(`[RAGRecall] Querying dialogue memories for: "${dialogueQuery}"`);
    try {
      const queryVector = await getEmbedding(manager.client, dialogueQuery, provider);
      const raw = await queryByVectorScoped(vectorManager.index, queryVector, activeNpcIds, location?.id, 15);
      
      dialogueResults = raw.filter(res => {
        if (res.metadata?.type !== 'dialogue') return false;
        
        // Skip pure narrator transition messages
        const text = res.text || '';
        const isTransition = text.includes('se une a la conversación') || 
                             text.includes('se traslada a') || 
                             text.includes('se retira de') || 
                             text.includes('parada intermedia');
        if (isTransition) return false;

        return true;
      });
    } catch (err) {
      console.error('[RAGRecall] Dialogue query failed:', err.message);
    }
  }

  // Query 2: Entity Lore Retrieval (Only NPC/Location details, queried with active names)
  const entityQuery = `${npcNames} ${locName}`.trim();
  if (entityQuery.length > 0) {
    console.log(`[RAGRecall] Querying entity lore cards for: "${entityQuery}"`);
    try {
      const queryVector = await getEmbedding(manager.client, entityQuery, provider);
      const raw = await queryByVectorScoped(vectorManager.index, queryVector, activeNpcIds, location?.id, 10);
      
      entityResults = raw.filter(res => res.metadata?.type === 'npc' || res.metadata?.type === 'location');
    } catch (err) {
      console.error('[RAGRecall] Entity query failed:', err.message);
    }
  }

  // Combine results (e.g. up to 3 dialogue memories and 2 entity info cards)
  const finalDialogueMemories = dialogueResults.slice(0, 3);
  const finalEntityMemories = entityResults.slice(0, 2);
  const combined = [...finalDialogueMemories, ...finalEntityMemories];

  if (combined.length > 0) {
    let ragContext = '\n\n--- MEMORIAS Y CONTEXTO DEL MUNDO RECUPERADO (RAG) ---\n';
    combined.forEach((res, i) => {
      const typeStr = res.metadata.type === 'dialogue' ? 'Diálogo Pasado' : res.metadata.type === 'npc' ? 'NPC info' : 'Lugar info';
      ragContext += `[${i + 1}] (${typeStr}): ${res.text}\n`;
    });

    context.ragContext = ragContext;
    console.log(`[RAGRecall] Retrieved memories:\n${ragContext}`);
    console.log(`[RAGRecall] Injected ${combined.length} split memories (${finalDialogueMemories.length} dialogues, ${finalEntityMemories.length} lore) into turn context.`);
    return;
  }

  context.ragContext = '';
  console.log(`[RAGRecall] No relevant memories retrieved for this turn.`);
}
