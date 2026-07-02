import { on, fire } from './triggerBus.js';
import { recallRelevantMemories } from '../handlers/memory/recallRelevantMemories.js';
import { ingestPastTurnsIntoMemory } from '../handlers/memory/ingestPastTurnsIntoMemory.js';

export function registerTurnHandlers() {
  on('beforeTurn', recallRelevantMemories);
  on('afterTurn', ingestPastTurnsIntoMemory);
}

export async function runBeforeTurn(context) {
  return await fire('beforeTurn', context);
}

export async function runAfterTurn(context, scene) {
  return await fire('afterTurn', { ...context, scene });
}
