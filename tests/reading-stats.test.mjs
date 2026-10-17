import test from 'node:test';
import assert from 'node:assert/strict';
import { readingStats } from '../src/reading-stats.js';

test('empty content and punctuation do not claim a minute of reading', () => {
  assert.deepEqual(readingStats(' \n … — 😀'), { words: 0, minutes: 0 });
});
test('reading time crosses a minute only when the next word is added', () => {
  for (const [words,minutes] of [[1,1],[220,1],[221,2],[440,2],[441,3]]) {
    assert.deepEqual(readingStats(Array(words).fill('palabra').join(' ')), { words, minutes });
  }
});
test('counts accented words and punctuation without counting emoji', () => {
  assert.deepEqual(readingStats('¡Qué alegría! Escribir… pensar—compartir. 🌸'), { words: 5, minutes: 1 });
});
