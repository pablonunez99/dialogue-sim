import { groupHistoryIntoTurns } from '../../helpers/historyGroupingHelper.js';

export async function ingestPastTurnsIntoMemory(context) {
  const { vectorManager, history, npcsList, locationId, state, scene } = context;
  if (!vectorManager || !history || !npcsList) {
    console.log('[IngestPastTurns] Skipped: missing vectorManager, history, or npcsList');
    return;
  }

  const K = 1; // Sliding window size
  const turns = groupHistoryIntoTurns(
    history, 
    npcsList, 
    locationId, 
    state?.day || 1, 
    state?.time || '08:00'
  );

  console.log(`[IngestPastTurns] Turn grouping result: ${turns.length} total turns grouped. Ingest strategy: archive old turns + current scene.`);

  // 1. Ingest old turns that fell out of sliding window (archival strategy)
  if (turns.length > K) {
    const oldTurns = turns.slice(0, -K);
    console.log(`[IngestPastTurns] Archiving ${oldTurns.length} old turns that exceeded sliding window of ${K}...`);

    let archivedCount = 0;
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
        const npcIds = turn.npcIds && turn.npcIds.length ? turn.npcIds : ['__ambient__'];
        for (const npcId of npcIds) {
          const scopedTurnId = `${turnId}_${npcId}`;
          const exists = await vectorManager.index.getItem(scopedTurnId);
          if (!exists) {
            await vectorManager.upsertItem(scopedTurnId, turnText, {
              type: 'dialogue',
              locationId: turn.locationId,
              npcId,
              day: turn.day,
              time: turn.time
            });
            archivedCount++;
          }
        }
      } catch (err) {
        console.error(`[IngestPastTurns] Failed to archive turn ${turnId}:`, err.message);
      }
    }
    console.log(`[IngestPastTurns] ✓ Successfully archived ${archivedCount} memory entries.`);
  }

  // 2. Ingest current scene dialogue immediately (eager strategy for recent turns)
  if (scene && scene.messages && Array.isArray(scene.messages) && scene.messages.length > 0) {
    console.log(`[IngestPastTurns] Ingesting current scene dialogue (${scene.messages.length} messages)...`);
    
    const sceneText = scene.messages
      .map(m => `${m.speakerId}: ${m.line}`)
      .join('\n');
    
    let hash = 0;
    for (let i = 0; i < sceneText.length; i++) {
      hash = (hash << 5) - hash + sceneText.charCodeAt(i);
      hash |= 0;
    }
    const sceneId = `dialogue_scene_${Math.abs(hash)}_${Date.now()}`;
    
    try {
      const participantIds = scene.participantIds && scene.participantIds.length > 0 
        ? scene.participantIds 
        : ['__ambient__'];
      
      let sceneIngestedCount = 0;
      for (const npcId of participantIds) {
        const scopedSceneId = `${sceneId}_${npcId}`;
        await vectorManager.upsertItem(scopedSceneId, sceneText, {
          type: 'dialogue',
          locationId: scene.locationId || locationId,
          npcId,
          day: state?.day || 1,
          time: state?.time || '08:00',
          isRecent: true
        });
        sceneIngestedCount++;
      }
      console.log(`[IngestPastTurns] ✓ Successfully ingested current scene into ${sceneIngestedCount} NPC memory slots.`);
    } catch (err) {
      console.error(`[IngestPastTurns] Failed to ingest scene ${sceneId}:`, err.message);
    }
  } else {
    console.log('[IngestPastTurns] No scene data available for immediate ingestion.');
  }
}
