import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProfile, initProfile, profileBannerUrl, applyProfileDOM } from '../src/profile.js';

function browser() {
  const storage = new Map();
  const listeners = {};
  const nodes = ['author','author','bio','handle','initial'].map(field => ({dataset:{profile:field},textContent:''}));
  const win = { location:{href:'https://example.test/blog/editor.html'}, document:{querySelectorAll:selector=>selector==='[data-profile]'?nodes:[],querySelector:()=>null},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)}, addEventListener:(name,fn)=>listeners[name]=fn,fetch:async()=>({ok:false}) };
  return {win,storage,listeners,nodes};
}
test('profile allows only public fields and normalizes names and handles', () => {
  assert.deepEqual(normalizeProfile({author:'  Zoë 林 ',handle:'@@writer',bio:' ',owner:'private-owner',token:'secret'}),{author:'Zoë 林',handle:'writer',bio:'',banner:'',avatar:'',website:'',updatedAt:''});
  assert.equal(normalizeProfile(null).author,'Mi blog');
});

test('Pages rename preserves pending profile edits from the previous path',async()=>{
  const b=browser();const get=b.win.localStorage.getItem;b.win.localStorage.getItem=k=>get(k)??null;
  b.storage.set('blog-studio-profile-v1:/blog-studio/',JSON.stringify({profile:{author:'Existing author',bio:'Pending edits'},pending:true}));
  const profile=initProfile({win:b.win});await profile.ready;
  assert.equal(profile.get().author,'Existing author');assert.equal(profile.pending(),true);
});

test('profile banner accepts safe images, rejects unsafe URLs and persists removal',async()=>{
  const image='data:image/webp;base64,UklGRg==';
  assert.equal(profileBannerUrl(image),image);
  for(const url of ['javascript:alert(1)','data:image/svg+xml;base64,PHN2Zz4=','http://example.test/image.png',null,'data:image/webp;base64,'+'a'.repeat(4*1024*1024)])assert.equal(profileBannerUrl(url),'');
  const b=browser();const controller=initProfile({win:b.win});await controller.ready;
  controller.set({author:'Ada',banner:image});
  assert.equal(initProfile({win:b.win}).get().banner,image);
  controller.set({...controller.get(),banner:''});
  assert.equal(initProfile({win:b.win}).get().banner,'');
});

test('profile changes replace or remove only the blog banner',()=>{
  const banner={children:[],replaceChildren(...nodes){this.children=nodes;}};
  const doc={querySelectorAll:selector=>selector==='[data-profile-banner]'?[banner]:[],querySelector:()=>null,createElement:()=>({})};
  applyProfileDOM(doc,{author:'Ada',banner:'https://example.test/banner.webp'});
  assert.equal(banner.children[0].src,'https://example.test/banner.webp');
  assert.equal(banner.children[0].width/banner.children[0].height,3);
  applyProfileDOM(doc,{author:'Ada',banner:''});assert.equal(banner.children.length,0);
});

test('profile avatar persists independently from the banner and rejects unsafe files',async()=>{
  const b=browser();b.win.document.createElement=()=>({});
  for(const node of b.nodes)node.replaceChildren=function(...children){this.children=children;};
  const controller=initProfile({win:b.win});await controller.ready;
  const image='data:image/webp;base64,UklGRg==';
  controller.set({author:'Ada',avatar:image,banner:'https://example.test/banner.webp',website:'https://example.test/about'});
  assert.equal(b.nodes.at(-1).children[0].src,image);
  const restored=initProfile({win:b.win});await restored.ready;
  assert.equal(restored.get().avatar,image);assert.equal(restored.get().website,'https://example.test/about');
  controller.set({...controller.get(),avatar:''});
  assert.equal(b.nodes.at(-1).textContent,'A');assert.equal(controller.get().banner,'https://example.test/banner.webp');
  assert.equal(normalizeProfile({avatar:'data:image/svg+xml;base64,PHN2Zz4=',website:'javascript:alert(1)'}).avatar,'');
  assert.equal(normalizeProfile({website:'javascript:alert(1)'}).website,'');
});

test('public website updates its link and disappears when removed',()=>{
  const link={};const container={querySelector:()=>link};
  const doc={querySelectorAll:selector=>selector==='[data-profile-website]'?[container]:[],querySelector:()=>null};
  applyProfileDOM(doc,{author:'Ada',website:'https://example.test/about'});
  assert.equal(link.href,'https://example.test/about');assert.equal(link.textContent,'example.test/about');assert.equal(container.hidden,false);
  applyProfileDOM(doc,{author:'Ada',website:''});assert.equal(container.hidden,true);
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
