/**
 * Auxiliar para transmitir la escena en formato Server-Sent Events (SSE).
 * Esto permite al cliente de visual novel recibir la configuración de escena,
 * las líneas individuales de diálogos y finalizar con la confirmación de fin de turno.
 */

export function startStream(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
}

export function sendDmResponse(res, scene) {
  const dmResponse = {
    locationId: scene.locationId,
    participantIds: scene.participantIds,
    narration: scene.narration,
    newNpc: scene.newNpc,
    newLocation: scene.newLocation,
    locationUpdate: scene.locationUpdate
  };
  res.write(`event: dm_response\ndata: ${JSON.stringify(dmResponse)}\n\n`);
}

export function sendNpcResponse(res, m) {
  const npcEvt = {
    npcId: m.speakerId || m.npcId,
    dialogue: m.line || m.dialogue,
    expression: m.expression,
    actions: m.actions
  };
  res.write(`event: npc_response\ndata: ${JSON.stringify(npcEvt)}\n\n`);
}

export function completeStream(res, scene) {
  res.write(`event: turn_complete\ndata: ${JSON.stringify(scene)}\n\n`);
  res.end();
}

export function stream(res, scene) {
  startStream(res);
  sendDmResponse(res, scene);
  if (Array.isArray(scene.messages)) {
    scene.messages.forEach((m) => {
      sendNpcResponse(res, m);
    });
  }
  completeStream(res, scene);
}
