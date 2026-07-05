import { findPath, CONNECTIONS } from "../../../data/repository.js";
import { addMinutesToTime } from "../../../world/time.js";

export async function resolve(context) {

    const state = context.state;

    let locationId = context.locationId;

    let queue = Array.isArray(state.travelQueue)
        ? [...state.travelQueue]
        : [];

    const previousLocation =
        state.locationId || locationId;

    let travelMinutes = 0;
    let hasTraveled = false;

    //------------------------------------------------------
    // Inicio de un viaje largo
    //------------------------------------------------------

    const manualTravel =
        locationId !== state.locationId &&
        (
            queue.length === 0 ||
            queue[0] !== locationId
        );

    if (manualTravel) {

        const path =
            findPath(previousLocation, locationId);

        if (path && path.length > 2) {

            locationId = path[1];

            queue = path.slice(2);

            console.log(
                `[JourneyEngine] Starting journey: ${path.join(" -> ")}`
            );

        } else {

            queue = [];

        }

    }

    //------------------------------------------------------
    // Viaje por cola
    //------------------------------------------------------

    if (queue.length > 0) {

        const nextLocation = queue.shift();

        travelMinutes =
            getTravelMinutes(
                previousLocation,
                nextLocation
            );

        advanceTime(state, travelMinutes);

        state.locationId = nextLocation;

        locationId = nextLocation;

        hasTraveled = true;

        console.log(
            `[JourneyEngine] Step ${previousLocation} -> ${nextLocation}`
        );

    }

    //------------------------------------------------------
    // Viaje simple
    //------------------------------------------------------

    else if (previousLocation !== locationId) {

        travelMinutes =
            getTravelMinutes(
                previousLocation,
                locationId
            );

        advanceTime(state, travelMinutes);

        state.locationId = locationId;

        hasTraveled = true;

        console.log(
            `[TravelEngine] ${previousLocation} -> ${locationId}`
        );

    }

    state.travelQueue = queue;

    context.locationId = locationId;

    context.travelMinutes = travelMinutes;

    context.hasTraveled = hasTraveled;

}
function getTravelMinutes(from, to) {

    const connection =
        (CONNECTIONS[from] || [])
            .find(c => c.to === to);

    return connection
        ? connection.distance
        : 5;

}

function advanceTime(state, minutes) {

    const result =
        addMinutesToTime(
            state.day,
            state.time,
            minutes
        );

    state.day = result.day;

    state.time = result.time;

}