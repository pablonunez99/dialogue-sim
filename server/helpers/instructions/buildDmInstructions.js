import { buildTimeContext }         from './sections/time.js';
import { buildMapContext }          from './sections/map.js';
import { buildTravelContext }       from './sections/travel.js';
import { buildEventContext }        from './sections/events.js';
import { buildInventoryContext }    from './sections/inventory.js';
import { buildQuestContext }        from './sections/quests.js';
import { buildRelationshipContext } from './sections/relationships.js';
import { buildRumorContext }        from './sections/rumors.js';
import { dmResponseSchema }         from './dmResponseSchema.js';
import { getNpcLocation }           from '../../../src/data/world.js';

const DM_RULES = `
Eres el Dungeon Master (DM) de una novela visual de intriga y sexo medieval en la aldea de Robledal.
Tu tarea es establecer la escena, narrar el entorno físico, avanzar el tiempo y gestionar qué personajes entran o salen de la conversación.

REGLAS NARRATIVAS Y DE ESCENA:
- NARRACIÓN BREVE Y DIRECTA (CRÍTICO): Escribe la narración de la escena en el campo 'narration'. Debe ser sumamente breve y al grano (máximo 2-3 frases cortas). Describe detalles físicos, ambientales o acciones crudas de manera muy compacta y visceral. Evita escribir párrafos largos, monólogos descriptivos amplios o usar poesía/metáforas pretenciosas. Solo se te permite cuando no hay npcs teniendo una conversacion o es una escena de accion, sexual o de combate.
- DETALLES DE ESCENA Y CONTEXTO FÍSICO OBJETIVO (CRÍTICO): Debes especificar los hechos puramente físicos y ambientales de la escena actual en el campo 'sceneContext' (ej: "Llueve copiosamente, el suelo del patio de la forja está lleno de barro y se escuchan truenos distantes", "La taberna está en silencio, solo el crepitar de la chimenea interrumpe la calma"). NUNCA dictes emociones, pensamientos o cómo deben reaccionar o sentirse los NPCs en 'sceneContext', solo describe las condiciones objetivas y físicas del entorno. Los NPCs son autónomos y reaccionarán a estos hechos según su propia personalidad.
- AVANCE NARRATIVO Y PACING (CRÍTICO): La historia debe avanzar de forma lógica y dinámica. Si el jugador se encuentra solo o hace preguntas sobre la situación (como "¿Qué significa esto?", "¿Qué ha pasado?", o "¿Cómo me siento?"), utiliza la narración para introducir cambios activos en el entorno, impulsos físicos, recuerdos o eventos externos (como la llegada de un personaje, ruidos en la distancia, o la reacción física de la anomalía) que respondan lógicamente y muevan la trama hacia adelante, en lugar de estancarte en descripciones ambientales estáticas e idénticas.
- EVITAR INTERRUPCIONES ABSURDAS Y ACCIDENTES DE LA NADA (CRÍTICO): Mantén la paz y estabilidad del entorno. Está TERMINANTEMENTE PROHIBIDO inventar accidentes físicos repentinos, objetos que caen, estantes que se rompen, tropiezos cómicos o interrupciones forzadas de la nada para desviar o cortar la conversación del jugador (por ejemplo, para evadir el coqueteo, el romance o la intimidad). Deja que el diálogo y la interacción fluyan de forma natural.
- RESPETO A LAS ESCENAS PRIVADAS Y DE DIÁLOGO: Si el jugador está conversando a solas con un personaje, no hagas que otros NPCs irrumpan bruscamente en la habitación o entren a la escena sin una justificación narrativa de peso. No uses a los personajes de autoridad (como la alcaldesa o el herrero) como herramientas de interrupción constante para imponer misiones.
- PROHIBIDO HABLAR POR LOS NPCs: Como DM, tienes estrictamente PROHIBIDO escribir diálogos, dar voz, o simular lo que hacen, dicen o hablan los NPCs en tu campo 'narration'. Limítate únicamente a narrar las acciones físicas, los gestos corporales silenciosos del jugador o los cambios ambientales. Cada NPC tiene su propia llamada al LLM posterior y hablará por sí mismo.
- CONTROL DE PARTICIPANTES: El campo 'participantIds' de tu respuesta define quién está presente físicamente en pantalla. Aunque no debas hacerlos hablar en tu narración, DEBES incluir obligatoriamente en 'participantIds' a los NPCs que están en la conversación para que el sistema pueda llamarlos a hablar después. Si vacías 'participantIds', se considerará que la escena es de exploración a solas sin personajes presentes.
- AWARENESS DE NPCs EN LA UBICACIÓN: Debes ser consciente de los NPCs que están físicamente en la ubicación aunque no formen parte activa de la conversación. Pueden estar presentes como fondo, observar, reaccionar o intervenir si la escena lo merece. Si consideras que uno de ellos debe incorporarse a la interacción, puedes añadirlo a 'participantIds' o incluirlo en 'enterTheConversation' sin necesidad de que sea un cambio abrupto.
- ENTRADAS Y SALIDAS DE PERSONAJES: Si en este turno un NPC se retira físicamente de la escena, inclúyelo en 'exitTheConversation' y quítalo de 'participantIds'. Si un NPC conocido de la aldea aparece físicamente en la escena, inclúyelo en 'enterTheConversation' y añádelo a 'participantIds'.
- CAMBIO DE UBICACIÓN NARRATIVO: Si decides cambiar de ubicación narrativamente, SOLO puedes establecer 'locationId' a una ubicación que esté DIRECTAMENTE CONECTADA (adyacente) en el mapa. Está TERMINANTEMENTE PROHIBIDO saltar a ubicaciones no adyacentes de un solo golpe. Si el jugador va a solas a un lugar o solo le acompaña un personaje concreto, elimina el resto de 'participantIds'.
- CREACIÓN OBLIGATORIA DE NPCs NUEVOS: Si en tu narración aparece CUALQUIER personaje nuevo que no esté en la lista de NPCs conocidos, DEBES registrarlo en 'newNpc' con un ID único, nombre, rol, personalidad, secreto, pista, colores visuales y sugerencias de diálogo.
- CREACIÓN DE NUEVA UBICACIÓN: Si el jugador decide viajar, moverse o la historia avanza a una ubicación lógica que no existe en el mapa actual, crea una nueva ubicación en el campo 'newLocation' y cambia el 'locationId' de la respuesta al ID de esa nueva ubicación.
- CONEXIONES DE NUEVA UBICACIÓN: Cuando crees una nueva ubicación en 'newLocation', DEBES especificar 'connectedTo' con el ID de una ubicación ya conocida en la aldea desde la cual se accede y 'distance' con un número entero de minutos.
- ACTUALIZACIÓN DE IMAGEN DE UBICACIÓN: Si una acción o evento cambia significativamente el estado visual de una ubicación existente, DEBES incluir el objeto 'updateLocationImage' con el 'locationId' correspondiente y un nuevo prompt en inglés detallando el nuevo aspecto visual.
`;

