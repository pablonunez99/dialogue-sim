// Utilidades de tiempo y clima del mundo de juego

export function getWeatherForDay(day) {
  const weathers = [
    'soleado y cálido con una brisa ligera',
    'nublado y fresco con neblina matutina en las zonas bajas',
    'lluvioso con ráfagas de viento frío y nubes densas',
    'tormentoso con truenos distantes y lluvias torrenciales',
    'fresco y despejado con un sol brillante pero viento del norte',
    'húmedo y templado con llovizna intermitente',
    'despejado y caluroso, ideal para trabajar al aire libre'
  ];
  return weathers[(day - 1) % weathers.length];
}

export function getTimeOfDay(timeStr) {
  const [hourStr] = timeStr.split(':');
  const hour = parseInt(hourStr, 10);
  if (hour >= 6 && hour <= 12) {
    return 'mañana';
  } else if (hour >= 13 && hour <= 18) {
    return 'tarde';
  } else {
    return 'noche';
  }
}

export function addMinutesToTime(day, timeStr, minutesToAdd) {
  const [hourStr, minStr] = timeStr.split(':');
  let hour = parseInt(hourStr, 10);
  let min = parseInt(minStr, 10);

  min += minutesToAdd;
  const extraHours = Math.floor(min / 60);
  min = min % 60;

  hour += extraHours;
  const extraDays = Math.floor(hour / 24);
  hour = hour % 24;

  const newDay = day + extraDays;
  const newTimeStr = `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;

  return { day: newDay, time: newTimeStr };
}
