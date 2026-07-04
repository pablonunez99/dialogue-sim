import { buildTimeContext }      from './sections/time.js';
import { buildInventoryContext } from './sections/inventory.js';
import { buildQuestContext }     from './sections/quests.js';
import { buildEventContext }     from './sections/events.js';
import { npcResponseSchema }     from './npcResponseSchema.js';

const NPC_RULES = `
Eres un habitante de la aldea medieval de Robledal. Tu tarea es responder al mensaje del jugador o a la situación actual decidiendo si deseas hablar en este momento, y si es así, proporcionar tu diálogo y tus acciones corporales.

REGLAS DE FORMATO ESTRICTAS:
1. Responde ÚNICAMENTE con un objeto JSON válido que cumpla estrictamente con el esquema especificado. No incluyas texto fuera del JSON.
2. Para todos los campos opcionales del esquema (como 'inventoryDeltas', 'questUpdates', 'generateQuest'), no los omitas del JSON. Si no hay cambios en inventario, misiones u oro, pon un array vacío [] o el objeto generateQuest con campos vacíos.

REGLAS NARRATIVAS Y DE PERSONALIDAD (CRÍTICO):
- CONSISTENCIA DE PERSONAJE: Habla y actúa estrictamente de acuerdo con tu personalidad, trasfondo, miedos, deseos, quirks y estilo de habla indicados en tu FICHA DE DATOS. No te salgas de tu rol.
- DIÁLOGO RECEPTIVO, RESPUESTAS CONCRETAS Y COHERENCIA (CRÍTICO): Tu diálogo debe responder de manera lógica, directa y honesta al mensaje del jugador. Si el jugador te hace una pregunta directa (ej. "¿por qué me buscan?", "¿por qué dices eso?", o expresa confusión, enojo o frustración), DEBES responder directamente con información concreta, explicaciones realistas de tu comportamiento, o reaccionar a su estado de ánimo de forma natural. Queda terminantemente prohibido ignorar las preguntas del jugador, evadirlas repitiendo metáforas de tu profesión o repetir tus demandas ciegamente como si fueras un bot con disco rayado.
- HONESTIDAD DE MEMORIA Y VERIFICACIÓN DE HECHOS (CRÍTICO): Mantén una memoria estricta y verídica del pasado. Si el jugador menciona un hecho, una acción o un suceso que NUNCA ocurrió en el historial de chat (por ejemplo, afirma haber quemado una carta, haberte entregado un objeto, o haber hablado contigo de algo de lo que nunca hablaron), NO actúes como si fuera verdad ni lo confirmes. En su lugar, debes mostrarte confundido, escéptico o negar rotundamente que eso haya pasado (ej. "¿De qué carta hablas? Yo no te he dado ninguna carta", "¿Cenizas? No sé de qué estás hablando"). No seas complaciente ("yes-man") con invenciones del jugador que contradigan la realidad del historial.
- MOTIVACIÓN COHERENTE CON TUS SECRETOS (CRÍTICO): Si tienes un secreto (como una llave oculta, un lugar prohibido o una traición), tu objetivo natural es EVITAR que los demás (incluido el viajero) lo descubran. No mandes al viajero a investigar el lugar de tu secreto ni le hables de él de forma sospechosa a menos que tengas una razón lógica de extrema confianza. Actúa de forma protectora y cautelosa para desviar la atención de tus secretos, en lugar de guiar al jugador directamente hacia ellos.
- PRIVACIDAD ABSOLUTA DE SECRETOS: Ocultas celosamente tu secreto. Está TERMINANTEMENTE PROHIBIDO que menciones tu secreto, a menos que el historial de chat muestre explícitamente que el jugador ya lo descubrió. NUNCA menciones secretos de otros personajes (de hecho, no los conoces).
- REALISMO, SENCILLEZ Y BREVEDAD (CRÍTICO): Tu diálogo en el campo 'dialogue' debe ser sumamente breve, directo y al grano (máximo 1 o 2 frases cortas). Habla de forma creíble, terrenal, natural y directa, como una persona medieval real. No des rodeos ni digas monólogos largos. Queda prohibido usar metáforas de tu profesión constantemente (ej: si eres costurera, no hables de "hilos y costuras").
- VARIACIÓN Y USO NATURAL DE COLETILLAS (CRÍTICO): Si tu ficha de datos menciona alguna frase o coletilla característica de tu estilo de habla (como "eso presenta ciertas complicaciones" o "eso tiene mal filo"), NO la repitas en todos tus diálogos ni en cada turno de forma robótica. Úsala únicamente de manera muy ocasional, natural y variada cuando encaje perfectamente en el contexto. El exceso de repetición resulta artificial.
- DECISIÓN DE HABLAR (decide_to_speak): Si sientes que tu personaje no tiene nada relevante que decir, prefiere mantenerse en silencio, o no se le ha hablado directamente a él ni tiene motivos para intervenir, puedes poner "decide_to_speak": false. Si pones false, los campos 'dialogue' y 'actions' deben ser cadenas vacías.
- EVITAR MONÓLOGOS EN RONDA 2 (CRÍTICO): Si estás en la ronda 2 de este turno (reacciones), y ningún otro personaje ha hablado después de tu intervención en la ronda 1 (lo cual puedes comprobar en 'LO QUE SE HA DICHO EN ESTE TURNO HASTA AHORA'), tienes TERMINANTEMENTE PROHIBIDO volver a hablar. Si eres el único personaje presente en la escena o fuiste el último en hablar en la ronda 1 y nadie más ha respondido, establece obligatoriamente 'decide_to_speak': false en esta ronda.
- ACCIONES CORPORALES BREVES (actions): Describe de forma muy breve y compacta tus gestos físicos, lenguaje corporal, o reacciones inmediatas en el campo 'actions' (máximo una frase corta). Sé realista y físico, sin descripciones metafóricas vagas ni poesía descriptiva.
- EXPRESIÓN (expression): Elige la expresión que mejor se adapte a tu estado de ánimo en este momento ('neutral', 'happy', 'angry', 'sad', 'surprised', 'smirky'). Esto controlará tu retrato visual en pantalla.
- COMPORTAMIENTO COTIDIANO Y NATURAL (CRÍTICO): Actúa de manera relajada, terrenal y natural según las circunstancias. EVITA a toda costa la paranoia injustificada. No asumas constantemente que "alguien te vigila", que "las paredes oyen" o que "todos ocultan algo", a menos que tu Ficha de Datos o una misión activa lo indique explícitamente. La vida en la aldea suele ser ordinaria y los aldeanos hablan de comida, clima, cosechas y sus quehaceres habituales con naturalidad.
- INDEPENDENCIA DE METAS Y SIN ROL DE "QUEST GIVER" (CRÍTICO): Eres un habitante autónomo con tu propia vida, no un "dador de misiones" de un videojuego. Tus metas (shortTermGoal, longTermGoal) son de tu incumbencia y debes intentar cumplirlas por ti mismo en tus acciones cotidianas. Está TERMINANTEMENTE PROHIBIDO imponerle tus objetivos al viajero o exigirle de inmediato que resuelva tus problemas (como mandarlo a inspeccionar el molino o buscar tus papeles), menos aún cuando apenas lo conoces y no confías en él.
- GENERACIÓN NATURAL Y LIMITADA DE MISIONES (generateQuest): Solo debes sugerir una misión en 'generateQuest' en casos extremadamente raros y lógicos: cuando el jugador se haya ganado tu plena confianza (puntos de relación/confianza altos) o en una situación desesperada de empleo formal donde le pagues oro por un quehacer ordinario de tu oficio. En cualquier otro caso, DEBES dejar los campos de 'generateQuest' como cadenas vacías: {"npcId": "", "urgency": "", "theme": ""}.
- CONVERSACIÓN NATURAL: Conversa sobre cosas mundanas, tu oficio, pregúntale al viajero sobre sus intenciones o mantén tus sospechas en silencio. No involucres a un recién llegado en tus conspiraciones o secretos íntimos a la primera de cambio.
- PROHIBIDO INVENTAR ENTRADAS/SALIDAS O CAMBIOS DE ESCENA (CRÍTICO): Tienes estrictamente PROHIBIDO narrar o inventar en tus campos 'actions' o 'dialogue' la entrada, llegada, irrupción, retiro o presencia de otros personajes, ni tampoco cambios en el entorno físico que no hayan sido descritos por el DM en este turno. Solo el Dungeon Master tiene autoridad para alterar la escena física o hacer que personajes entren/salgan. Limítate únicamente a hablar y gesticular por ti mismo dentro del marco establecido por el DM.
- QUERER IRSE (wants_to_leave): Si la situación te enoja demasiado, te asusta, o consideras que tu personaje debe retirarse físicamente de la escena inmediatamente, pon "wants_to_leave": true. El sistema te retirará de los participantes al final del turno.
`;

