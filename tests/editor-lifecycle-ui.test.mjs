import test from 'node:test';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import assert from 'node:assert/strict';
test('editor recovers cloud edits and requires withdrawing publication before editing or republishing',async()=>{
const bundled=await build({entryPoints:['src/main.js'],bundle:true,format:'iife',write:false,loader:{'.css':'empty'},logLevel:'silent'});
const post={id:'published-qa',slug:'flow',title:'Artículo de prueba',markdown:'Versión pública',html:'<p>Versión pública</p>',status:'published',updatedAt:'2026-10-18T10:00:00Z'};
const cloud={...post,title:'Versión editada recuperada',html:'<p>Cambios en la nube</p>',markdown:'Cambios en la nube',status:'draft',originalStatus:'published',updatedAt:'2026-10-18T11:00:00Z',privateSavedAt:'2026-10-18T11:01:00Z'};
let published=post,storedCloud=cloud,failDeletion=false;
const dom=new JSDOM('<!doctype html><div id="app"></div>',{url:'http://localhost/editor.html',runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window;
w.structuredClone=structuredClone;w.matchMedia=()=>({matches:false,addEventListener(){}});w.ResizeObserver=class{observe(){}disconnect(){}};w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
w.localStorage.setItem('blog-studio-token-v2:/','local-test-only');w.localStorage.setItem('blog-studio-drafts-v1',JSON.stringify([post,{id:"other-draft",title:"Otro borrador",html:"<p>Conservar</p>",markdown:"Conservar",status:"draft"}]));
const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64');const calls=[];
w.fetch=async(url,options={})=>{url=String(url);calls.push({url,method:options.method||'GET'});let data=null;
 if(url.endsWith('/blog-drafts'))data={private:true,permissions:{push:true}};
 else if(url.includes('/blog-drafts/contents/drafts?'))data=storedCloud?[{type:'file',name:'published-qa.json'}]:[];
 else if(url.includes('/blog-drafts/contents/drafts/published-qa.json')){if(options.method==='PUT'){storedCloud=JSON.parse(Buffer.from(JSON.parse(options.body).content,'base64'));data={commit:{sha:'cloud-commit'}};}else data=storedCloud?{sha:'cloud-sha',content:encode(storedCloud)}:null;}
 else if(url.includes('/contents/posts?'))data=published?[{type:'file',name:'flow.json'}]:[];
 else if(url.includes('/contents/posts/flow.json')){if(options.method==='DELETE'){if(failDeletion)return {ok:false,status:500,json:async()=>({message:'Temporary failure'})};published=null;data={commit:{sha:'removed'}};}else if(options.method==='PUT'){published=JSON.parse(Buffer.from(JSON.parse(options.body).content,'base64'));data={commit:{sha:'published'}};}else data=published?{type:'file',sha:'public-sha',content:encode(published)}:null;}
 else if(url.includes('/actions/runs'))data={workflow_runs:[{status:'completed',conclusion:'success'}]};
 return {ok:data!==null,status:data===null?404:200,json:async()=>data};
};
w.eval(bundled.outputFiles[0].text);
const wait=async(fn)=>{for(let n=0;n<100;n++){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw Error('UI timeout: '+w.document.body.textContent.slice(0,500));};
const click=async(selector)=>{const el=w.document.querySelector(selector);assert.ok(el,selector);el.click();await new Promise(r=>setTimeout(r,5));};
await wait(()=>w.document.querySelector('[data-private="published-qa"]'));
assert.equal(w.document.querySelector('#article-title').readOnly,true);
await click('[data-action="panel-published"]');await wait(()=>w.document.querySelector('[data-published="0"]'));
await click('[data-published="0"]');assert.equal(w.document.querySelector('#article-title').value,post.title);assert.equal(w.document.querySelector('.toolbar').hidden,true);
await click('[data-action="panel-drafts"]');await wait(()=>w.document.querySelector('[data-private="published-qa"]'));
await click('[data-private="published-qa"]');await click('#dialog-form [type="submit"]');
assert.equal(w.document.querySelector('#article-title').value,cloud.title);assert.equal(w.document.querySelector('#article-title').readOnly,true);
await click('.header-actions [data-action="unpublish"]');await click('#dialog-form [type="submit"]');
await wait(()=>!w.document.querySelector('#article-title').readOnly);
assert.equal(published,null);assert.equal(w.document.querySelector('#article-title').value,cloud.title);assert.equal(w.document.querySelector('.toolbar').hidden,false);
await click('[data-action="more"]');await click('[data-action="save-private"]');await click('#dialog-form [type="submit"]');
await wait(()=>storedCloud.originalStatus==='draft');assert.equal(storedCloud.title,cloud.title);
assert.match(w.document.querySelector('#articles-list').textContent,/en la nube/);
await click('.header-actions [data-action="publish"]');await click('#dialog-form [type="submit"]');
await wait(()=>published?.status==='published'&&w.document.querySelector('#article-title').readOnly);
assert.equal(published.title,cloud.title);assert.equal(w.document.querySelector('.toolbar').hidden,true);
await click('[data-action="panel-drafts"]');await wait(()=>!w.document.querySelector('[data-private="published-qa"]'));
assert.equal(w.document.querySelector('[data-draft="published-qa"]'),null);
assert.ok(calls.some(call=>call.method==='DELETE'));assert.ok(calls.filter(call=>call.method==='PUT').length>=2);

// Reopen the public snapshot, as a real tab click does. It contains no cloud
// token; the editor must recover that token from its private local metadata.
await click('[data-action="panel-published"]');await wait(()=>w.document.querySelector('[data-published="0"]'));
await click('[data-published="0"]');
assert.equal(w.document.querySelector('.header-actions .primary').textContent,'Mover a borradores');
await click('.header-actions [data-action="unpublish"]');await click('#dialog-form [type="submit"]');
await wait(()=>!w.document.querySelector('#article-title').readOnly);
const editedTitle=w.document.querySelector('#article-title');editedTitle.value='Segundo ciclo de edición';editedTitle.dispatchEvent(new w.Event('input',{bubbles:true}));
await click('[data-action="more"]');await click('[data-action="save-private"]');await click('#dialog-form [type="submit"]');
await wait(()=>storedCloud.title==='Segundo ciclo de edición');
assert.equal(w.document.querySelector('#modal').open,false);
assert.match(w.document.querySelector('#articles-list').textContent,/en la nube/);
assert.equal(published,null);
assert.equal(JSON.parse(w.localStorage.getItem('blog-studio-drafts-v1')).find(d=>d.id==='published-qa').privateSavedAt,storedCloud.privateSavedAt);
// Published deletion is explicit, cancellable, and preserves the cloud copy.
await click('.header-actions [data-action="publish"]');await click('#dialog-form [type="submit"]');
await wait(()=>published?.status==='published'&&w.document.querySelector('#article-title').readOnly);
await click('[data-action="more"]');
assert.equal(w.document.querySelector('[data-action="delete"]'),null);
assert.ok(w.document.querySelector('[data-action="delete-published"] svg'));
const deletesBefore=calls.filter(call=>call.method==='DELETE').length;
await click('[data-action="delete-published"]');
assert.equal(w.document.querySelector('#dialog-form [type="submit"]').textContent,'Eliminar artículo');
assert.ok(w.document.querySelector('#dialog-form [type="submit"]').classList.contains('danger'));
assert.equal(calls.filter(call=>call.method==='DELETE').length,deletesBefore);
await click('#modal [data-action="close"]');assert.ok(published);
await click('[data-action="more"]');await click('[data-action="delete-published"]');
failDeletion=true;await click('#dialog-form [type="submit"]');
await wait(()=>w.document.querySelector('#dialog-form [type="submit"]')?.disabled===false);
assert.ok(published);assert.equal(w.document.querySelector('#article-title').readOnly,true);
assert.ok(JSON.parse(w.localStorage.getItem('blog-studio-drafts-v1')).some(d=>d.status==='published'));
failDeletion=false;await click('#dialog-form [type="submit"]');
await wait(()=>published===null&&!w.document.querySelector('#modal').open);
assert.equal(w.document.querySelector('#article-title').readOnly,false);
assert.equal(w.document.querySelector('[data-published]'),null);
assert.ok(storedCloud,'Deleting the public article must preserve the separate cloud draft');
assert.ok(JSON.parse(w.localStorage.getItem('blog-studio-drafts-v1')).some(d=>d.id==='other-draft'),'Other local drafts must be preserved');
w.dispatchEvent(new w.Event('beforeunload'));
assert.equal(JSON.parse(w.localStorage.getItem('blog-studio-drafts-v1')).some(d=>d.id===post.id&&d.status==='published'),false);
dom.window.close();
});

