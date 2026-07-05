import { getNpcDetails } from "../scene/participantResolver.js";

/**
 * Construye el arreglo de mensajes formateado en JSON para la llamada de OpenAI.
 */
export function buildMessageArray({ location, participants, playerText, history, state }) {
    const npcDetails = participants.map((npc) => getNpcDetails(npc));
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