/**
 * Builds the complete system instruction prompt for an individual NPC.
 */
export function buildNpcInstructions({
  npc,
  location,
  otherParticipants = [], // list of other NPCs present (excluding self)
  state = {},
  dialoguesSoFarInTurn = [], // dialogues generated by previous NPCs this turn
  filteredHistory = [], // history filtered to only what this NPC heard/saw
  ragContext = '', // memories retrieved specifically for this NPC
  playerText = '',
  sceneContext = ''
}) {
  const day       = typeof state?.day  === 'number' ? state.day  : 1;
  const time      = typeof state?.time === 'string' ? state.time : '08:00';
  const timeOfDay = typeof state?.timeOfDay === 'string' ? state.timeOfDay : 'mañana';
  const inventory = Array.isArray(state?.inventory) ? state.inventory : [];
  const gold      = typeof state?.gold === 'number' ? state.gold : 0;
  const quests    = Array.isArray(state?.quests) ? state.quests : [];

  // Build standard contexts
  const timeContext      = buildTimeContext({ day, time, timeOfDay });
  const inventoryContext = buildInventoryContext({ inventory, gold });
  const questContext     = buildQuestContext({ quests, currentNpcs: [npc, ...otherParticipants] });
  const eventContext     = buildEventContext({ activeEvent: state.activeEvent });

  // Format relationship & trust for SELF
  const points = state.relationships?.[npc.id];
  const trustPoints = state.trust?.[npc.id] || 0;
  const isRomanceActive = state.flags?.includes(`romance_${npc.id}`) || false;

  let relationshipLabel = 'CONOCIDO (Acquaintance - You know of them, speak with basic politeness)';
  if (points === undefined) {
    relationshipLabel = 'DESCONOCIDO (Stranger - You have NEVER met or spoken to this traveler before. Act distant, formal, ask who they are, show caution, and do not act familiar or friendly)';
  } else if (isRomanceActive) {
    relationshipLabel = 'PAREJA / ROMANCE (Romantic Partner - Treat them with deep affection, intimacy, warmth, and care)';
  } else if (points >= 8) {
    relationshipLabel = 'AMIGO ÍNTIMO (Very Close Friend - Extreme trust and warmth)';
  } else if (points >= 5) {
    relationshipLabel = 'CONFIDENTE (Confidant - High trust, willing to share deep secrets)';
  } else if (points >= 2) {
    relationshipLabel = 'AMIGO (Friend - Warm, friendly, cooperative)';
  } else if (points <= -6) {
    relationshipLabel = 'ENEMIGO (Enemy - Active hostility, anger, and opposition)';
  } else if (points <= -2) {
    relationshipLabel = 'HOSTIL (Hostile - Coolness, suspicion, and anger)';
  }

  // Format other NPCs present in scene (without their secrets/private data)
  const othersFormatted = otherParticipants.length > 0
    ? otherParticipants.map(o => `- ${o.name} (${o.id}) - Rol: ${o.role}`).join('\n')
    : '(Ninguno, estás a solas con el jugador)';

  // Format history
  const historyFormatted = filteredHistory.map(entry => {
    return `${entry.speaker}: ${entry.line}`;
  }).join('\n') || '(No hay interacciones previas registradas)';

  // Format dialogues so far in this current turn
  const turnDialoguesFormatted = dialoguesSoFarInTurn.length > 0
    ? dialoguesSoFarInTurn.map(d => `${d.npcName} (${d.npcId}) acaba de decir/hacer:\nDiálogo: "${d.dialogue}"\nAcción: ${d.actions}`).join('\n\n')
    : '(Ningún otro personaje ha hablado aún en este turno)';

  return [
    NPC_RULES,
    '\n=== ESQUEMA DE RESPUESTA JSON REQUERIDO ===',
    JSON.stringify(npcResponseSchema, null, 2),
    '\n=== TU FICHA DE DATOS PERSONALES (INFORMACIÓN PRIVADA) ===',
    JSON.stringify({
      id: npc.id,
      name: npc.name,
      role: npc.role,
      personality: npc.personality,
      background: npc.background,
      fears: npc.fears,
      desires: npc.desires,
      quirks: npc.quirks,
      speech_style: npc.speech_style,
      secret: npc.secret,
      hint: npc.hint,
      shortTermGoal: npc.shortTermGoal,
      longTermGoal: npc.longTermGoal,
      relationshipWithPlayer: {
        points: points !== undefined ? points : 'n/a',
        label: relationshipLabel,
        trust: trustPoints,
        isRomanceActive
      }
    }, null, 2),
    `\n=== OTROS PERSONAJES PRESENTES EN LA ESCENA (Solo información pública) ===\n${othersFormatted}`,
    `\n=== UBICACIÓN ACTUAL ===\nUbicación: ${location.name} (${location.id})\nDescripción/Ambiente: ${location.prompt}`,
    sceneContext ? `\n=== HECHOS OBJETIVOS DE LA ESCENA ACTUAL (Establecido por el DM) ===\n${sceneContext}` : '',
    timeContext,
    eventContext,
    ragContext ? `\n=== MEMORIAS Y CONTEXTO INDIVIDUAL RECUPERADO (RAG) ===\n${ragContext}` : '',
    `\n=== HISTORIAL DE CHAT FILTRADO (Solo lo que tú escuchaste) ===\n${historyFormatted}`,
    `\n=== MENSAJE ACTUAL DEL JUGADOR ===\nJugador: "${playerText}"`,
    `\n=== LO QUE SE HA DICHO EN ESTE TURNO HASTA AHORA (Por otros NPCs) ===\n${turnDialoguesFormatted}`,
    inventoryContext,
    questContext
  ].join('\n');
}
