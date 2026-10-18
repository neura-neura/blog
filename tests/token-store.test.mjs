import test from 'node:test';
import assert from 'node:assert/strict';
import {initTokenStore} from '../src/token-store.js';

function browser(shared=new Map(),legacy=null,path='/blog/editor.html'){
  const listeners={};const session=new Map(legacy?[['blog-studio-token',legacy]]:[]);
  const adapter=map=>({getItem:key=>map.has(key)?map.get(key):null,setItem:(key,v)=>map.set(key,v),removeItem:key=>map.delete(key)});
  return {win:{location:{href:`https://example.test${path}`},localStorage:adapter(shared),sessionStorage:adapter(session),addEventListener:(event,fn)=>listeners[event]=fn},listeners,shared,session};
}
test('saved token is restored in a new tab and after browser restart without session storage',()=>{
  const first=browser();const one=initTokenStore({win:first.win});one.set(' test-only-token ');
  const newTab=browser(first.shared);assert.equal(initTokenStore({win:newTab.win}).get(),'test-only-token');
  const restarted=browser(new Map(first.shared));assert.equal(initTokenStore({win:restarted.win}).get(),'test-only-token');
});

test('Pages rename migrates the existing token once without restoring it after logout',()=>{
  const first=browser();first.shared.set('blog-studio-token-v2:/blog-studio/','existing-test-token');
  const store=initTokenStore({win:first.win});assert.equal(store.get(),'existing-test-token');
  store.set('');
  assert.equal(initTokenStore({win:browser(first.shared).win}).get(),'');
});
test('legacy session migrates once and disconnect prevents resurrection from other tabs',()=>{
  const first=browser(new Map(),'legacy-test-token');const one=initTokenStore({win:first.win});
  assert.equal(one.get(),'legacy-test-token');assert.equal(first.session.size,0);
  const oldTab=browser(first.shared,'old-session-token');let change;
  const two=initTokenStore({win:oldTab.win,onChange:value=>change=value});assert.equal(two.get(),'legacy-test-token');
  one.set('');oldTab.listeners.storage({key:'blog-studio-token-v2:/blog/'});
  assert.equal(two.get(),'');assert.equal(change,'');
  assert.equal(initTokenStore({win:browser(first.shared,'stale-session-token').win}).get(),'');
});
test('connecting and disconnecting synchronize open tabs, while other sites are isolated',()=>{
  const first=browser();const one=initTokenStore({win:first.win});const second=browser(first.shared);let last;
  const two=initTokenStore({win:second.win,onChange:v=>last=v});one.set('test-token');
  second.listeners.storage({key:'blog-studio-token-v2:/blog/'});assert.equal(two.get(),'test-token');assert.equal(last,'test-token');
  assert.equal(initTokenStore({win:browser(first.shared,null,'/another/editor.html').win}).get(),'');
  first.shared.clear();second.listeners.storage({key:null});assert.equal(two.get(),'');
});
test('blocked persistence reports failure without claiming the token was saved',()=>{
  const first=browser();const one=initTokenStore({win:first.win});first.win.localStorage.setItem=()=>{throw Error('blocked');};
  assert.throws(()=>one.set('test-token'),/no permite guardar/);assert.equal(one.get(),'');
});
