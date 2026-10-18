import test from 'node:test';
import assert from 'node:assert/strict';
import { createFeedPager } from '../src/feed-pager.js';

test('100,000 results fetch only the next 20 records, never all article bodies',async()=>{
  let fetched=0,queries=0;
  const results=Array.from({length:100000},(_,id)=>({data:async()=>{fetched++;return {id};}}));
  const pager=createFeedPager({search:async()=>{queries++;return {results};},initialCount:20,total:100000});
  assert.equal(fetched,0);assert.equal(queries,0);
  assert.deepEqual((await pager.next()).map(r=>r.id),Array.from({length:20},(_,i)=>i+20));
  assert.equal(fetched,20);assert.equal(pager.state().loaded,40);
  await pager.next();assert.equal(fetched,40);assert.equal(queries,1);
  assert.deepEqual((await pager.page(0)).map(r=>r.id),Array.from({length:20},(_,i)=>i));
  assert.equal(pager.state().loaded,60);
});
test('search consults the entire index, including a result outside loaded pages',async()=>{
  const pager=createFeedPager({search:async(query,order)=>{assert.equal(query,'hidden term');assert.equal(order,'oldest');return {results:[{data:async()=>({id:99999})}]};}});
  assert.deepEqual(await pager.reset('hidden term','oldest'),[{id:99999}]);
  assert.deepEqual(pager.state(),{count:1,loaded:1,more:false,busy:false});
});
test('empty results finish cleanly and failed batches retry without skipping records',async()=>{
  let fail=true;
  const pager=createFeedPager({total:1,search:async()=>({results:[{data:async()=>{if(fail)throw Error('offline');return {id:1};}}]})});
  await assert.rejects(pager.next(),/offline/);assert.equal(pager.state().loaded,0);
  fail=false;assert.deepEqual(await pager.next(),[{id:1}]);
  const empty=createFeedPager({search:async()=>({results:[]})});
  assert.deepEqual(await empty.reset('missing'),[]);assert.equal(empty.state().more,false);
});
test('newer searches win and overlapping scroll events do not duplicate pages',async()=>{
  let release;
  const slow=new Promise(resolve=>release=resolve);
  const pager=createFeedPager({search:async query=>query==='old'?slow:{results:[{data:async()=>({id:'new'})}]}});
  const stale=pager.reset('old');
  assert.equal(await pager.next(),null);
  assert.deepEqual(await pager.reset('new'),[{id:'new'}]);
  release({results:[{data:async()=>({id:'old'})}]});
  assert.equal(await stale,null);assert.equal(pager.state().loaded,1);
});
