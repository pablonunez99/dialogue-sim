import { callLlm } from '../../helpers/llmHelper.js';

const schema = {
  type: 'object',
  properties: {
    quests: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          npcId: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          objective: { type: 'string' },
          urgency: { type: 'string' }, // "alta" | "media" | "baja"
          triggerDirectMeet: { type: 'boolean' },
          reward: {
            type: 'object',
            properties: {
              gold: { type: 'integer' },
              relationDelta: { type: 'integer' },
              item: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  description: { type: 'string' }
                },
                required: ['id', 'name', 'description'],
                additionalProperties: false
              }
            },
            required: ['gold', 'relationDelta', 'item'],
            additionalProperties: false
          }
        },
        required: ['id', 'npcId', 'title', 'description', 'objective', 'urgency', 'triggerDirectMeet', 'reward'],
        additionalProperties: false
      }
    }
  },
  required: ['quests'],
  additionalProperties: false
};

export async function generateDailyQuestsForActiveNpcs(context) {
  const { manager, day, npcsList, locationsList } = context;
  if (!manager?.client) return;

  const prompt = `Eres el Agente de Simulación del Mundo de la aldea medieval de Robledal.
Hoy comienza el Amanecer del Día ${day}. Tu tarea es elegir a 1 o 2 NPCs de la aldea y proponer misiones medievales coherentes basadas en sus metas y personalidades.

=== UBICACIONES DE LA ALDEAS ===
${locationsList.map(l => `${l.name} (id: ${l.id})`).join(', ')}

=== LISTA DE NPCs ===
${npcsList.map(n => `- ID: ${n.id} | Nombre: ${n.name} | Rol: ${n.role} | Metas: "${n.shortTermGoal}"`).join('\n')}

TAREA: Genera misiones en "quests".
Reglas para las misiones:
- "id": un identificador alfanumérico único para la misión (ej: quest_herrero_acero_3).
- "npcId": el ID del NPC que ofrece la misión.
- "title": título medieval de la misión.
- "description": contexto narrativo e historia de la misión.
- "objective": qué debe hacer el jugador (ej: entregar un objeto, hablar con alguien).
- "urgency": "alta", "media" o "baja".
- "triggerDirectMeet": si es true, el NPC abordará al jugador directamente en su ubicación.
- "reward": oro, ganancia de relación y opcionalmente un objeto (con id, name, description).
Devuelve únicamente el JSON con el array "quests".`;

  console.log(`[generateQuests] Querying AI to generate daily quests for Day ${day}...`);
  const result = await callLlm(manager, prompt, schema, 'npc_quests');

  if (result?.quests) {
    const quests = result.quests;
    quests.forEach(q => {
      q.dayGenerated = day;
      q.status = 'active';
    });

    console.log(`[generateQuests] Generated ${quests.length} new quests.`);
    if (context.pending) {
      context.pending.quests.push(...quests);
    }
  }
}
