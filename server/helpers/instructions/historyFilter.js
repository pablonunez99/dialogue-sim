/**
 * Filters the global history to only show messages that a specific NPC was present for.
 *
 * @param {Array} history - The global conversation history
 * @param {string} npcId - The ID of the NPC to filter for
 * @param {number} maxTurns - The maximum number of player turns to include
 * @returns {Array} - The filtered history
 */
export function filterHistoryForNpc(history, npcId, maxTurns = 15) {
  const fullHistory = Array.isArray(history) ? history : [];
  
  // First, filter the history where the NPC was present, spoke, or legacy items with no participantIds
  const filtered = fullHistory.filter(entry => {
    // If it's a narrator message, we can show it if it's related to the NPC or if they were present
    if (entry.type === 'narrator') {
      return !entry.participantIds || entry.participantIds.includes(npcId);
    }
    
    // NPC was speaker
    if (entry.speakerId === npcId) return true;
    
    // NPC was present when someone else spoke
    if (entry.participantIds && entry.participantIds.includes(npcId)) return true;
    
    // Fallback/Legacy items that don't have participantIds: include them so context is not completely lost
    if (!entry.participantIds) return true;
    
    return false;
  });

  // Now, keep only the last maxTurns player messages, and their surrounding NPC/Narrator replies
  let playerCount = 0;
  let sliceIndex = 0;
  
  for (let i = filtered.length - 1; i >= 0; i--) {
    if (filtered[i].type === 'player') {
      playerCount++;
      if (playerCount > maxTurns) {
        sliceIndex = i + 1;
        break;
      }
    }
  }

  return filtered.slice(sliceIndex).map(entry => ({
    speakerId: entry.speakerId,
    speaker: entry.speaker,
    line: entry.line,
    type: entry.type
  }));
}
