import { getEmbedding } from '../embeddingHelper.js';
import { queryByVectorScoped } from '../vectorSearchHelper.js';
import { buildNpcInstructions } from './buildNpcInstructions.js';
import { npcResponseSchema } from './npcResponseSchema.js';
import { filterHistoryForNpc } from './historyFilter.js';

// Model definitions
const NPC_GEMINI_MODEL = process.env.NPC_GEMINI_MODEL || 'gemini-3.1-flash-lite';
const NPC_OPENAI_MODEL = process.env.NPC_OPENAI_MODEL || 'gpt-5.4-nano';

// Robust JSON parser helper
export function parseModelJson(text = '') {
  const trimmed = text.trim();
  const firstBraceIdx = trimmed.indexOf('{');
  if (firstBraceIdx === -1) {
    return JSON.parse(trimmed);
  }
  
  let openBraces = 0;
  let inString = false;
  let escapeNext = false;
  let lastBraceIdx = -1;
  
  for (let i = firstBraceIdx; i < trimmed.length; i++) {
    const char = trimmed[i];
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (char === '\\') {
      escapeNext = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === '{') openBraces++;
      if (char === '}') {
        openBraces--;
        if (openBraces === 0) {
          lastBraceIdx = i;
          break;
        }
      }
    }
  }
  
  if (lastBraceIdx !== -1) {
    const jsonStr = trimmed.slice(firstBraceIdx, lastBraceIdx + 1);
    return JSON.parse(jsonStr);
  }
  
  return JSON.parse(trimmed);
}

/**
 * Runs RAG recall individually for a specific NPC.
 */
async function recallNpcMemories({ npcId, npcName, location, playerText, client, isGemini, vectorManager }) {
  if (!vectorManager || !client) return '';
  
  const activeNpcIds = [npcId];
  const locName = location?.name || '';
  const provider = isGemini ? 'gemini' : 'openai';

  let dialogueResults = [];
  let entityResults = [];

  // Query 1: Dialogue recall using the player's message
  if (playerText && playerText.trim().length > 0) {
    const dialogueQuery = playerText.trim();
    try {
      const queryVector = await getEmbedding(client, dialogueQuery, provider);
      const raw = await queryByVectorScoped(vectorManager.index, queryVector, activeNpcIds, location?.id, 15);
      
      dialogueResults = raw.filter(res => {
        if (res.metadata?.type !== 'dialogue') return false;
        const text = res.text || '';
        const isTransition = text.includes('se une a la conversación') || 
                             text.includes('se traslada a') || 
                             text.includes('se retira de') || 
                             text.includes('parada intermedia');
        return !isTransition;
      });
    } catch (err) {
      console.error(`[RAGRecall:${npcId}] Dialogue query failed:`, err.message);
    }
  }

  // Query 2: Entity/Lore recall using name & location
  const entityQuery = `${npcName} ${locName}`.trim();
  if (entityQuery.length > 0) {
    try {
      const queryVector = await getEmbedding(client, entityQuery, provider);
      const raw = await queryByVectorScoped(vectorManager.index, queryVector, activeNpcIds, location?.id, 10);
      entityResults = raw.filter(res => res.metadata?.type === 'npc' || res.metadata?.type === 'location');
    } catch (err) {
      console.error(`[RAGRecall:${npcId}] Entity query failed:`, err.message);
    }
  }

  const finalDialogueMemories = dialogueResults.slice(0, 3);
  const finalEntityMemories = entityResults.slice(0, 2);
  const combined = [...finalDialogueMemories, ...finalEntityMemories];

  if (combined.length > 0) {
    let ragContext = '\n\n--- MEMORIAS Y CONTEXTO DEL MUNDO RECUPERADO (RAG) ---\n';
    combined.forEach((res, i) => {
      const typeStr = res.metadata.type === 'dialogue' ? 'Diálogo Pasado' : res.metadata.type === 'npc' ? 'NPC info' : 'Lugar info';
      ragContext += `[${i + 1}] (${typeStr}): ${res.text}\n`;
    });
    return ragContext;
  }
  
  return '';
}

