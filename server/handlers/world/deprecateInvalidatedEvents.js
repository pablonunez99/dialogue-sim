import { callLlm } from '../../helpers/llmHelper.js';

const schema = {
  type: 'object',
  properties: {
    deprecatedEventIds: {
      type: 'array',
      items: { type: 'string' }
    }
  },
  required: ['deprecatedEventIds'],
  additionalProperties: false
};

export async function deprecateInvalidatedEvents(context) {
  const { manager, day, history, currentEvents, db } = context;
  if (!manager?.client) return;

  const yesterdayHistory = Array.isArray(history)
    ? history.filter(entry => entry.day === day || (entry.type !== 'player' && !entry.day))
    : [];

  const historyText = yesterdayHistory.map(h => `${h.speaker || 'Viajero'}: "${h.line}"`).join('\n');

  const prompt = `Eres el Agente de Simulación del Mundo de la aldea medieval de Robledal.
Tu tarea es analizar las conversaciones del Día ${day} para determinar si el jugador o los NPCs realizaron acciones que hagan que un evento futuro programado sea lógicamente imposible o innecesario (por ejemplo, si el jugador ya descubrió y resolvió un secreto, un evento futuro de misterio relacionado con el mismo debe cancelarse).

=== DIÁLOGOS DEL DÍA ${day} ===
${historyText}

=== EVENTOS PROGRAMADOS ACTUALMENTE ===
${JSON.stringify(currentEvents, null, 2)}

Devuelve un JSON que contenga un array "deprecatedEventIds" con los IDs de los eventos que deben ser cancelados (eliminados del sistema). Si no hay ninguno, devuelve un array vacío.`;

  console.log(`[deprecateEvents] Querying AI to check for deprecated events on Day ${day}...`);
  const result = await callLlm(manager, prompt, schema, 'deprecated_events');

  if (result?.deprecatedEventIds && result.deprecatedEventIds.length > 0) {
    console.log(`[deprecateEvents] Deprecating ${result.deprecatedEventIds.length} events: ${result.deprecatedEventIds.join(', ')}`);
    const filteredEvents = currentEvents.filter(ev => !result.deprecatedEventIds.includes(ev.id));
    if (db?.saveEvents) {
      await db.saveEvents(filteredEvents);
    }
    // Update context's currentEvents so subsequent triggers see the updated list
    context.currentEvents = filteredEvents;
  }
}
