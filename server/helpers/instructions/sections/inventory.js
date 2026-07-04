/**
 * Builds the inventory block (gold + item list).
 * @param {{ inventory: Array, gold: number }} params
 * @returns {string}
 */
export function buildInventoryContext({ inventory, gold }) {
  const lines = [
    '\n\n=== INVENTARIO DEL JUGADOR ===',
    `Oro actual del jugador: ${gold} monedas de oro.`,
    'Objetos en el Inventario:'
  ];

  if (inventory.length === 0) {
    lines.push('- (El inventario está vacío)');
  } else {
    inventory.forEach(item => {
      lines.push(`- [${item.id}]: "${item.name}" - ${item.description}`);
    });
  }

  return lines.join('\n');
}
