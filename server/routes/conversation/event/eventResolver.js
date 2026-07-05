import {
    getEligibleEvent,
    triggerBackgroundEvents
} from "../../../world/eventEngine.js";

/**
 * Resuelve todos los eventos del turno antes de la generación de la escena por la IA.
 */
export async function resolve(context) {
    const state = context.state;
    const locationId = context.locationId;
    let participantIds = context.participantIds;
    const events = context.events;
    const locations = context.locations;

    // Ejecuta eventos de fondo antes del turno
    const bgStartResult = await triggerBackgroundEvents(
        state,
        events,
        locations
    );
    context.bgStartResult = bgStartResult; // Guardar para combinar notificaciones después

    if (context.hasTraveled) {
        // Limpia participantes si viajó para resolver NPCs de la nueva ubicación
        participantIds = [];
    }

    const activeEvent = getEligibleEvent(
        locationId,
        state,
        events
    );

    if (activeEvent) {
        console.log(
            `[EventEngine] Active Event Triggered: "${activeEvent.name}" (${activeEvent.id})`
        );

        //------------------------------------------
        // Flags
        //------------------------------------------
        if (Array.isArray(activeEvent.setsFlags)) {
            for (const flag of activeEvent.setsFlags) {
                if (!state.flags.includes(flag)) {
                    state.flags.push(flag);
                }
            }
        }

        //------------------------------------------
        // Completed events
        //------------------------------------------
        if (
            !activeEvent.repeatable &&
            !state.completedEvents.includes(activeEvent.id)
        ) {
            state.completedEvents.push(activeEvent.id);
        }

        //------------------------------------------
        // Force NPC participants
        //------------------------------------------
        if (
            Array.isArray(activeEvent.involvedNpcs) &&
            activeEvent.involvedNpcs.length > 0
        ) {
            participantIds = [...activeEvent.involvedNpcs];
        }
    }

    context.activeEvent = activeEvent;
    context.participantIds = participantIds;
}