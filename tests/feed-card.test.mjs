import test from 'node:test';
import assert from 'node:assert/strict';
import { renderFeedCard } from '../src/feed-card.js';

test('lazy-loaded cards escape metadata and reject executable media',()=>{
  const html=renderFeedCard({slug:'safe-post',title:'<script>bad</script>',excerpt:'<img src=x onerror=bad>',cover:'javascript:bad',publishedAt:'2026-01-01',tags:['<svg onload=bad>'],minutes:1},{author:'<b>Author</b>',avatar:'javascript:bad'});
  assert.match(html,/&lt;script&gt;bad&lt;\/script&gt;/);
  assert.match(html,/&lt;img src=x onerror=bad&gt;/);
  assert.doesNotMatch(html,/<script|<img|<svg onload|javascript:/);
  assert.throws(()=>renderFeedCard({slug:'../private'}),/inválido/);
});
