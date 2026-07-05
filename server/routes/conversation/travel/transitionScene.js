import { getTimeOfDay } from "../../../world/time.js";

export async function create(context) {

    const queue = context.state.travelQueue ?? [];

    if (queue.length === 0)
        return false;

    if (context.activeEvent)
        return false;

    if (context.twist)
        return false;

    const currentLocation =
        context.locations.find(
            l => l.id === context.locationId
        );

    const destination =
        context.locations.find(
            l => l.id === queue[queue.length - 1]
        );

    context.scene = {

        locationId: context.locationId,

        participantIds: [],

        narration:
            `En viaje hacia ${destination?.name}.`,

        messages: [

            {

                speakerId: "narrator",

                expression: "neutral",

                line:
                    `[Especial] Pasas por ${currentLocation?.name} ` +
                    `en dirección a tu destino.`

            }

        ],

        relationshipDeltas: {},

        trustDeltas: {},

        inventoryDeltas: [],

        goldDelta: 0,

        questUpdates: [],

        newNpc: null,

        newLocation: null,

        updateLocationImage: null,

        enterTheConversation: [],

        exitTheConversation: [],

        minutesPassed:
            context.travelMinutes,

        state: context.state

    };

    context.isTransition = true;

    return true;

}