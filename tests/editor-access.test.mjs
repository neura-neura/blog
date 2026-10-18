import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mountEditorAccess} from '../src/editor-access.js';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function setup(token,verifyAccess,loadEditor){const dom=new JSDOM('<div id="app"></div>');const app=dom.window.document.querySelector('#app');const tokens={get:()=>token,set:value=>{token=value;}};const access=mountEditorAccess({app,tokens,verifyAccess,loadEditor});return {app,access,dom};}
test('saved-token reload never displays login during verification or editor import',async()=>{
 const verification=deferred(),loading=deferred();const {app}=setup('saved-token',()=>verification.promise,()=>loading.promise);
 assert.equal(app.querySelector('.editor-login').hidden,true);assert.equal(app.querySelector('.editor-loading').hidden,false);
 verification.resolve();await flush();assert.equal(app.querySelector('.editor-login').hidden,true);
 loading.resolve();await flush();assert.equal(app.querySelector('.editor-login').hidden,true);
});
test('visitors without a token see login; rejected saved credentials expose the form and error',async()=>{
 let calls=0;const first=setup('',()=>{calls++;},async()=>{});assert.equal(calls,0);assert.equal(first.app.querySelector('.editor-login').hidden,false);
 const verification=deferred();const second=setup('expired',()=>verification.promise,async()=>{});verification.reject(Error('Acceso caducado'));await flush();assert.equal(second.app.querySelector('.editor-login').hidden,false);assert.equal(second.app.querySelector('#login-error').textContent,'Acceso caducado');assert.equal(second.app.querySelector('.editor-loading').hidden,true);
});
