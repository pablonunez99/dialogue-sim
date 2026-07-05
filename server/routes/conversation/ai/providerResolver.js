import {
    geminiClient,
    geminiModel,
    openaiClient,
    openaiModel,
    client,
    modelName,
    useGemini,
    defaultProvider
} from "../../../config/aiProviders.js";

import { ConversationManager } from "./conversationManager.js";

/**
 * Devuelve un ConversationManager configurado con el proveedor solicitado.
 */
export function createConversationManager(context) {

    const activeProvider =
        context.provider ||
        context.state.provider ||
        defaultProvider;

    let selectedClient = client;
    let selectedModel = modelName;
    let selectedIsGemini = useGemini;

    switch (activeProvider) {

        case "gemini":

            if (geminiClient) {
                selectedClient = geminiClient;
                selectedModel = geminiModel;
                selectedIsGemini = true;
            }

            break;

        case "openai":

            if (openaiClient) {
                selectedClient = openaiClient;
                selectedModel = openaiModel;
                selectedIsGemini = false;
            }

            break;

        default:
            break;
    }

    return new ConversationManager({
        client: selectedClient,
        model: selectedModel,
        isGemini: selectedIsGemini
    });

}