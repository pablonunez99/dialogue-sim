import { vectorManager } from '../../../config/aiProviders.js';
import { loadNpcs, loadLocations, getLocation } from '../../../data/repository.js';
import { dmResponseSchema } from '../../../helpers/instructions/dmResponseSchema.js';
import { buildInstructions } from '../../../helpers/promptBuilderHelper.js';
import { runBeforeTurn, runAfterTurn } from '../../../triggers/turnTriggers.js';
import { parseModelJson } from '../../../utils/modelHelpers.js';
import { resolveParticipants, getNpcDetails } from '../scene/participantResolver.js';
import { buildMessageArray } from './messageBuilder.js';
import { normalizeScene } from '../scene/sceneNormalizer.js';
import { makeFallbackScene } from '../scene/fallbackGenerator.js';
import { buildDmInstructions } from '../../../helpers/instructions/buildDmInstructions.js';

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
    const participants = resolveParticipants(participantIds, location, currentNpcs, timeOfDay);

    if (!this.client) {
      return makeFallbackScene({ locationId: location.id, participantIds: participants.map((npc) => npc.id), playerText, state });
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
    const systemInstruction = buildDmInstructions({
      location,
      participants,
      currentNpcs,
      currentLocations,
      activeEvent,
      state,
      travelMinutes,
      unexpectedEventNote,
      recentHistory,
      ragContext: context.ragContext,
    });

    let parsed = null;
    const npcDetails = participants.map((npc) => getNpcDetails(npc));

    if (this.isGemini) {
      const contentText = JSON.stringify({
        playerMessage: playerText
      });
      console.log('[AI] System prompt:',systemInstruction)
      console.log('[AI] Content:', contentText)
      console.log(`[AI] Calling Gemini model: "${this.model}"`);
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: [{ role: 'user', parts: [{ text: contentText }] }],
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: dmResponseSchema
        }
      });

      console.log(`[AI] Raw Gemini response:\n${response.text}`);
      parsed = parseModelJson(response.text);
    } else {
      console.log(`[AI] Calling OpenAI model: "${this.model}"`);
      const messages = [
          { role: 'system', content: systemInstruction },
          ...buildMessageArray({ location, participants, playerText, history, state })
        ]
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'dm_response',
            strict: true,
            schema: dmResponseSchema
          }
        }
      });

      console.log(`[AI] Raw OpenAI response:\n${response.choices[0].message.content}`);
      parsed = parseModelJson(response.choices[0].message.content);
    }

    const scene = normalizeScene(parsed, location, participants, activeEvent);

    // 5. Fire afterTurn trigger to execute memory ingestion and post-turn handlers
    await runAfterTurn(context, scene);

    return scene;
  }

  makeFallbackScene({ locationId = 'plaza', participantIds, playerText = '', state = {} }) {
    return makeFallbackScene({ locationId, participantIds, playerText, state });
  }
}
