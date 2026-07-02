import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDataConsistency } from '../server/helpers/flagHelper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

async function main() {
  const npcsPath = path.join(rootDir, 'server', 'data', 'npcs.json');
  const locationsPath = path.join(rootDir, 'server', 'data', 'locations.json');
  const eventsPath = path.join(rootDir, 'server', 'data', 'events.json');

  try {
    const npcs = JSON.parse(await readFile(npcsPath, 'utf8'));
    const locations = JSON.parse(await readFile(locationsPath, 'utf8'));
    const events = JSON.parse(await readFile(eventsPath, 'utf8'));

    const result = validateDataConsistency(npcs, locations, events);

    if (result.warnings.length > 0) {
      console.log('--- DATABASE WARNINGS ---');
      result.warnings.forEach(w => console.warn(`[WARNING] ${w}`));
      console.log('');
    }

    if (!result.valid) {
      console.error('--- DATABASE ERRORS FOUND ---');
      result.errors.forEach(e => console.error(`[ERROR] ${e}`));
      process.exit(1);
    } else {
      console.log('Database consistency checks passed successfully!');
    }
  } catch (err) {
    console.error('Failed to run database validation:', err.message);
    process.exit(1);
  }
}

main();
