export function validateDataConsistency(npcs, locations, events) {
  const errors = [];
  const warnings = [];

  // 1. Create lookup sets
  const npcIds = new Set(npcs.map(n => n.id));
  const locationIds = new Set(locations.map(l => l.id));
  const eventIds = new Set();

  // 2. Check NPC uniqueness and reference consistency
  const seenNpcIds = new Set();
  for (const npc of npcs) {
    if (seenNpcIds.has(npc.id)) {
      errors.push(`Duplicate NPC ID found: "${npc.id}"`);
    }
    seenNpcIds.add(npc.id);

    if (npc.locationId && !locationIds.has(npc.locationId)) {
      errors.push(`NPC "${npc.id}" has invalid locationId reference: "${npc.locationId}"`);
    }

    if (npc.routine) {
      for (const [tod, locId] of Object.entries(npc.routine)) {
        if (locId && !locationIds.has(locId)) {
          errors.push(`NPC "${npc.id}" routine for "${tod}" has invalid locationId reference: "${locId}"`);
        }
      }
    }
  }

  // 3. Check Location uniqueness
  const seenLocIds = new Set();
  for (const loc of locations) {
    if (seenLocIds.has(loc.id)) {
      errors.push(`Duplicate Location ID found: "${loc.id}"`);
    }
    seenLocIds.add(loc.id);

    if (loc.connections) {
      for (const conn of loc.connections) {
        if (!locationIds.has(conn.to)) {
          errors.push(`Location "${loc.id}" connection leads to non-existent location: "${conn.to}"`);
        }
      }
    }
  }

  // 4. Check Event uniqueness and references
  const seenEventIds = new Set();
  const setFlags = new Set();
  const requiredFlags = new Set();
  const excludedFlags = new Set();

  for (const ev of events) {
    if (seenEventIds.has(ev.id)) {
      errors.push(`Duplicate Event ID found: "${ev.id}"`);
    }
    seenEventIds.add(ev.id);

    if (ev.locationId && !locationIds.has(ev.locationId)) {
      errors.push(`Event "${ev.id}" has invalid locationId reference: "${ev.locationId}"`);
    }

    if (ev.involvedNpcs) {
      for (const npcId of ev.involvedNpcs) {
        if (!npcIds.has(npcId)) {
          errors.push(`Event "${ev.id}" references non-existent NPC: "${npcId}"`);
        }
      }
    }

    if (ev.setsFlags) {
      for (const flag of ev.setsFlags) {
        setFlags.add(flag);
      }
    }

    if (ev.requiresFlags) {
      for (const flag of ev.requiresFlags) {
        requiredFlags.add(flag);
      }
    }

    if (ev.excludesIfFlags) {
      for (const flag of ev.excludesIfFlags) {
        excludedFlags.add(flag);
      }
    }
  }

  // 5. Flag consistency check (Orphan flags)
  const checkedFlags = new Set([...requiredFlags, ...excludedFlags]);

  // Flags that are required/excluded but never set by any event
  // Ignore dynamic flags like romance_* or rumor_* or quest_*
  const isDynamicFlag = (flag) => {
    return flag.startsWith('romance_') || flag.startsWith('rumor_') || flag.startsWith('quest_') || flag.startsWith('event_');
  };

  for (const flag of checkedFlags) {
    if (!setFlags.has(flag) && !isDynamicFlag(flag)) {
      warnings.push(`Flag "${flag}" is required or excluded by some event, but is never set in events.json (could be set dynamically or missing).`);
    }
  }

  // Flags that are set but never checked
  for (const flag of setFlags) {
    if (!checkedFlags.has(flag) && !isDynamicFlag(flag)) {
      warnings.push(`Flag "${flag}" is set by some event, but is never required or excluded by any event in events.json.`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}
