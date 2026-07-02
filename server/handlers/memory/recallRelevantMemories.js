import { getEmbedding } from '../../helpers/embeddingHelper.js';
import { queryByVector } from '../../helpers/vectorSearchHelper.js';

export async function recallRelevantMemories(context) {
  const { vectorManager, manager, playerText, participants, location, db } = context;
  if (!vectorManager || !manager?.client) return;

  const activeNpcIds = (participants || []).map(p => p.id);
  const npcNames = (participants || []).map(p => p.name).join(' ');
  const locName = location?.name || '';

  // Construct a rich query string combining current message, participant names, and location name
  const queryTerms = `${playerText || ''} ${npcNames} ${locName}`.trim();

  console.log(`[RAGRecall] Generating embedding for query terms: "${queryTerms}"`);
  const provider = manager.isGemini ? 'gemini' : 'openai';
  const queryVector = await getEmbedding(manager.client, queryTerms, provider);

  console.log(`[RAGRecall] Querying local vector index...`);
  const rawResults = await queryByVector(vectorManager.index, queryVector, 15);

  if (rawResults.length > 0) {
    // Filter RAG results to avoid private conversation leaks
    const filteredResults = rawResults.filter(res => {
      if (res.metadata?.type !== 'dialogue') {
        return true; // Keep NPC profiles and Location details unconditionally
      }
      
      const dialogueLocation = res.metadata?.locationId;
      const dialogueParticipants = Array.isArray(res.metadata?.participantIds) ? res.metadata.participantIds : [];
      
      const isSameLocation = dialogueLocation === location?.id;
      const isParticipantInvolved = dialogueParticipants.some(id => activeNpcIds.includes(id));
      
      return isSameLocation || isParticipantInvolved;
    }).slice(0, 5);

    if (filteredResults.length > 0) {
      let ragContext = '\n\n--- MEMORIAS Y CONTEXTO DEL MUNDO RECUPERADO (RAG) ---\n';
      filteredResults.forEach((res, i) => {
        const typeStr = res.metadata.type === 'dialogue' ? 'Diálogo Pasado' : res.metadata.type === 'npc' ? 'NPC info' : 'Lugar info';
        ragContext += `[${i + 1}] (${typeStr}): ${res.text}\n`;
      });

      context.ragContext = ragContext;
      console.log(`[RAGRecall] Injected ${filteredResults.length} filtered memories (out of ${rawResults.length} queried) into turn context.`);
      return;
    }
  }

  context.ragContext = '';
  console.log(`[RAGRecall] No relevant memories retrieved for this turn.`);
}
