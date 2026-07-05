import * as transitionScene from "../travel/transitionScene.js";
import * as worldUpdater from "../world/worldUpdater.js";
import * as aiSceneService from "./aiSceneService.js";
import * as questManager from "./questManager.js";
import * as npcManager from "../persistance/npcManager.js";
import * as locationManager from "../persistance/locationManager.js";
import * as scenePostProcessor from "./scenePostProcessor.js";

/**
 * Genera la escena correspondiente (de parada transitoria, generada por IA, o fallback)
 * y ejecuta todos los procesamientos posteriores y persistencias.
 */
export async function generate(context, activeConversationManager, oldTOD) {
    // 1. Check if it's a fast transition scene stop during long travel
    if (await transitionScene.create(context)) {
        // Run day phase / world transitions
        worldUpdater.update(context, activeConversationManager, oldTOD);
        // Post-process the transition stop (logs & save history)
        await scenePostProcessor.processTransition(context);
        return;
    }

    // 2. Otherwise, generate a regular AI Scene or fallback on error
    try {
        await aiSceneService.generate(context);

        // Process dynamic quests
        await questManager.process(context);

        // Resolve dynamic NPCs
        await npcManager.resolve(context.scene, context.locationId);

        // Resolve dynamic Locations and update location images
        await locationManager.resolve(context.scene, context.state.locationId);
        await locationManager.updateLocationImage(context.scene);

        // Orchestrate NPC turns
        await npcManager.orchestrate(context, activeConversationManager);

        // Post-process the AI scene
        await scenePostProcessor.process(context, activeConversationManager, oldTOD);
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
    }
}