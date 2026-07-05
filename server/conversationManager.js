// Orquesta la generacion de escenas de dialogo con la IA para una conversacion dada
import { vectorManager } from './config/aiProviders.js';
import { loadNpcs, loadLocations, getLocation, cachedNpcs } from './data/repository.js';
import { sceneResponseSchema } from './config/schemas.js';
import { buildInstructions } from './helpers/promptBuilderHelper.js';
import { runBeforeTurn, runAfterTurn } from './triggers/turnTriggers.js';
import { parseModelJson, normalizeDeltaMap } from './utils/modelHelpers.js';
import { EXPRESSIONS, getNpcLocation } from '../src/data/world.js';

export class ConversationManager {
  constructor({ client, model: modelName, isGemini }) {
    this.client = client;
    this.model = modelName;
    this.isGemini = isGemini;
  }

  async createScene({ locationId, participantIds, playerText, history, state, activeEvent = null, travelMinutes = 0, unexpectedEventNote = '' }) {
    const location = getLocation(locationId);
    const currentNpcs = await loadNpcs();
    const currentLocations = await loadLocations();
    const timeOfDay = state?.timeOfDay || 'mañana';
    const participants = this.resolveParticipants(participantIds, location, currentNpcs, timeOfDay);

    if (!this.client) {
      return this.makeFallbackScene({ locationId: location.id, participantIds: participants.map((npc) => npc.id), playerText, state });
    }

    // 1. Build Turn Context for beforeTurn and afterTurn hooks
    const context = {
      vectorManager,
      manager: this,
      playerText,
      participants,
      location,
      history,
      npcsList: currentNpcs,
      locationsList: currentLocations,
      locationId: location.id,
      state,
      ragContext: '' // will be populated by beforeTurn trigger
    };

    // 2. Fire beforeTurn trigger to execute RAG recall and any pre-turn handlers
    await runBeforeTurn(context);

    // 3. Keep the last K turns in history for direct context
    const fullHistory = Array.isArray(history) ? history : [];
    const K = 15;
    let sliceIndex = 0;
    let playerCount = 0;
    for (let i = fullHistory.length - 1; i >= 0; i--) {
      if (fullHistory[i].type === 'player') {
        playerCount++;
        if (playerCount === K) {
          sliceIndex = i;
          break;
        }
      }
    }
    const recentHistory = fullHistory.slice(sliceIndex).map((entry) => ({
      speakerId: entry.speakerId,
      speaker: entry.speaker,
      line: entry.line,
      type: entry.type
    }));

    // 4. Generate system instruction via the prompt builder helper
    const systemInstruction = buildInstructions({
      location,
      participants,
      currentNpcs,
      currentLocations,
      ragContext: context.ragContext,
      activeEvent,
      state,
      travelMinutes,
      unexpectedEventNote
    });

    let parsed = null;
    const npcDetails = participants.map((npc) => this.getNpcDetails(npc));

    if (this.isGemini) {
      const contentText = JSON.stringify({
        task: 'continue_medieval_visual_novel_conversation',
        location,
        npcs: npcDetails,
        villageState: state,
        recentHistory,
        playerMessage: playerText
      });

      console.log(`[AI] Calling Gemini model: "${this.model}"`);
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: [{ role: 'user', parts: [{ text: contentText }] }],
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: sceneResponseSchema
        }
      });

      console.log(`[AI] Raw Gemini response:\n${response.text}`);
      parsed = parseModelJson(response.text);
    } else {
      console.log(`[AI] Calling OpenAI model: "${this.model}"`);
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemInstruction },
          ...this.buildMessageArray({ location, participants, playerText, history, state })
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'scene_response',
            strict: true,
            schema: sceneResponseSchema
          }
        }
      });

      console.log(`[AI] Raw OpenAI response:\n${response.choices[0].message.content}`);
      parsed = parseModelJson(response.choices[0].message.content);
    }

    const scene = this.normalizeScene(parsed, location, participants, activeEvent);

    // 5. Fire afterTurn trigger to execute memory ingestion and post-turn handlers
    await runAfterTurn(context, scene);

    return scene;
  }

  resolveParticipants(participantIds, location, currentNpcs, timeOfDay = 'mañana') {
    const requested = Array.isArray(participantIds) ? participantIds : [];
    const validRequested = requested.map((id) => currentNpcs.find((npc) => npc.id === id)).filter(Boolean);
    if (validRequested.length > 0) return validRequested.slice(0, 4);

    const nearby = currentNpcs.filter((npc) => {
      const currentLoc = getNpcLocation(npc.id, timeOfDay, npc.locationId, npc);
      return currentLoc === location.id;
    });
    return nearby.slice(0, 4);
  }

  buildMessageArray({ location, participants, playerText, history, state }) {
    const npcDetails = participants.map((npc) => this.getNpcDetails(npc));
    const recentHistory = Array.isArray(history)
      ? history.slice(-60).map((entry) => ({
          speakerId: entry.speakerId,
          speaker: entry.speaker,
          line: entry.line,
          type: entry.type
        }))
      : [];

    return [
      {
        role: 'user',
        content: JSON.stringify({
          task: 'continue_medieval_visual_novel_conversation',
          location,
          npcs: npcDetails,
          villageState: state,
          recentHistory,
          playerMessage: playerText
        })
      }
    ];
  }

  getNpcDetails(npc) {
    return {
      id: npc.id,
      name: npc.name,
      role: npc.role,
      personality: npc.personality,
      background: npc.background || '',
      fears: npc.fears || '',
      desires: npc.desires || '',
      quirks: npc.quirks || '',
      speech_style: npc.speech_style || '',
      relationships: npc.relationships || '',
      secret: npc.secret,
      hint: npc.hint,
      knownSuggestions: npc.suggestions,
      memorySummary: npc.memorySummary || ''
    };
  }

  normalizeScene(scene, location, participants, activeEvent = null) {
    // Prefer the participant list the AI decided on — it controls scene entries/exits.
    // An explicit [] from the AI means "no one present" and must be respected.
    // Only fall back to the server-resolved list when the AI omitted the field entirely.
    const resolvedIds = participants.map((npc) => npc.id);
    const aiSentField = Array.isArray(scene.participantIds);
    const aiIds = aiSentField ? scene.participantIds : null;
    let participantIds;
    if (aiSentField) {
      // AI explicitly provided the list (may be empty) — filter to known NPCs and trust it
      participantIds = aiIds
        .filter((id) => resolvedIds.includes(id) || cachedNpcs.some((n) => n.id === id))
        .slice(0, 4);
    } else {
      // AI omitted the field — use server-resolved defaults
      participantIds = resolvedIds;
    }

    const exits = Array.isArray(scene.exitTheConversation) ? scene.exitTheConversation : [];
    const entrances = Array.isArray(scene.enterTheConversation) ? scene.enterTheConversation : [];

    // Filter messages by any valid cached NPC or narrator
    const expressionSet = new Set(EXPRESSIONS);
    const messages = Array.isArray(scene.messages)
      ? scene.messages
          .map((message) => ({
            speakerId: String(message.speakerId || ''),
            line: String(message.line || '').trim().slice(0, 1200),
            expression: expressionSet.has(message.expression) ? message.expression : 'neutral'
          }))
          .filter((message) => (cachedNpcs.some((n) => n.id === message.speakerId) || message.speakerId === 'narrator') && message.line)
      : [];

    // Prepend entrance narrator messages
    if (entrances.length > 0) {
      entrances.forEach(id => {
        const npcName = cachedNpcs.find(n => n.id === id)?.name || id;
        messages.unshift({
          speakerId: 'narrator',
          line: `[Especial] ${npcName} se une a la conversación.`,
          expression: 'neutral'
        });
      });
    }

    // Append exit narrator messages
    if (exits.length > 0) {
      exits.forEach(id => {
        const npcName = cachedNpcs.find(n => n.id === id)?.name || id;
        messages.push({
          speakerId: 'narrator',
          line: `[Especial] ${npcName} se retira de la escena.`,
          expression: 'neutral'
        });
      });
    }

    if (activeEvent) {
      messages.unshift({
        speakerId: 'narrator',
        line: `[Especial - ${activeEvent.name}] ${activeEvent.description}`,
        expression: 'neutral'
      });
    }

    const slicedMessages = messages.slice(0, 8);

    if (!slicedMessages.length) {
      return this.makeFallbackScene({ locationId: location.id, participantIds, playerText: '' });
    }

    // Compute the final participantIds list to send to the client (who remains on screen)
    let finalParticipantIds = [...participantIds];
    if (exits.length > 0) {
      finalParticipantIds = finalParticipantIds.filter(id => !exits.includes(id));
    }
    if (entrances.length > 0) {
      entrances.forEach(id => {
        if (!finalParticipantIds.includes(id) && cachedNpcs.some(n => n.id === id)) {
          finalParticipantIds.push(id);
        }
      });
      finalParticipantIds = finalParticipantIds.slice(0, 4);
    }

    const finalParticipantSet = new Set(finalParticipantIds);

    const inventoryDeltas = Array.isArray(scene.inventoryDeltas) 
      ? scene.inventoryDeltas.filter(d => d.id && d.id !== '') 
      : [];
    const goldDelta = typeof scene.goldDelta === 'number' ? scene.goldDelta : 0;
    const questUpdates = Array.isArray(scene.questUpdates) 
      ? scene.questUpdates.filter(q => q.id && q.id !== '') 
      : [];

    // Convert array of delta objects back into dynamic key maps for compatibility
    const relationshipDeltasMap = {};
    if (Array.isArray(scene.relationshipDeltas)) {
      scene.relationshipDeltas.forEach(d => {
        if (d.npcId && d.npcId !== '') relationshipDeltasMap[d.npcId] = d.delta;
      });
    }
    const trustDeltasMap = {};
    if (Array.isArray(scene.trustDeltas)) {
      scene.trustDeltas.forEach(d => {
        if (d.npcId && d.npcId !== '') trustDeltasMap[d.npcId] = d.delta;
      });
    }

    // Convert empty-string ids to null to maintain backwards compatibility
    const newNpc = (scene.newNpc && scene.newNpc.id && scene.newNpc.id !== '') ? scene.newNpc : null;
    const newLocation = (scene.newLocation && scene.newLocation.id && scene.newLocation.id !== '') ? scene.newLocation : null;
    const generateQuest = (scene.generateQuest && scene.generateQuest.npcId && scene.generateQuest.npcId !== '') ? scene.generateQuest : null;
    
    // Clean suggestions array if empty
    if (newNpc && Array.isArray(newNpc.suggestions)) {
      newNpc.suggestions = newNpc.suggestions.filter(s => s && s !== '');
    }

    return {
      locationId: String(scene.locationId || location.id),
      participantIds: finalParticipantIds,
      narration: String(scene.narration || ''),
      messages: slicedMessages,
      relationshipDeltas: normalizeDeltaMap(relationshipDeltasMap, finalParticipantSet),
      trustDeltas: normalizeDeltaMap(trustDeltasMap, finalParticipantSet),
      newNpc,
      newLocation,
      minutesPassed: typeof scene.minutesPassed === 'number' ? Math.max(1, scene.minutesPassed) : 2,
      inventoryDeltas,
      goldDelta,
      questUpdates,
      generateQuest
    };
  }

  makeFallbackScene({ locationId = 'plaza', participantIds, playerText = '', state = {} }) {
    const location = getLocation(locationId);
    const participants = this.resolveParticipants(participantIds, location, cachedNpcs);
    const ids = participants.map((npc) => npc.id);
    const hasSecretTone = /secreto|recaudador|llave|cartas|molino|consejo|ruinas/i.test(playerText);
    const isHelpful = /ayuda|ayudar|proteger|favor|confia|honor/i.test(playerText);
    const knownTrust = Object.values(state?.trust || {}).reduce((total, value) => total + Number(value || 0), 0);

    const templates = [
      {
        speakerId: 'narrator',
        expression: 'neutral',
        line: 'Las voces de la aldea se mezclan con el susurro del viento medieval.'
      },
      {
        speakerId: ids[0],
        expression: hasSecretTone ? 'smirky' : isHelpful ? 'happy' : 'neutral',
        line: hasSecretTone
          ? 'Nombras heridas que Robledal aprendio a cubrir con barro y silencio.'
          : 'Habla claro, viajero; esta plaza escucha mejor de lo que aparenta.'
      },
      {
        speakerId: ids[1] || ids[0],
        expression: hasSecretTone ? 'angry' : 'smirky',
        line: hasSecretTone
          ? 'Si vienes a remover el molino viejo, mide primero cuantos pasos hay hasta la puerta.'
          : 'Prometer es facil. Lo dificil empieza cuando cae la noche y nadie quiere mirar afuera.'
      }
    ];

    return {
      locationId: location.id,
      participantIds: ids,
      narration: 'El aire se siente expectante.',
      messages: templates.filter((message) => message.speakerId === 'narrator' || ids.includes(message.speakerId)),
      relationshipDeltas: isHelpful ? { [ids[0]]: 1 } : {},
      trustDeltas: hasSecretTone && ids[2] ? { [ids[2]]: 1 } : {},
      newNpc: null
    };
  }
}
