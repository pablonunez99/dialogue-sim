import { buildTimeContext }         from './sections/time.js';
import { buildInventoryContext }    from './sections/inventory.js';
import { buildQuestContext }        from './sections/quests.js';
import { buildRelationshipContext } from './sections/relationships.js';
import { buildRumorContext }        from './sections/rumors.js';
import { buildMapContext }          from './sections/map.js';
import { buildTravelContext }       from './sections/travel.js';
import { buildEventContext }        from './sections/events.js';
import { buildPrompt }              from './promptTemplate.js';

/**
 * Builds the complete system instruction string for the AI model.
 *
 * @param {{
 *   location: object,
 *   participants: Array,
 *   currentNpcs: Array,
 *   currentLocations: Array,
 *   ragContext?: string,
 *   activeEvent?: object|null,
 *   state?: object,
 *   travelMinutes?: number,
 *   unexpectedEventNote?: string
 * }} params
 * @returns {string}
 */
export function buildInstructions({
  location,
  participants,
  currentNpcs,
  currentLocations,
  ragContext        = '',
  activeEvent       = null,
  state             = {},
  travelMinutes     = 0,
  unexpectedEventNote = ''
}) {
  // ── Normalize state ──────────────────────────────────────────────────────
  const inventory    = Array.isArray(state?.inventory)  ? state.inventory  : [];
  const gold         = typeof state?.gold === 'number'  ? state.gold       : 0;
  const quests       = Array.isArray(state?.quests)     ? state.quests     : [];
  const day          = typeof state?.day  === 'number'  ? state.day        : 1;
  const time         = typeof state?.time === 'string'  ? state.time       : '08:00';
  const timeOfDay    = typeof state?.timeOfDay === 'string' ? state.timeOfDay : 'mañana';
  const relationships = state?.relationships || {};
  const trust        = state?.trust         || {};
  const flags        = state?.flags         || [];
  const travelQueue  = Array.isArray(state?.travelQueue) ? state.travelQueue : [];

  // ── Build each context section independently ─────────────────────────────
  const timeContext         = buildTimeContext({ day, time, timeOfDay });
  const inventoryContext    = buildInventoryContext({ inventory, gold });
  const questContext        = buildQuestContext({ quests, currentNpcs });
  const relationshipContext = buildRelationshipContext({ currentNpcs, relationships, trust, flags });
  const rumorContext        = buildRumorContext({ participants, currentNpcs, relationships, flags });
  const mapContext          = buildMapContext({ currentLocations });
  const travelContext       = buildTravelContext({ travelMinutes, travelQueue, currentLocations, locationName: location.name });
  const eventContext        = buildEventContext({ activeEvent });

  // ── Assemble final prompt ────────────────────────────────────────────────
  return buildPrompt({
    location,
    participants,
    currentNpcs,
    currentLocations,
    ragContext,
    timeContext,
    inventoryContext,
    questContext,
    relationshipContext,
    rumorContext,
    mapContext,
    travelContext,
    eventContext
  });
}
