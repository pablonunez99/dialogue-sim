import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', '..');
const probabilitiesFilePath = path.join(rootDir, 'server', 'data', 'event_probabilities.json');

export async function rollEvent() {
  try {
    const data = await readFile(probabilitiesFilePath, 'utf8');
    const config = JSON.parse(data);
    const probs = config.probabilities;
    
    // Sum all probabilities to handle any relative/absolute scales
    const sum = Object.values(probs).reduce((a, b) => a + b, 0);
    
    const roll = Math.random() * sum;
    let cumulative = 0;
    let chosenCategory = 'nada';
    
    for (const [category, prob] of Object.entries(probs)) {
      cumulative += prob;
      if (roll <= cumulative) {
        chosenCategory = category;
        break;
      }
    }
    
    if (chosenCategory === 'nada') {
      return {
        category: 'nada',
        description: 'No ocurre ningún suceso inesperado. Narra la cotidianidad tranquila de la ubicación.'
      };
    }
    
    const events = config.events_by_category[chosenCategory] || [];
    if (events.length === 0) {
      return {
        category: 'nada',
        description: 'No ocurre ningún suceso inesperado. Narra la cotidianidad tranquila de la ubicación.'
      };
    }
    
    const randomEvent = events[Math.floor(Math.random() * events.length)];
    
    const categoryTitles = {
      evento_social_menor: 'Evento Social Menor',
      clima_cambia: 'Cambio de Clima',
      rumor_chisme: 'Rumor o Chisme',
      evento_dramatic_menor: 'Evento Dramático Menor',
      evento_critico_tragico: 'Evento Crítico o Trágico',
      encuentro_inesperado: 'Encuentro Inesperado'
    };
    
    return {
      category: chosenCategory,
      title: categoryTitles[chosenCategory] || chosenCategory,
      description: randomEvent
    };
  } catch (error) {
    console.error('[EventRoller] Failed to roll event, falling back to "nada":', error);
    return {
      category: 'nada',
      description: 'No ocurre ningún suceso inesperado. Narra la cotidianidad tranquila de la ubicación.'
    };
  }
}
