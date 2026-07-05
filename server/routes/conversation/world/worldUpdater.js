import { getTimeOfDay } from "../../../world/time.js";
import { runMorningWorldUpdate } from "../../../world/dayTransition.js";
import { triggerTimeOfDayTransitionIfNeeded } from "../../../triggers/dayPhaseTriggers.js";
import { db } from "../../../db.js";

/**
 * Dispara las actualizaciones del mundo cuando avanza el día o cambia la fase del tiempo.
 */
export function update(context, activeConversationManager, oldTOD) {
    const state = context.state;
    const history = context.history;
    
    // Verificamos si el día avanzó respecto al día original enviado en el request
    const originalDay = context.request.state?.day ?? 1;
    const isNewDay = state.day > originalDay;
    const newTOD = state.timeOfDay || getTimeOfDay(state.time);

    if (isNewDay) {
        console.log(`[QuestEngine] Day advanced to ${state.day}. Triggering morning world update in the background...`);
        runMorningWorldUpdate(activeConversationManager, state.day, history, state);
    } else {
        triggerTimeOfDayTransitionIfNeeded(oldTOD, newTOD, state, history, activeConversationManager, db);
    }
}
