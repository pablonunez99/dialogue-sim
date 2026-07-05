import { getTimeOfDay } from '../../world/time.js';
import { ConversationContext } from './context/conversationContext.js';
import { createConversationManager } from './ai/providerResolver.js';
import * as travelResolver from './travel/travelEngine.js';
import * as eventResolver from './event/eventResolver.js';
import * as twistResolver from './event/twistEngine.js';
import * as sceneGenerator from './scene/sceneGenerator.js';
import * as sceneStreamer from './scene/sceneStreamer.js';

/**
 * Controlador para la ruta POST /api/conversation.
 */
export async function handleConversation(req, res) {
  try {
    const context = await ConversationContext.create(req.body);

    const location = context.locations.find((item) => item.id === context.locationId);
    if (!location || !String(context.playerText ?? '').trim()) {
      return res.status(400).json({ error: 'Faltan datos de conversacion o ubicacion invalida.' });
    }

    console.log(`\n[Server] POST /api/conversation - locationId: "${context.locationId}", participantIds: [${(context.participantIds || []).join(', ')}], playerText: "${context.playerText}", history length: ${context.history.length}, provider: "${context.provider}"`);

    // Append player turn to server-side history
    context.appendHistory({
      speakerId: 'player',
      speaker: 'Viajero',
      line: context.playerText || '',
      type: 'player',
      locationId: context.state.locationId,
      day: context.state.day,
      time: context.state.time
    });

    const oldTOD = req.body.state?.timeOfDay || getTimeOfDay(req.body.state?.time || '08:00');

    // 1. Resolve travel queue and movements
    await travelResolver.resolve(context);

    // 2. Resolve background and eligible active events
    await eventResolver.resolve(context);

    // 3. Roll for unexpected narrative twists
    twistResolver.resolve(context);

    // If an event or a twist triggered at this intermediate stop, we halt the travel queue
    if ((context.activeEvent || context.twist) && context.state.travelQueue?.length > 0) {
      console.log(`[JourneyEngine] Incident triggered at intermediate stop "${context.locationId}" (Event: ${context.activeEvent?.id || 'none'}, Twist: ${context.twist ? 'yes' : 'none'}). Halting travel queue.`);
      context.state.travelQueue = [];
    }

    // 4. Generate scene (handles transitions, AI generation, fallbacks, and post-processing)
    const activeConversationManager = createConversationManager(context);
    await sceneGenerator.generate(context, activeConversationManager, oldTOD);

    // 5. Stream the response in SSE format using the sceneStreamer service
    sceneStreamer.stream(res, context.scene);
  } catch (error) {
    console.error('[Server] Fatal route controller error:', error);
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }
}
