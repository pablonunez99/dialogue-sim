import { validateDataConsistency } from '../../helpers/flagHelper.js';

export async function validateFlagConsistency(context) {
  const { npcsList, locationsList, currentEvents } = context;
  if (!npcsList || !locationsList || !currentEvents) return;

  console.log('[Validator] Running flag and database integrity check...');
  const result = validateDataConsistency(npcsList, locationsList, currentEvents);

  if (result.warnings.length > 0) {
    console.log(`[Validator] Flag warnings (${result.warnings.length}):`);
    result.warnings.forEach(w => console.warn(`  - [WARNING] ${w}`));
  }

  if (!result.valid) {
    console.error(`[Validator] CRITICAL database errors found (${result.errors.length}):`);
    result.errors.forEach(e => console.error(`  - [ERROR] ${e}`));
  } else {
    console.log('[Validator] Database integrity checks passed successfully.');
  }
}
