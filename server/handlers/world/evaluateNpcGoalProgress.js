import { callLlm } from '../../helpers/llmHelper.js';

const schema = {
  type: 'object',
  properties: {
    npcGoalUpdates: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          npcId: { type: 'string' },
          shortTermGoal: { type: 'string' },
          longTermGoal: { type: 'string' },
          goalProgress: { type: 'string' }
        },
        required: ['npcId', 'shortTermGoal', 'longTermGoal', 'goalProgress'],
        additionalProperties: false
      }
    }
  },
  required: ['npcGoalUpdates'],
  additionalProperties: false
};

export async function evaluateNpcGoalProgress(context) {
  const { manager, day, history, npcsList, db } = context;
  if (!manager?.client) return;

  const yesterday = day - 1;
  const yesterdayHistory = Array.isArray(history)
    ? history.filter(entry => entry.day === yesterday || (entry.type !== 'player' && !entry.day))
    : [];

  const historyText = yesterdayHistory.map(h => `${h.speaker || 'Viajero'}: "${h.line}"`).join('\n');

  const prompt = `Eres el Agente de Simulación del Mundo de la aldea medieval de Robledal.
Hoy comienza el Amanecer del Día ${day}. Tu tarea es evaluar el progreso de los objetivos de CADA NPC de la aldea basándote en lo ocurrido ayer (Día ${yesterday}).

=== DIÁLOGOS DE AYER (DÍA ${yesterday}) ===
${historyText}

=== LISTA DE NPCs Y SUS METAS ACTUALES ===
${npcsList.map(n => `- ID: ${n.id} | Nombre: ${n.name}
  * Objetivo a Corto Plazo: "${n.shortTermGoal || 'Establecer contacto'}"
  * Objetivo a Largo Plazo: "${n.longTermGoal || 'Cumplir sus deberes'}"
  * Progreso del Objetivo: "${n.goalProgress || 'Aún no iniciado'}"`).join('\n')}

TAREA: Para CADA NPC que haya tenido diálogos o haya sido mencionado en los eventos de ayer, evalúa si su objetivo a corto o largo plazo se ha completado.
- Si se completó, define un NUEVO objetivo medieval lógico.
- Si no, mantén el objetivo pero actualiza la descripción del progreso ("goalProgress") reflejando los avances o lo que planea hacer hoy.
Devuelve el JSON con la propiedad "npcGoalUpdates".`;

  console.log(`[evaluateGoals] Querying AI to update NPC goals for Day ${day}...`);
  const result = await callLlm(manager, prompt, schema, 'npc_goal_updates');

  if (result?.npcGoalUpdates) {
    const updates = result.npcGoalUpdates;
    console.log(`[evaluateGoals] Proposing ${updates.length} goal updates...`);
    
    // Mutate npcsList in context so subsequent handlers see updated goals
    const updatedNpcs = npcsList.map(npc => {
      const update = updates.find(u => u.npcId === npc.id);
      if (update) {
        return {
          ...npc,
          shortTermGoal: update.shortTermGoal,
          longTermGoal: update.longTermGoal,
          goalProgress: update.goalProgress
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
      updates.forEach(u => {
        const existing = context.pending.npcUpdates.find(item => item.id === u.npcId);
        if (existing) {
          existing.shortTermGoal = u.shortTermGoal;
          existing.longTermGoal = u.longTermGoal;
          existing.goalProgress = u.goalProgress;
        } else {
          context.pending.npcUpdates.push({
            id: u.npcId,
            shortTermGoal: u.shortTermGoal,
            longTermGoal: u.longTermGoal,
            goalProgress: u.goalProgress
          });
        }
      });
    }
  }
}
