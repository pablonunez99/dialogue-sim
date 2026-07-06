import * as transitionScene from "../travel/transitionScene.js";
import * as worldUpdater from "../world/worldUpdater.js";
import * as aiSceneService from "./aiSceneService.js";
import * as questManager from "./questManager.js";
import * as npcManager from "../persistance/npcManager.js";
import * as locationManager from "../persistance/locationManager.js";
import * as scenePostProcessor from "./scenePostProcessor.js";
import * as sceneStreamer from "./sceneStreamer.js";

/**
 * Genera la escena correspondiente (de parada transitoria, generada por IA, o fallback)
 * y ejecuta todos los procesamientos posteriores y persistencias.
 */
export async function generate(context, activeConversationManager, oldTOD, res) {
    // 1. Check if it's a fast transition scene stop during long travel
    if (await transitionScene.create(context)) {
        // Run day phase / world transitions
        worldUpdater.update(context, activeConversationManager, oldTOD);
        // Post-process the transition stop (logs & save history)
        await scenePostProcessor.processTransition(context);
        
        if (res) {
            sceneStreamer.startStream(res);
            sceneStreamer.sendDmResponse(res, context.scene);
            if (Array.isArray(context.scene.messages)) {
                context.scene.messages.forEach((m) => {
                    sceneStreamer.sendNpcResponse(res, m);
                });
            }
            sceneStreamer.completeStream(res, context.scene);
        }
        return;
    }

    // 2. Otherwise, generate a regular AI Scene or fallback on error
    try {
        if (res) {
            sceneStreamer.startStream(res);
        }

        await aiSceneService.generate(context);

        if (res) {
            sceneStreamer.sendDmResponse(res, context.scene);
        }

        // Process dynamic quests
        await questManager.process(context);

        // Resolve dynamic NPCs
        await npcManager.resolve(context.scene, context.locationId);

        // Resolve dynamic Locations and update location images
        await locationManager.resolve(context.scene, context.state.locationId);
        await locationManager.updateLocationImage(context.scene);

        // Orchestrate NPC turns (passing `res` to stream NPC responses as they are generated)
        await npcManager.orchestrate(context, activeConversationManager, res);

        // Post-process the AI scene
        await scenePostProcessor.process(context, activeConversationManager, oldTOD);

        if (res) {
            sceneStreamer.completeStream(res, context.scene);
        }
    } catch (error) {
        console.error('[Server] Conversation manager error:', error);
        const fallback = activeConversationManager.makeFallbackScene({
            locationId: context.locationId,
            participantIds: context.participantIds,
            playerText: context.playerText,
            state: context.state
        });

        fallback.generateQuest = null;
        context.scene = fallback;

        // Post-process the fallback scene
        await scenePostProcessor.process(context, activeConversationManager, oldTOD);

        if (res) {
            try {
                if (!res.headersSent) {
                    sceneStreamer.startStream(res);
                    sceneStreamer.sendDmResponse(res, context.scene);
                }
                if (Array.isArray(context.scene.messages)) {
                    context.scene.messages.forEach((m) => {
                        sceneStreamer.sendNpcResponse(res, m);
                    });
                }
                sceneStreamer.completeStream(res, context.scene);
            } catch (streamErr) {
                console.error('[Server] Failed streaming fallback:', streamErr);
                if (!res.writableEnded) res.end();
            }
        }
    }
}