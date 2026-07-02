import { callLlm } from '../../helpers/llmHelper.js';

const schema = {
  type: 'object',
  properties: {
    memorySummary: { type: 'string' }
  },
  required: ['memorySummary'],
  additionalProperties: false
};

export async function refreshNpcMemorySummary(context) {
  const { manager, day, history, npcsList, db } = context;
  if (!manager?.client || !history || !npcsList) return;

  const yesterday = day - 1;
  const yesterdayHistory = Array.isArray(history)
    ? history.filter(entry => entry.day === yesterday || (entry.type !== 'player' && !entry.day))
    : [];

  if (yesterdayHistory.length === 0) {
    console.log(`[MemorySummary] No conversations yesterday. Skipping memory summaries.`);
    return;
  }

  // Find NPCs who spoke yesterday
  const npcIdsWhoSpoke = new Set(
    yesterdayHistory
      .filter(entry => entry.type === 'npc' && entry.speakerId && entry.speakerId !== 'narrator')
      .map(entry => entry.speakerId)
  );

  if (npcIdsWhoSpoke.size === 0) {
    console.log(`[MemorySummary] No NPCs spoke directly yesterday. Skipping memory summaries.`);
    return;
  }

  console.log(`[MemorySummary] Refreshing memory summaries for NPCs: [${[...npcIdsWhoSpoke].join(', ')}]...`);

  let npcsUpdatedCount = 0;
  const updatedNpcs = [...npcsList];

  for (const npcId of npcIdsWhoSpoke) {
    const npcIndex = updatedNpcs.findIndex(n => n.id === npcId);
    if (npcIndex === -1) continue;

    const npc = updatedNpcs[npcIndex];

    // Filter conversations where this NPC was involved
    // We get turns or messages where the NPC spoke or was present
    const npcDialogueLines = yesterdayHistory
      .filter(entry => {
        if (entry.type === 'player') return true; // keep traveler context
        return entry.speakerId === npcId || entry.speakerId === 'narrator';
      });

    const dialogueText = npcDialogueLines.map(h => `${h.speaker || 'Viajero'}: "${h.line}"`).join('\n');

    const prompt = `Eres el Agente de Simulación de Mente para el NPC "${npc.name}" (${npc.id}) en la aldea de Robledal.
Tu tarea es escribir un resumen sumamente conciso (máximo 25 palabras) de lo que recuerdas haber hablado, pactado o sentido con el Viajero durante el día de ayer.

=== DIÁLOGOS DE AYER CON EL VIAJERO ===
${dialogueText}

=== TU MEMORIA ACTUAL (PREVIA) ===
"${npc.memorySummary || 'No tienes memorias claras previas.'}"

TAREA: Devuelve un JSON con la propiedad "memorySummary" que contenga la actualización de tus recuerdos sobre el Viajero. Sé directo, incluye promesas mutuas o sospechas y tu actitud emocional actual hacia él.`;

    const result = await callLlm(manager, prompt, schema, `npc_memory_${npcId}`);
    if (result?.memorySummary) {
      console.log(`[MemorySummary] Memory refreshed for ${npc.name}: "${result.memorySummary}"`);
      updatedNpcs[npcIndex] = {
        ...npc,
        memorySummary: result.memorySummary
      };
      npcsUpdatedCount++;
    }
  }

  if (npcsUpdatedCount > 0) {
    if (db?.saveNpcs) {
      await db.saveNpcs(updatedNpcs);
    }
    context.npcsList = updatedNpcs;
  }
}
