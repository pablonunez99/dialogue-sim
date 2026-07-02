const registry = new Map();

export function on(phase, handlerFn) {
  if (!registry.has(phase)) {
    registry.set(phase, []);
  }
  registry.get(phase).push(handlerFn);
}

export async function fire(phase, context) {
  const handlers = registry.get(phase) || [];
  const results = [];
  for (const handler of handlers) {
    try {
      results.push(await handler(context));
    } catch (err) {
      console.error(`[TriggerBus] Handler failed on "${phase}":`, err.message, err.stack);
    }
  }
  return results;
}
