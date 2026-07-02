import { on, fire } from './triggerBus.js';
import { extractNpcActionsFromYesterday } from '../handlers/world/extractNpcActionsFromYesterday.js';
import { deprecateInvalidatedEvents } from '../handlers/world/deprecateInvalidatedEvents.js';
import { scheduleFollowupEvents } from '../handlers/world/scheduleFollowupEvents.js';
import { evaluateNpcGoalProgress } from '../handlers/world/evaluateNpcGoalProgress.js';
import { assignNpcRoutinesForDay } from '../handlers/world/assignNpcRoutinesForDay.js';
import { generateDailyQuestsForActiveNpcs } from '../handlers/world/generateDailyQuestsForActiveNpcs.js';
import { refreshNpcMemorySummary } from '../handlers/npc/refreshNpcMemorySummary.js';

export function registerDayPhaseHandlers() {
  // afterNight triggers: run when day ends, preparing statistics/logs from yesterday
  on('afterNight', extractNpcActionsFromYesterday);
  on('afterNight', deprecateInvalidatedEvents);

  // beforeMorning triggers: run at start of day, preparing the new state, schedules, and goals
  on('beforeMorning', scheduleFollowupEvents);
  on('beforeMorning', evaluateNpcGoalProgress);
  on('beforeMorning', assignNpcRoutinesForDay);

  // afterMorning triggers: run after daily setup, refreshing memory digests and quests
  on('afterMorning', generateDailyQuestsForActiveNpcs);
  on('afterMorning', refreshNpcMemorySummary);
}

export async function runDayTransition(day, context) {
  console.log(`[DayTransition] Triggering transition for Day ${day}...`);
  
  // 1. Run afterNight logic (processing yesterday's day = day - 1)
  await fire('afterNight', { ...context, day: day - 1 });
  
  // 2. Run beforeMorning logic (planning today's schedule and goals)
  await fire('beforeMorning', { ...context, day });
  
  // 3. Run afterMorning logic (refreshing daily quests and memory digests)
  await fire('afterMorning', { ...context, day });
  
  console.log(`[DayTransition] Day transition complete for Day ${day}.`);
}
