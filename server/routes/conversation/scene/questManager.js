import {
    generateSingleQuestOnTheFly
} from "../../../world/eventEngine.js";

import {
    createConversationManager
} from "../ai/providerResolver.js";

export async function process(context) {

    const scene = context.scene;

    if (
        !scene.generateQuest ||
        !scene.generateQuest.npcId
    ) {
        return;
    }

    console.log(
        "[QuestEngine] Generating quest..."
    );

    const manager =
        createConversationManager(context);

    const quest =
        await generateSingleQuestOnTheFly(

            manager,

            scene.generateQuest.npcId,

            scene.generateQuest.urgency
                || "media",

            scene.generateQuest.theme
                || "favor general",

            context.state

        );

    context.state.quests.push(quest);

}