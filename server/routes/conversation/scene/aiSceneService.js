import { createConversationManager }
from "../ai/providerResolver.js";

export async function generate(context) {

    const manager =
        createConversationManager(context);

    context.scene = await manager.createScene(context);

}