function buildAssetSyncPlan(previousNpcs = [], nextNpcs = [], previousLocations = [], nextLocations = []) {
  const previousNpcIds = new Set((previousNpcs || []).map((npc) => npc.id).filter(Boolean));
  const nextNpcIds = new Set((nextNpcs || []).map((npc) => npc.id).filter(Boolean));
  const previousLocationIds = new Set((previousLocations || []).map((location) => location.id).filter(Boolean));
  const nextLocationIds = new Set((nextLocations || []).map((location) => location.id).filter(Boolean));

  return {
    addedNpcIds: [...nextNpcIds].filter((id) => !previousNpcIds.has(id)),
    addedLocationIds: [...nextLocationIds].filter((id) => !previousLocationIds.has(id))
  };
}

export { buildAssetSyncPlan };
