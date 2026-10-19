import test from 'node:test';
import assert from 'node:assert/strict';
import {createPublicationMonitor} from '../src/publication-monitor.js';
const post={id:'one',updatedAt:'2026-10-19',visibility:'unlisted',slug:'random'};
const api={url:p=>`https://example.test/posts/${p.slug}.html`,requestBuild:async()=>'retry-sha'};
test('visibility progress is deduplicated, persisted, and resumes after reloading',async()=>{
  let saved,finish,calls=0;
  const storage={getItem:()=>saved,setItem:(_key,value)=>saved=value};
  const monitor=createPublicationMonitor({client:()=>api,storage,wait:async options=>{calls++;await new Promise(resolve=>finish=resolve);options.onState({status:'pending'});return {status:'pending'};}});
  const first=monitor.watch(post,{commitSha:'change-sha'});
  assert.equal(monitor.watch(post),first);
  await Promise.resolve();
  assert.equal(monitor.get(post).status,'waiting');assert.equal(calls,1);
  finish();await first;
  const resumed=createPublicationMonitor({client:()=>api,storage,wait:async options=>{assert.equal(options.sha,'change-sha');options.onState({status:'ready',url:api.url(post)});return {status:'ready'};}});
  resumed.observe(post);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(resumed.get(post).status,'ready');
  assert.equal(resumed.get({...post,updatedAt:'later'}),undefined);
});
test('opening an older article checks readiness without requesting another build; retrying a failure requests one',async()=>{
  let builds=0;
  const client={...api,requestBuild:async()=>{builds++;return 'retry-sha';}};
  const monitor=createPublicationMonitor({client:()=>client,wait:async options=>{options.onState({status:options.sha?'ready':'failed'});return {};}});
  monitor.observe(post);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(monitor.get(post).status,'failed');assert.equal(builds,0);
  await monitor.watch(post,{deploymentPending:true});
  assert.equal(builds,1);assert.equal(monitor.get(post).status,'ready');
});