/**
 * Runs RAG recall for the DM globally.
 */
export async function recallDmMemories({ location, participants, playerText, client, isGemini, vectorManager }) {
  if (!vectorManager || !client) return '';
  
  const activeNpcIds = (participants || []).map(p => p.id);
  const locName = location?.name || '';
  const provider = isGemini ? 'gemini' : 'openai';

  let dialogueResults = [];
  let entityResults = [];

  // Query 1: Dialogue recall using the player's message
  if (playerText && playerText.trim().length > 0) {
    const dialogueQuery = playerText.trim();
    try {
      const queryVector = await getEmbedding(client, dialogueQuery, provider);
      const raw = await queryByVectorScoped(vectorManager.index, queryVector, activeNpcIds, location?.id, 20);
      
      dialogueResults = raw.filter(res => {
        if (res.metadata?.type !== 'dialogue') return false;
        const text = res.text || '';
        const isTransition = text.includes('se une a la conversación') || 
                             text.includes('se traslada a') || 
                             text.includes('se retira de') || 
                             text.includes('parada intermedia');
        return !isTransition;
      });
    } catch (err) {
      console.error(`[RAGRecall:DM] Dialogue query failed:`, err.message);
    }
  }

  // Query 2: Entity/Lore recall using name of present NPCs and location
  const entityQuery = `${activeNpcIds.join(' ')} ${locName}`.trim();
  if (entityQuery.length > 0) {
    try {
      const queryVector = await getEmbedding(client, entityQuery, provider);
      const raw = await queryByVectorScoped(vectorManager.index, queryVector, activeNpcIds, location?.id, 15);
      entityResults = raw.filter(res => res.metadata?.type === 'npc' || res.metadata?.type === 'location');
    } catch (err) {
      console.error(`[RAGRecall:DM] Entity query failed:`, err.message);
    }
  }

  const finalDialogueMemories = dialogueResults.slice(0, 5);
  const finalEntityMemories = entityResults.slice(0, 3);
  const combined = [...finalDialogueMemories, ...finalEntityMemories];

  if (combined.length > 0) {
    let ragContext = '\n\n--- MEMORIAS Y CONTEXTO DEL MUNDO RECUPERADO PARA EL DM (RAG) ---\n';
    combined.forEach((res, i) => {
      const typeStr = res.metadata.type === 'dialogue' ? 'Diálogo Pasado' : res.metadata.type === 'npc' ? 'NPC info' : 'Lugar info';
      ragContext += `[${i + 1}] (${typeStr}): ${res.text}\n`;
    });
    return ragContext;
  }
  
  return '';
}

/**
 * Shuffles an array in place (Fisher-Yates).
 */
function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Sequential generator that invokes each NPC in random/shuffled order,
 * streams individual dialogues via yield, and aggregates state changes.
 */
