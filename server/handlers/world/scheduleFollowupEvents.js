import { callLlm } from '../../helpers/llmHelper.js';

const schema = {
  type: 'object',
  properties: {
    newEvents: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
          consequence: { type: 'string' },
          day: { type: 'integer' },
          timeOfDay: { type: 'string' },
          locationId: { type: 'string' },
          involvedNpcs: { type: 'array', items: { type: 'string' } },
          requiresFlags: { type: 'array', items: { type: 'string' } },
          excludesIfFlags: { type: 'array', items: { type: 'string' } },
          repeatable: { type: 'boolean' },
          repeatInterval: { type: 'integer' }
        },
        required: [
          'id', 'name', 'description', 'consequence', 'day', 'timeOfDay',
          'locationId', 'involvedNpcs', 'requiresFlags', 'excludesIfFlags',
          'repeatable', 'repeatInterval'
        ],
        additionalProperties: false
      }
    }
  },
  required: ['newEvents'],
  additionalProperties: false
};

export async function scheduleFollowupEvents(context) {
  const { manager, day, history, currentEvents, db } = context;
  if (!manager?.client) return;

  // We analyze dialogues from yesterday (day - 1)
  const yesterday = day - 1;
  const yesterdayHistory = Array.isArray(history)
    ? history.filter(entry => entry.day === yesterday || (entry.type !== 'player' && !entry.day))
    : [];

  if (yesterdayHistory.length === 0) return;

  const historyText = yesterdayHistory.map(h => `${h.speaker || 'Viajero'}: "${h.line}"`).join('\n');

  const prompt = `Eres el Agente de Simulación del Mundo de la aldea medieval de Robledal.
Hoy comienza el Amanecer del Día ${day}. Tu tarea es proponer nuevos sucesos o eventos medievales lógicos para los próximos días basados en las conversaciones del día de ayer (Día ${yesterday}).

=== DIÁLOGOS DE AYER (DÍA ${yesterday}) ===
${historyText}

=== EVENTOS PROGRAMADOS ACTUALMENTE ===
${JSON.stringify(currentEvents, null, 2)}

TAREA: Crea nuevos eventos narrativos para el futuro en "newEvents".
Reglas para eventos:
- Deben tener un "id" alfanumérico único.
- El "day" de ejecución debe ser hoy (Día ${day}) o superior.
- Define con cuidado las banderas requeridas ("requiresFlags") o excluidas ("excludesIfFlags") si el suceso depende de decisiones del jugador.
- Define "repeatable" como false y "repeatInterval" como 0 para eventos únicos de historia.
Devuelve únicamente el objeto JSON con el array "newEvents".`;

  console.log(`[scheduleEvents] Querying AI to schedule new events for Day ${day}...`);
  const result = await callLlm(manager, prompt, schema, 'new_events');

  if (result?.newEvents) {
    const validNewEvents = result.newEvents.filter(ev => ev.id && ev.id !== '');
    if (validNewEvents.length > 0) {
      console.log(`[scheduleEvents] Registering ${validNewEvents.length} new future events...`);
      const updatedEvents = [...currentEvents.filter(ev => !validNewEvents.some(ne => ne.id === ev.id)), ...validNewEvents];
      if (db?.saveEvents) {
        await db.saveEvents(updatedEvents);
      }
      context.currentEvents = updatedEvents;
    }
  }
}
