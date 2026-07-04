import test from 'node:test';
import assert from 'node:assert/strict';
import { getLocationImagePrompt, buildLocationImageContent } from './image-prompt.js';

test('getLocationImagePrompt uses edit wording when requested', () => {
  const prompt = getLocationImagePrompt('a castle', true);
  assert.match(prompt, /Edit this existing background image/i);
  assert.match(prompt, /a castle/i);
});

test('buildLocationImageContent includes inline image data when provided', () => {
  const parts = buildLocationImageContent('prompt', 'abc123');
  assert.equal(parts.length, 2);
  assert.equal(parts[0].text, 'prompt');
  assert.deepEqual(parts[1].inlineData, { mimeType: 'image/png', data: 'abc123' });
});
