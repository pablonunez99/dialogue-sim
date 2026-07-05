// Motor de eventos: elegibilidad, disparo en segundo plano y generacion de quests puntuales
import { loadNpcs, loadLocations } from '../data/repository.js';
import { getTimeOfDay } from './time.js';
import { parseModelJson } from '../utils/modelHelpers.js';

export function getEligibleEvent(locationId, state, events) {
  const { day = 1, time = '08:00', flags = [], completedEvents = [] } = state;
  const timeOfDay = getTimeOfDay(time);

  const eligible = events.filter((event) => {
    if (event.day !== 0 && event.day !== day) {
      return false;
    }

    if (event.day === 0) {
      if (!event.repeatable || !event.repeatInterval) return false;
      if (day % event.repeatInterval !== 0) return false;
    }

    if (event.timeOfDay && event.timeOfDay !== timeOfDay) {
      return false;
    }

    if (event.locationId && event.locationId !== locationId) {
      return false;
    }

    if (event.requiresFlags && event.requiresFlags.length > 0) {
      const hasAll = event.requiresFlags.every((flag) => flags.includes(flag));
      if (!hasAll) return false;
    }

    if (event.excludesIfFlags && event.excludesIfFlags.length > 0) {
      const hasAny = event.excludesIfFlags.some((flag) => flags.includes(flag));
      if (hasAny) return false;
    }

    if (!event.repeatable && completedEvents.includes(event.id)) {
      return false;
    }

    return true;
  });

  if (eligible.length === 0) return null;

  const priorityMap = { principal: 3, secundario: 2, ambiental: 1 };
  eligible.sort((a, b) => {
    const prioA = priorityMap[a.type] || 0;
    const prioB = priorityMap[b.type] || 0;
    return prioB - prioA;
  });

  return eligible[0];
}

export async function triggerBackgroundEvents(state, events, currentLocations) {
  const notifications = [];
  let updated = false;

  const currentTOD = state.timeOfDay || getTimeOfDay(state.time);
  
  const getWeight = (tod) => {
    if (tod === 'mañana') return 1;
    if (tod === 'tarde') return 2;
    return 3; // noche
  };

  const currentWeight = getWeight(currentTOD);

  for (const ev of events) {
    // Only run story events (non-repeatable, specific day)
    if (ev.day === 0 || ev.repeatable) continue;
    
    // Skip if already completed
    if (state.completedEvents.includes(ev.id)) continue;

    // Check if the trigger condition is met (day and timeOfDay reached or passed)
    const isDayPassed = state.day > ev.day;
    const evWeight = ev.timeOfDay ? getWeight(ev.timeOfDay) : 1;
    const isSameDayPassed = state.day === ev.day && currentWeight >= evWeight;

    if (isDayPassed || isSameDayPassed) {
      console.log(`[EventEngine] Event "${ev.name}" (${ev.id}) triggered in the background at Day ${state.day} - ${state.time}`);
      state.completedEvents.push(ev.id);

      // Apply consequences (flags)
      if (ev.setsFlags && ev.setsFlags.length > 0) {
        ev.setsFlags.forEach(f => {
          if (!state.flags.includes(f)) {
            state.flags.push(f);
          }
        });
      }

      // Add narrator notification so player sees what happened
      const locName = currentLocations.find(l => l.id === ev.locationId)?.name || ev.locationId || 'la aldea';
      notifications.push({
        speakerId: 'narrator',
        line: `[Sucesos de la Aldea] Mientras tanto, en ${locName}: ${ev.description} (Consecuencia: ${ev.consequence || 'Se han producido cambios en la aldea.'})`,
        expression: 'neutral'
      });
      updated = true;
    }
  }

  return { updated, notifications };
}

export async function generateSingleQuestOnTheFly(manager, npcId, urgency, theme, state) {
  try {
    const npcsList = await loadNpcs();
    const locationsList = await loadLocations();
    const npc = npcsList.find(n => n.id === npcId) || { name: npcId, role: 'aldeano', personality: 'neutral' };

    const prompt = `Eres el Diseñador de Misiones (Quest Designer) de la aldea medieval de Robledal.
Debes generar exactamente UNA misión (quest) medieval lógica y contextualizada para el siguiente personaje:
- Nombre: ${npc.name} (id: ${npc.id})
- Rol: ${npc.role}
- Personalidad: ${npc.personality}

=== CONTEXTO / TEMA SOLICITADO ===
${theme}

Urgencia solicitada: ${urgency}

Ubicaciones disponibles en la aldea:
${locationsList.map(l => `- ${l.name} (id: ${l.id})`).join('\n')}

Genera la misión con el siguiente formato JSON que cumpla con el esquema:
{
  "id": "mision_${npc.id}_${Date.now()}",
  "npcId": "${npc.id}",
  "title": "Título breve e interesante en español medieval",
  "description": "Justificación narrativa detallada de la misión, alineada con el tema/contexto solicitado",
  "objective": "Objetivo directo (ej: 'Llevar la carta al molinero')",
  "urgency": "${urgency}",
  "triggerDirectMeet": false,
  "reward": {
    "gold": integer (entre 5 y 25),
    "relationDelta": integer (1 o 2),
    "item": {
      "id": "string (vacío si no hay objeto)",
      "name": "string",
      "description": "string"
    }
  }
}`;

    const singleQuestSchema = {
      type: 'object',
      properties: {
        id: { type: 'string' },
        npcId: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        objective: { type: 'string' },
        urgency: { type: 'string' },
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
    };

    let questResult = null;
    if (manager.client) {
      if (manager.isGemini) {
        const response = await manager.client.models.generateContent({
          model: manager.model,
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          config: {
            responseMimeType: 'application/json',
            responseSchema: singleQuestSchema
          }
        });
        questResult = parseModelJson(response.text);
      } else {
        const response = await manager.client.chat.completions.create({
          model: manager.model,
          messages: [{ role: 'user', content: prompt }],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'single_quest_response',
              strict: true,
              schema: singleQuestSchema
            }
          }
        });
        const content = response.choices[0].message.content;
        questResult = parseModelJson(content);
      }
    }

    if (questResult && questResult.id) {
      questResult.dayGenerated = state.day || 1;
      questResult.status = 'active';
      return questResult;
    }
    throw new Error('Invalid quest response from AI');
  } catch (err) {
    console.error('[QuestEngine] On-the-fly quest generation failed, using fallback:', err.message);
    return {
      id: `mision_${npcId}_otf_${Date.now()}`,
      npcId: npcId,
      title: `El encargo de ${npcId}`,
      description: `Se ha solicitado una tarea especial respecto a: ${theme}`,
      objective: `Hablar con el personaje para resolver el asunto.`,
      urgency: urgency,
      triggerDirectMeet: false,
      reward: { gold: 12, relationDelta: 1, item: { id: "", name: "", description: "" } },
      dayGenerated: state.day || 1,
      status: 'active'
    };
  }
}