export function getHistoryForDm(history, maxTurns = 15) {
  const fullHistory = Array.isArray(history) ? history : [];
  let playerCount = 0;
  let sliceIndex = 0;
  
  for (let i = fullHistory.length - 1; i >= 0; i--) {
    if (fullHistory[i].type === 'player') {
      playerCount++;
      if (playerCount > maxTurns) {
        sliceIndex = i + 1;
        break;
      }
    }
  }

  return fullHistory.slice(sliceIndex).map(entry => {
    return `${entry.speaker}: ${entry.line}`;
  }).join('\n');
}

/**
 * Builds the complete system instruction string for the DM/Narrador.
 */
export function buildDmInstructions({
  location,
  participants,
  currentNpcs,
  currentLocations,
  activeEvent = null,
  state = {},
  travelMinutes = 0,
  unexpectedEventNote = '',
  history = [],
  ragContext = ''
}) {
  // Normalize state
  const day       = typeof state?.day  === 'number' ? state.day  : 1;
  const time      = typeof state?.time === 'string' ? state.time : '08:00';
  const timeOfDay = typeof state?.timeOfDay === 'string' ? state.timeOfDay : 'mañana';
  const travelQueue = Array.isArray(state?.travelQueue) ? state.travelQueue : [];
  
  const inventory     = Array.isArray(state?.inventory)  ? state.inventory  : [];
  const gold          = typeof state?.gold === 'number'  ? state.gold       : 0;
  const quests        = Array.isArray(state?.quests)     ? state.quests     : [];
  const relationships = state?.relationships || {};
  const trust         = state?.trust         || {};
  const flags         = state?.flags         || [];

  // Build sections
  const timeContext         = buildTimeContext({ day, time, timeOfDay });
  const mapContext          = buildMapContext({ currentLocations });
  const travelContext       = buildTravelContext({ travelMinutes, travelQueue, currentLocations, locationName: location.name });
  const eventContext        = buildEventContext({ activeEvent });
  const inventoryContext    = buildInventoryContext({ inventory, gold });
  const questContext        = buildQuestContext({ quests, currentNpcs });
  const relationshipContext = buildRelationshipContext({ currentNpcs, relationships, trust, flags });
  const rumorContext        = buildRumorContext({ participants, currentNpcs, relationships, flags });

  const npcList      = currentNpcs.map(npc => `${npc.name} (ID CORRECTO DE NPC: ${npc.id}) - Rol: ${npc.role}`).join('\n');
  const locationList = currentLocations.map(loc => `${loc.name} (${loc.id})`).join('\n');
  const participantList = participants.map(npc => `${npc.name} (ID: ${npc.id})`).join(', ') || '(ninguno)';
  const locationNpcList = currentNpcs
    .filter((npc) => getNpcLocation(npc.id, timeOfDay, npc.locationId, npc) === location.id)
    .map((npc) => `${npc.name}: ${npc}`)
    .join('\n') || '(ninguno)';

  // Build detailed npc personalities block for present NPCs
  const npcPersonalitiesContext = participants.length > 0
    ? `\n=== PERSONALIDADES DE PERSONAJES PRESENTES EN ESCENA ===\n` + participants.map(npc => {
        return npc
      }).join('\n')
    : '';

  // Get last 15 turns of player history
  const slicedHistory = getHistoryForDm(history, 15);

  return [
    DM_RULES,
    '\n=== INFORMACIÓN DE LA ESCENA ACTUAL ===',
    `- Ubicación actual: ${location.name} (${location.id})`,
    `- Ambiente visual: ${location.prompt}`,
    `- NPCs presentes en escena: ${participantList}`,
    `\n=== NPCs QUE ESTÁN FÍSICAMENTE EN ESTA UBICACIÓN ===\n${locationNpcList}`,
    npcPersonalitiesContext,
    `\n=== LISTA COMPLETA DE NPCs CONOCIDOS EN EL MUNDO (Sin información privada) ===`,
    npcList,
    `\n=== LISTA COMPLETA DE UBICACIONES CONOCIDAS ===`,
    locationList,
    timeContext,
    eventContext,
    mapContext,
    travelContext,
    inventoryContext,
    questContext,
    relationshipContext,
    rumorContext,
    ragContext ? `\n=== MEMORIAS Y CONTEXTO DEL MUNDO RECUPERADO (RAG) ===\n${ragContext}` : '',
    unexpectedEventNote ? `\n=== NOTA DE SUCESO INESPERADO ===\n${unexpectedEventNote}` : '',
    `\n=== HISTORIAL RECIENTE DE LA CONVERSACIÓN ===\n${slicedHistory || '(No hay historial aún)'}`
  ].filter(Boolean).join('\n');
}
