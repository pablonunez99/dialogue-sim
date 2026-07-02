import { callLlm } from '../../helpers/llmHelper.js';

const schema = {
  type: 'object',
  properties: {
    npcActions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          npcId: { type: 'string' },
          action: { type: 'string' }
        },
        required: ['npcId', 'action'],
        additionalProperties: false
      }
    }
  },
  required: ['npcActions'],
  additionalProperties: false
};

export async function extractNpcActionsFromYesterday(context) {
  const { manager, day, history, npcsList } = context;
  if (!manager?.client) return;

  // Filter history to yesterday's messages
  const yesterdayHistory = Array.isArray(history)
    ? history.filter(entry => entry.day === day || (entry.type !== 'player' && !entry.day))
    : [];

  if (yesterdayHistory.length === 0) {
    console.log(`[extractNpcActions] No history found for Day ${day}. Skipping extraction.`);
    return;
  }

  const historyText = yesterdayHistory.map(h => `${h.speaker || 'Viajero'}: "${h.line}"`).join('\n');

  const prompt = `Eres el Agente de Simulación del Mundo de la aldea medieval de Robledal.
Tu tarea es analizar las conversaciones del Día ${day} y extraer un resumen conciso (máximo 15 palabras por acción) de las acciones, movimientos, secretos revelados o promesas que CADA NPC presente realizó.

=== DIÁLOGOS DEL DÍA ${day} ===
${historyText}

=== LISTA DE NPCs CONOCIDOS ===
${npcsList.map(n => `- ${n.name} (id: ${n.id})`).join('\n')}

Devuelve un JSON que contenga un array "npcActions" con objetos { npcId, action }. Rellena únicamente para los NPCs que realmente hablaron o realizaron acciones notables en los diálogos.`;

  console.log(`[extractNpcActions] Querying AI to extract NPC actions for Day ${day}...`);
  const result = await callLlm(manager, prompt, schema, 'npc_actions');
  
  if (result?.npcActions) {
    const formatted = result.npcActions
      .filter(a => a.npcId && a.action && a.action.trim() !== '')
      .map(a => ({
        day: day,
        time: '23:59',
        npcId: a.npcId,
        action: a.action
      }));
    
    if (context.pending) {
      context.pending.npcActions.push(...formatted);
    }
    console.log(`[extractNpcActions] Extracted ${formatted.length} actions for Day ${day}.`);
  }
}
