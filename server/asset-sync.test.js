import test from 'node:test';
import assert from 'node:assert/strict';

import { buildAssetSyncPlan } from './asset-sync.js';

test('buildAssetSyncPlan detects newly added NPCs and locations', () => {
  const previousNpcs = [{ id: 'alcaldesa' }];
  const nextNpcs = [{ id: 'alcaldesa' }, { id: 'curandera' }];
  const previousLocations = [{ id: 'plaza' }];
  const nextLocations = [{ id: 'plaza' }, { id: 'molino' }];

  const plan = buildAssetSyncPlan(previousNpcs, nextNpcs, previousLocations, nextLocations);

  assert.deepEqual(plan.addedNpcIds, ['curandera']);
  assert.deepEqual(plan.addedLocationIds, ['molino']);
});
