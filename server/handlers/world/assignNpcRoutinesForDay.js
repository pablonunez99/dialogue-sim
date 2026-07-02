import { callLlm } from '../../helpers/llmHelper.js';

const schema = {
  type: 'object',
  properties: {
    npcRoutines: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          npcId: { type: 'string' },
          routine: {
            type: 'object',
            properties: {
              mañana: { type: 'string' },
              tarde: { type: 'string' },
              noche: { type: 'string' }
            },
            required: ['mañana', 'tarde', 'noche'],
            additionalProperties: false
          }
        },
        required: ['npcId', 'routine'],
        additionalProperties: false
      }
    }
  },
  required: ['npcRoutines'],
  additionalProperties: false
};

export async function assignNpcRoutinesForDay(context) {
  const { manager, day, npcsList, locationsList, db } = context;
  if (!manager?.client) return;

  const prompt = `Eres el Agente de Simulación del Mundo de la aldea medieval de Robledal.
Hoy comienza el Amanecer del Día ${day}. Tu tarea es asignar una rutina diaria coherente (mañana, tarde y noche) para CADA NPC de la aldea basándote en sus metas actuales y en las ubicaciones disponibles del mapa.

=== UBICACIONES DE LA ALDEA ===
${locationsList.map(l => `${l.name} (id: ${l.id})`).join(', ')}

=== LISTA DE NPCs Y SUS METAS ACTUALES ===
${npcsList.map(n => `- ID: ${n.id} | Nombre: ${n.name}
  * Objetivo a Corto Plazo: "${n.shortTermGoal || 'Establecer contacto'}"
  * Objetivo a Largo Plazo: "${n.longTermGoal || 'Cumplir sus deberes'}"`).join('\n')}

TAREA: Determina la rutina de CADA NPC para el Día ${day} ("routine" con mañana, tarde y noche).
Reglas:
- La rutina DEBE ser coherente con sus objetivos activos (ej: si busca suministros irá al "mercado", si busca descansar irá a la "taberna" o su "casa", etc.).
- SOLO usa IDs de ubicación válidos de la lista de ubicaciones.
Devuelve el JSON con la propiedad "npcRoutines".`;

  console.log(`[assignRoutines] Querying AI to update NPC routines for Day ${day}...`);
  const result = await callLlm(manager, prompt, schema, 'npc_routines');

  if (result?.npcRoutines) {
    const routines = result.npcRoutines;
    console.log(`[assignRoutines] Assigning ${routines.length} routines for Day ${day}...`);

    const updatedNpcs = npcsList.map(npc => {
      const match = routines.find(r => r.npcId === npc.id);
      if (match) {
        return {
          ...npc,
          routine: match.routine
        };
      }
      return npc;
    });

    if (db?.saveNpcs) {
      await db.saveNpcs(updatedNpcs);
    }
    context.npcsList = updatedNpcs;

    // Save to pending accumulator
    if (context.pending) {
      routines.forEach(r => {
        const existing = context.pending.npcUpdates.find(item => item.id === r.npcId);
        if (existing) {
          existing.routine = r.routine;
        } else {
          context.pending.npcUpdates.push({
            id: r.npcId,
            routine: r.routine
          });
        }
      });
    }
  }
}
