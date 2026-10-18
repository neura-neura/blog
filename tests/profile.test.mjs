import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProfile, initProfile } from '../src/profile.js';

function browser() {
  const storage = new Map();
  const listeners = {};
  const nodes = ['author','author','bio','handle','initial'].map(field => ({dataset:{profile:field},textContent:''}));
  const win = { location:{href:'https://example.test/blog/editor.html'}, document:{querySelectorAll:()=>nodes,querySelector:()=>null},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)}, addEventListener:(name,fn)=>listeners[name]=fn,fetch:async()=>({ok:false}) };
  return {win,storage,listeners,nodes};
}
test('profile allows only public fields and normalizes names and handles', () => {
  assert.deepEqual(normalizeProfile({author:'  Zoë 林 ',handle:'@@writer',bio:' ',owner:'private-owner',token:'secret'}),{author:'Zoë 林',handle:'writer',bio:'',updatedAt:''});
  assert.equal(normalizeProfile(null).author,'Mi blog');
});
test('profile updates every bound field, persists and synchronizes other open tabs', async () => {
  const b=browser();
  const controller=initProfile({win:b.win});await controller.ready;
  const value=controller.set({author:'Álvaro',bio:'Mi presentación',handle:'@alvaro'});
  assert.deepEqual(b.nodes.map(n=>n.textContent),['Álvaro','Álvaro','Mi presentación','alvaro','Á']);
  const second=initProfile({win:b.win});await second.ready;
  assert.equal(second.get().author,'Álvaro');
  controller.set({author:'林夏',bio:'',handle:'lin'});
  b.listeners.storage({key:'blog-studio-profile-v1:/blog/'});
  assert.equal(second.get().author,'林夏');assert.equal(second.get().bio,'');
  assert.equal(controller.pending(),true);
  controller.markPublished(value);assert.equal(controller.pending(),true,'old save cannot acknowledge a newer edit');
  controller.markPublished(controller.get());assert.equal(controller.pending(),false);
});
test('remote profile loads on a clean device and cannot overwrite pending or newer edits', async () => {
  const b=browser();let remote={author:'Publicado',bio:'Bio',handle:'public',updatedAt:'2025-01-01T00:00:00Z'};
  const fetchImpl=async url=>{assert.equal(url,'https://example.test/blog/profile.json');return {ok:true,json:async()=>remote};};
  const controller=initProfile({win:b.win,fetchImpl});await controller.ready;
  assert.equal(controller.get().author,'Publicado');assert.equal(controller.pending(),false);
  const local=controller.set({author:'Nuevo',bio:'',handle:'new'});
  await controller.refresh();assert.equal(controller.get().author,'Nuevo');
  controller.markPublished(local);await controller.refresh();assert.equal(controller.get().author,'Nuevo');
  remote={...remote,author:'Otro dispositivo',updatedAt:'2099-01-01T00:00:00Z'};
  await controller.refresh();assert.equal(controller.get().author,'Otro dispositivo');
});
test('late initial requests never undo an edit and legacy settings migrate once', async () => {
  const b=browser();let resolve;
  const controller=initProfile({win:b.win,legacy:{author:'Anterior',handle:'old'},fetchImpl:()=>new Promise(r=>resolve=r)});
  controller.set({author:'Actual',handle:'new'});
  resolve({ok:true,json:async()=>({author:'Remoto'})});await controller.ready;
  assert.equal(controller.get().author,'Actual');
  const restored=initProfile({win:b.win,legacy:{author:'Obsoleto'}});await restored.ready;
  assert.equal(restored.get().author,'Actual');
});
