import { on, fire } from './triggerBus.js';
import { extractNpcActionsFromYesterday } from '../handlers/world/extractNpcActionsFromYesterday.js';
import { deprecateInvalidatedEvents } from '../handlers/world/deprecateInvalidatedEvents.js';
import { scheduleFollowupEvents } from '../handlers/world/scheduleFollowupEvents.js';
import { evaluateNpcGoalProgress } from '../handlers/world/evaluateNpcGoalProgress.js';
import { assignNpcRoutinesForDay } from '../handlers/world/assignNpcRoutinesForDay.js';
import { generateDailyQuestsForActiveNpcs } from '../handlers/world/generateDailyQuestsForActiveNpcs.js';
import { refreshNpcMemorySummary } from '../handlers/npc/refreshNpcMemorySummary.js';
import { pruneOrphanMemories } from '../handlers/memory/pruneOrphanMemories.js';
import { validateFlagConsistency } from '../handlers/npc/validateFlagConsistency.js';

export function registerDayPhaseHandlers() {
  // afterNight triggers: run when day ends, preparing statistics/logs from yesterday
  on('afterNight', extractNpcActionsFromYesterday);
  on('afterNight', deprecateInvalidatedEvents);
  on('afterNight', pruneOrphanMemories);
  on('afterNight', evaluateNpcGoalProgress);

  // beforeMorning triggers: run at start of day, preparing the new state, schedules, and goals
  on('beforeMorning', scheduleFollowupEvents);
  on('beforeMorning', assignNpcRoutinesForDay);
  on('beforeMorning', validateFlagConsistency);
  on('beforeMorning', generateDailyQuestsForActiveNpcs);
  on('beforeMorning', refreshNpcMemorySummary);

  // afterMorning, beforeAfternoon, afterAfternoon, beforeNight: 
  // Fired during time of day transitions, ready for future content handlers.
}

export async function runDayTransition(day, context) {
  console.log(`[DayTransition] Triggering transition for Day ${day}...`);
  // 2. Run beforeMorning logic (planning today's schedule, goals, and quests)
  await fire('beforeMorning', { ...context, day });
  
  console.log(`[DayTransition] Day transition complete for Day ${day}.`);
}

export async function handleTimeOfDayTransition(oldTOD, newTOD, context) {
  if (oldTOD === newTOD) return;
  console.log(`[TimeTransition] Transitioning from "${oldTOD}" to "${newTOD}"...`);
  
  if (oldTOD === 'mañana' && newTOD === 'tarde') {
    await fire('afterMorning', context);
    await fire('beforeAfternoon', context);
  } else if (oldTOD === 'tarde' && newTOD === 'noche') {
    await fire('afterAfternoon', context);
    await fire('beforeNight', context);
  }
}

export async function triggerTimeOfDayTransitionIfNeeded(oldTOD, newTOD, inputState, history, activeConversationManager, db) {
  if (oldTOD === newTOD) return;
  
  console.log(`[TimeTransition] Time of day transitioned from "${oldTOD}" to "${newTOD}". Running mid-day phase triggers...`);
  try {
    const npcsList = await db.loadNpcs();
    const locationsList = await db.loadLocations();
    const currentEvents = await db.loadEvents();
    
    const pending = { quests: [], npcActions: [], npcUpdates: [] };
    const context = {
      manager: activeConversationManager,
      day: inputState.day,
      history,
      state: inputState,
      npcsList,
      locationsList,
      currentEvents,
      db,
      pending
    };

    await handleTimeOfDayTransition(oldTOD, newTOD, context);
    await db.savePendingUpdates(pending);
  } catch (err) {
    console.error('[TimeTransition] Mid-day transition triggers failed:', err.message);
  }
}
