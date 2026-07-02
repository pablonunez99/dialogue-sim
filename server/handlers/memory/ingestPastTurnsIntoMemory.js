import { groupHistoryIntoTurns } from '../../helpers/historyGroupingHelper.js';

export async function ingestPastTurnsIntoMemory(context) {
  const { vectorManager, history, npcsList, locationId, state } = context;
  if (!vectorManager || !history || !npcsList) return;

  const K = 15; // Sliding window size
  const turns = groupHistoryIntoTurns(
    history, 
    npcsList, 
    locationId, 
    state?.day || 1, 
    state?.time || '08:00'
  );

  if (turns.length > K) {
    const oldTurns = turns.slice(0, -K);
    console.log(`[IngestPastTurns] Found ${turns.length} total turns. Ingesting ${oldTurns.length} turns that fell out of sliding window...`);

    for (const turn of oldTurns) {
      const turnText = `[Viajero]: ${turn.player}\n${turn.npcs.join('\n')}`;
      
      // Calculate hash ID for the turn
      let hash = 0;
      for (let i = 0; i < turnText.length; i++) {
        hash = (hash << 5) - hash + turnText.charCodeAt(i);
        hash |= 0;
      }
      const turnId = `dialogue_turn_${Math.abs(hash)}`;

      try {
        const exists = await vectorManager.index.getItem(turnId);
        if (!exists) {
          console.log(`[IngestPastTurns] Ingesting turn: ${turnId} (Location: ${turn.locationId}, Day: ${turn.day})`);
          await vectorManager.upsertItem(turnId, turnText, {
            type: 'dialogue',
            locationId: turn.locationId,
            participantIds: turn.npcIds || [],
            day: turn.day,
            time: turn.time
          });
        }
      } catch (err) {
        console.error(`[IngestPastTurns] Failed to ingest turn ${turnId}:`, err.message);
      }
    }
  }
}
