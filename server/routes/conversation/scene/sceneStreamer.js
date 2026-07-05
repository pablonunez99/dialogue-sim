/**
 * Auxiliar para transmitir la escena en formato Server-Sent Events (SSE).
 * Esto permite al cliente de visual novel recibir la configuración de escena,
 * las líneas individuales de diálogos y finalizar con la confirmación de fin de turno.
 */
export function stream(res, scene) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // 1. Enviar configuración inicial de la escena (dm_response)
  const dmResponse = {
    locationId: scene.locationId,
    participantIds: scene.participantIds,
    narration: scene.narration,
    newNpc: scene.newNpc,
    newLocation: scene.newLocation,
    locationUpdate: scene.locationUpdate
  };
  res.write(`event: dm_response\ndata: ${JSON.stringify(dmResponse)}\n\n`);

  // 2. Transmitir diálogos individuales paso a paso (npc_response)
  if (Array.isArray(scene.messages)) {
    scene.messages.forEach((m) => {
      const npcEvt = {
        npcId: m.speakerId,
        dialogue: m.line,
        expression: m.expression,
        actions: m.actions
      };
      res.write(`event: npc_response\ndata: ${JSON.stringify(npcEvt)}\n\n`);
    });
  }

  // 3. Enviar confirmación de fin de turno para quitar el loader y aplicar estado (turn_complete)
  res.write(`event: turn_complete\ndata: ${JSON.stringify(scene)}\n\n`);
  res.end();
}
