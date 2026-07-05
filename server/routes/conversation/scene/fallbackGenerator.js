import { getLocation, cachedNpcs } from "../../../data/repository.js";
import { resolveParticipants } from "./participantResolver.js";

/**
 * Genera una escena de diálogo predefinida (fallback) basada en la entrada del jugador,
 * su ubicación y las relaciones existentes en el estado.
 */
export function makeFallbackScene({ locationId = 'plaza', participantIds, playerText = '', state = {} }) {
    const location = getLocation(locationId);
    const participants = resolveParticipants(participantIds, location, cachedNpcs);
    const ids = participants.map((npc) => npc.id);
    const hasSecretTone = /secreto|recaudador|llave|cartas|molino|consejo|ruinas/i.test(playerText);
    const isHelpful = /ayuda|ayudar|proteger|favor|confia|honor/i.test(playerText);

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
      sceneContext: 'El aire se siente expectante.',
      messages: templates.filter((message) => message.speakerId === 'narrator' || ids.includes(message.speakerId)),
      relationshipDeltas: isHelpful ? { [ids[0]]: 1 } : {},
      trustDeltas: hasSecretTone && ids[2] ? { [ids[2]]: 1 } : {},
      newNpc: null
    };
}
