import { getWeatherForDay } from '../utils.js';

/**
 * Builds the temporal and weather context block.
 * @param {{ day: number, time: string, timeOfDay: string }} params
 * @returns {string}
 */
export function buildTimeContext({ day, time, timeOfDay }) {
  const weather = getWeatherForDay(day);
  return [
    '\n\n=== CONTEXTO TEMPORAL Y CLIMÁTICO (CRÍTICO) ===',
    `- Día de la simulación: ${day}`,
    `- Hora actual del día: ${time} (${timeOfDay})`,
    `- Clima en la aldea: ${weather}`,
    'INSTRUCCIÓN: El DM y los personajes deben ser plenamente conscientes de la hora del día (ej: si es de noche, las calles estarán oscuras, frías o vacías, los personajes tendrán sueño o buscarán abrigo, etc.) y del clima actual en sus descripciones narrativas y diálogos.'
  ].join('\n');
}
