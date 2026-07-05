// conversation/context/conversationContext.js

import {
    loadHistory,
    loadLocations,
    loadNpcs,
    loadEvents
} from "../../../data/repository.js";

export class ConversationContext {

    constructor() {
        this.request = null;
        this.history = [];
        this.events = [];
        this.locations = [];
        this.npcs = [];
        this.locationId = null;
        this.participantIds = [];
        this.playerText = "";
        this.provider = null;
        this.state = {};
        this.travelMinutes = 0;
        this.activeEvent = null;
        this.scene = null;
        this.twist = null;
        this.unexpectedEventNote = "";
        
    }

    static async create(body) {
        const context = new ConversationContext();
        context.request = body;
        context.history = await loadHistory();
        context.locations = await loadLocations();
        context.npcs = await loadNpcs();
        context.events = await loadEvents();
        context.locationId = body.locationId;
        context.participantIds = body.participantIds ?? [];
        context.playerText = body.playerText ?? "";
        context.provider = body.provider;
        context.state = buildInitialState(body);

        return context;
    }

    appendHistory(entry) {
        this.history.push(entry);
    }
}

export function buildInitialState(body) {
    const state = body.state ?? {};
    return {
        locationId:
            state.locationId || body.locationId,
        relationships:
            state.relationships || {},
        trust:
            state.trust || {},
        day:
            typeof state.day === "number"
                ? state.day
                : 1,
        time:
            state.time || "08:00",
        flags:
            state.flags || [],
        completedEvents:
            state.completedEvents || [],
        inventory:
            state.inventory || [],
        gold:
            state.gold || 0,
        quests:
            state.quests || [],
        npcActivityLog:
            state.npcActivityLog || []
    };
}