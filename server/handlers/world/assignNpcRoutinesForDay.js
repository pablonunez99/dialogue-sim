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
            additionalProperties: {
              type: 'object',
              properties: {
                locationId: { type: 'string' },
                action: { type: 'string' }
              },
              required: ['locationId', 'action'],
              additionalProperties: false
            }
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
Hoy comienza el Amanecer del Día ${day}. Tu tarea es asignar una rutina diaria estructurada por hora (claves correspondientes a horas en formato string, de 0 a 23, ej: "7", "8", "9", "14", "20", "22") para CADA NPC de la aldea basándose en sus metas actuales y en las ubicaciones disponibles del mapa.

=== UBICACIONES DE LA ALDEA ===
${locationsList.map(l => `${l.name} (id: ${l.id})`).join(', ')}

=== LISTA DE NPCs Y SUS METAS ACTUALES ===
${npcsList.map(n => `- ID: ${n.id} | Nombre: ${n.name}
  * Objetivo a Corto Plazo: "${n.shortTermGoal || 'Establecer contacto'}"
  * Objetivo a Largo Plazo: "${n.longTermGoal || 'Cumplir sus deberes'}"`).join('\n')}

TAREA: Determina la rutina de CADA NPC para el Día ${day} mediante un mapa de horas a objetos { locationId, action }.
Reglas de la rutina horaria:
- Las claves del objeto "routine" deben ser strings de horas (números enteros de 0 a 23, ej: "7", "8", "14", "20"). Debes definir al menos 4 entradas por NPC (ej: despertar a las 7/8, actividades de mañana a las 8/9, actividades de tarde a las 14/15 y descanso/cena a las 20/22).
- Para cada hora, debes especificar la ubicación física ("locationId") y la acción en lenguaje natural ("action").
- La acción y ubicación DEBEN ser coherentes con sus objetivos activos (ej: si busca suministros irá a "mercado", si trabaja de día irá a su lugar de oficio, etc.).
- Ejemplo de entradas en la rutina:
  "7": { "locationId": "casa", "action": "despertar y vestirse" }
  "8": { "locationId": "mercado", "action": "ir al mercado a comprar pan y provisiones" }
  "9": { "locationId": "taberna", "action": "abrir la taberna y atender a los clientes" }
  "20": { "locationId": "bodega", "action": "organizar barricas en la bodega" }
  "22": { "locationId": "casa", "action": "ir a dormir" }
- SOLO usa IDs de ubicación válidos de la lista de ubicaciones en "locationId".
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