export async function* orchestrateNpcTurn({
  participants,
  location,
  state,
  playerText,
  history,
  currentNpcs,
  client,
  isGemini,
  mainModel,
  vectorManager,
  sceneContext
}) {
  // Consolidated deltas
  const aggregated = {
    relationshipDeltas: [],
    trustDeltas: [],
    inventoryDeltas: [],
    goldDelta: 0,
    questUpdates: [],
    generateQuest: null,
    wantsToLeaveIds: [],
    npcMessages: [] // To reconstruct messages for history
  };

  if (!participants || participants.length === 0) {
    return aggregated;
  }

  // Shuffled order of participant NPCs
  const shuffledParticipants = shuffleArray(participants);
  const dialoguesSoFarInTurn = [];
  const r1Speakers = [];

  // Determine model to use with fallback safety
  const npcModel = isGemini ? NPC_GEMINI_MODEL : NPC_OPENAI_MODEL;
  
  const callLlm = async (systemInstruction, npcId) => {
    let modelToUse = npcModel;
    let attempt = 1;
    
    while (attempt <= 2) {
      try {
        console.log(`[AI] Calling NPC ${npcId} using model: "${modelToUse}" (Attempt ${attempt})`);
        
        if (isGemini) {
          const contentText = JSON.stringify({
            task: 'respond_as_npc',
            npcId,
            location,
            playerMessage: playerText,
            dialoguesSoFarInTurn
          });
          
          const response = await client.models.generateContent({
            model: modelToUse,
            contents: [{ role: 'user', parts: [{ text: contentText }] }],
            config: {
              systemInstruction,
              responseMimeType: 'application/json',
              responseSchema: npcResponseSchema
            }
          });
          
          console.log(`[AI] NPC ${npcId} Raw Response:\n${response.text}`);
          return parseModelJson(response.text);
        } else {
          const response = await client.chat.completions.create({
            model: modelToUse,
            messages: [
              { role: 'system', content: systemInstruction },
              { role: 'user', content: `El jugador dice: "${playerText}"` }
            ],
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: 'npc_response',
                strict: true,
                schema: npcResponseSchema
              }
            }
          });
          
          const content = response.choices[0].message.content;
          console.log(`[AI] NPC ${npcId} Raw Response:\n${content}`);
          return parseModelJson(content);
        }
      } catch (err) {
        console.error(`[AI Error] Calling NPC ${npcId} failed with model ${modelToUse}:`, err.message);
        if (attempt === 1) {
          console.log(`[AI Fallback] Retrying with main model: "${mainModel}"`);
          modelToUse = mainModel;
          attempt++;
        } else {
          throw err;
        }
      }
    }
  };

  // ─── ROUND 1: EVERY PARTICIPANT ──────────────────────────────────────────
  console.log('[Orchestrator] Starting Round 1...');
  for (const npc of shuffledParticipants) {
    // 1. Filter history specifically for this NPC
    const filteredHistory = filterHistoryForNpc(history, npc.id, 15);

    // 2. Query RAG memories specifically for this NPC
    const ragContext = await recallNpcMemories({
      npcId: npc.id,
      npcName: npc.name,
      location,
      playerText,
      client,
      isGemini,
      vectorManager
    });

    const otherParticipants = participants.filter(p => p.id !== npc.id);

    // 3. Build instructions
    const systemInstruction = buildNpcInstructions({
      npc,
      location,
      otherParticipants,
      state,
      dialoguesSoFarInTurn,
      filteredHistory,
      ragContext,
      playerText,
      sceneContext
    });

    try {
      const parsed = await callLlm(systemInstruction, npc.id);

      if (parsed.decide_to_speak) {
        dialoguesSoFarInTurn.push({
          npcId: npc.id,
          npcName: npc.name,
          dialogue: parsed.dialogue,
          actions: parsed.actions
        });
        r1Speakers.push(npc);

        // Yield result to stream
        yield {
          type: 'npc_response',
          npcId: npc.id,
          dialogue: parsed.dialogue,
          actions: parsed.actions,
          expression: parsed.expression || 'neutral'
        };

        // Collect stats
        aggregated.npcMessages.push({
          speakerId: npc.id,
          line: parsed.dialogue,
          expression: parsed.expression || 'neutral',
          actions: parsed.actions
        });

        if (parsed.relationshipDelta) {
          aggregated.relationshipDeltas.push({ npcId: npc.id, delta: parsed.relationshipDelta });
        }
        if (parsed.trustDelta) {
          aggregated.trustDeltas.push({ npcId: npc.id, delta: parsed.trustDelta });
        }
        if (Array.isArray(parsed.inventoryDeltas)) {
          aggregated.inventoryDeltas.push(...parsed.inventoryDeltas);
        }
        if (parsed.goldDelta) {
          aggregated.goldDelta += parsed.goldDelta;
        }
        if (Array.isArray(parsed.questUpdates)) {
          aggregated.questUpdates.push(...parsed.questUpdates);
        }
        if (parsed.generateQuest && parsed.generateQuest.urgency) {
          aggregated.generateQuest = parsed.generateQuest;
        }
        if (parsed.wants_to_leave) {
          aggregated.wantsToLeaveIds.push(npc.id);
        }
      } else {
        console.log(`[Orchestrator] NPC ${npc.id} chose not to speak.`);
      }
    } catch (err) {
      console.error(`[Orchestrator] Failed executing NPC ${npc.id}:`, err);
    }
  }

  // ─── ROUND 2: ONLY THOSE WHO SPOKE IN ROUND 1 (AND ONLY IF MULTIPLE SPOKE) ───
  if (r1Speakers.length > 1) {
    console.log('[Orchestrator] Starting Round 2 (reactions)...');
    let round2Spoke = false;
 
    for (const npc of r1Speakers) {
      // Skip if this NPC was the last speaker in dialoguesSoFarInTurn to avoid consecutive monologues
      const lastDialogue = dialoguesSoFarInTurn[dialoguesSoFarInTurn.length - 1];
      if (lastDialogue && lastDialogue.npcId === npc.id) {
        console.log(`[Orchestrator] Skipping NPC ${npc.id} in Round 2 to prevent consecutive monologue.`);
        continue;
      }
      
      // Filter history for this NPC
      const filteredHistory = filterHistoryForNpc(history, npc.id, 15);
      
      const ragContext = await recallNpcMemories({
        npcId: npc.id,
        npcName: npc.name,
        location,
        playerText,
        client,
        isGemini,
        vectorManager
      });

      const otherParticipants = participants.filter(p => p.id !== npc.id);

      const systemInstruction = buildNpcInstructions({
        npc,
        location,
        otherParticipants,
        state,
        dialoguesSoFarInTurn,
        filteredHistory,
        ragContext,
        playerText,
        sceneContext
      });

      try {
        const parsed = await callLlm(systemInstruction, npc.id);

        if (parsed.decide_to_speak) {
          // Add to dialog list so subsequent NPCs in R2 see it
          dialoguesSoFarInTurn.push({
            npcId: npc.id,
            npcName: npc.name,
            dialogue: parsed.dialogue,
            actions: parsed.actions
          });
          round2Spoke = true;

          // Yield response to stream
          yield {
            type: 'npc_response',
            npcId: npc.id,
            dialogue: parsed.dialogue,
            actions: parsed.actions,
            expression: parsed.expression || 'neutral'
          };

          aggregated.npcMessages.push({
            speakerId: npc.id,
            line: parsed.dialogue,
            expression: parsed.expression || 'neutral',
            actions: parsed.actions
          });

          if (parsed.relationshipDelta) {
            aggregated.relationshipDeltas.push({ npcId: npc.id, delta: parsed.relationshipDelta });
          }
          if (parsed.trustDelta) {
            aggregated.trustDeltas.push({ npcId: npc.id, delta: parsed.trustDelta });
          }
          if (Array.isArray(parsed.inventoryDeltas)) {
            aggregated.inventoryDeltas.push(...parsed.inventoryDeltas);
          }
          if (parsed.goldDelta) {
            aggregated.goldDelta += parsed.goldDelta;
          }
          if (Array.isArray(parsed.questUpdates)) {
            aggregated.questUpdates.push(...parsed.questUpdates);
          }
          if (parsed.generateQuest && parsed.generateQuest.urgency) {
            aggregated.generateQuest = parsed.generateQuest;
          }
          if (parsed.wants_to_leave && !aggregated.wantsToLeaveIds.includes(npc.id)) {
            aggregated.wantsToLeaveIds.push(npc.id);
          }
        }
      } catch (err) {
        console.error(`[Orchestrator] Failed executing NPC ${npc.id} in R2:`, err);
      }
    }
  }

  return aggregated;
}
