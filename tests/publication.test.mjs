import test from 'node:test';
import assert from 'node:assert/strict';
import {waitForPublication} from '../src/publication.js';
const version='2026-10-18T01:00:00.000Z';
const page=v=>`<meta name="article-version" content="${v}">`;
const base={api:{getDeploymentStatus:async()=>({status:'completed',conclusion:'success'})},sha:'sha',url:'https://writer.github.io/blog/posts/new.html',version,delay:async()=>{},attempts:3};
test('never exposes an article link until Pages serves the new version, even after Actions succeeds',async()=>{
  const states=[];let requests=0;
  const result=await waitForPublication({...base,onState:s=>states.push(s),fetchImpl:async(url,options)=>{
    assert.equal(options.cache,'no-store');assert.equal(new URL(url).searchParams.get('v'),version);
    const n=++requests;return {ok:n>1,text:async()=>page(n===2?'old-version':version)};
  }});
  assert.equal(requests,3);assert.deepEqual(states.map(s=>s.status),['waiting','waiting','ready']);
  assert.ok(states.slice(0,-1).every(s=>!s.url));assert.match(result.url,/v=/);
});
test('can verify Pages without Actions permission and retries transient failures',async()=>{
  let n=0;
  const result=await waitForPublication({...base,api:{getDeploymentStatus:async()=>{throw Error('403');}},fetchImpl:async()=>{if(!n++)throw Error('offline');return{ok:true,text:async()=>page(version)};}});
  assert.equal(result.status,'ready');
});
test('timeout and failed deployment keep the open-article link unavailable',async()=>{
  const pending=await waitForPublication({...base,fetchImpl:async()=>({ok:false})});
  assert.equal(pending.status,'pending');assert.equal(pending.url,undefined);
  const failed=await waitForPublication({...base,api:{getDeploymentStatus:async()=>({status:'completed',conclusion:'failure',url:'https://github.com/actions/1'})},fetchImpl:async()=>({ok:false})});
  assert.equal(failed.status,'failed');assert.equal(failed.url,undefined);
});
