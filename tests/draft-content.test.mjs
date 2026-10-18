import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {Editor,generateJSON} from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import {Markdown} from '@tiptap/markdown';
import {BodyImage} from '../src/body-image.js';
import {createDraftBodyTracker,sameDraftContent,normalizedEditorDocument} from '../src/draft-content.js';
import {draftEntries} from '../src/draft-list.js';

function setup(){
  const dom=new JSDOM('<div id="editor"></div>');
  globalThis.window=dom.window;globalThis.document=dom.window.document;
  Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
  const extensions=[StarterKit,BodyImage,Markdown];
  const editor=new Editor({element:document.querySelector('#editor'),extensions});
  return {editor,extensions};
}
test('reload and unload preserve the saved body even when the editor normalizes image markup',()=>{
  const {editor,extensions}=setup();
  const draft={id:'one',title:'Idea',markdown:'An older derived Markdown export',html:'<p>Texto</p><figure data-body-image="true"><img alt="Paisaje" src="https://example.test/image.png" /></figure>',privateSavedAt:'saved'};
  const remote=structuredClone(draft);
  const tracker=createDraftBodyTracker(editor);
  for(let i=0;i<3;i++){
    editor.commands.setContent(draft.html,{emitUpdate:false});tracker.reset(draft);
    assert.notEqual(editor.getHTML(),draft.html);
    tracker.sync(draft);assert.deepEqual(draft,remote);
  }
  const normalize=html=>normalizedEditorDocument(generateJSON(html,extensions));
  const canonical={...remote,html:editor.getHTML(),markdown:editor.getMarkdown()};
  assert.equal(sameDraftContent(canonical,remote,normalize),true);
  assert.equal(draftEntries([canonical],[remote],(a,b)=>sameDraftContent(a,b,normalize))[0].storage,'En este navegador y en la nube');
  editor.commands.insertContent('<p>Cambio real</p>');tracker.sync(draft);
  assert.equal(sameDraftContent(draft,remote,normalize),false);
  assert.match(draft.html,/Cambio real/);editor.destroy();
});
test('ALT and caption edits, cover and title changes remain real changes',()=>{
 const {editor,extensions}=setup();const normalize=html=>normalizedEditorDocument(generateJSON(html,extensions));
 const draft={title:'Idea',cover:'cover.png',html:'<figure><img src="https://example.test/a.png" alt="Uno"><figcaption>Pie</figcaption></figure>'};
 for(const updated of [{title:'Nueva idea'},{cover:'otra.png'},{html:draft.html.replace('Uno','Dos')},{html:draft.html.replace('Pie','Otro pie')}])assert.equal(sameDraftContent({...draft,...updated},draft,normalize),false);
 editor.destroy();
});
test('explicit Markdown source edits synchronize without being lost',()=>{
 const {editor}=setup();const draft={html:'<p>Uno</p>',markdown:'Uno'};editor.commands.setContent(draft.html,{emitUpdate:false});const tracker=createDraftBodyTracker(editor);tracker.reset(draft);
 tracker.sync(draft,'**Dos**');assert.equal(draft.markdown,'**Dos**');assert.match(draft.html,/<strong>Dos<\/strong>/);
 tracker.sync(draft,'**Dos**');assert.match(draft.html,/Dos/);editor.destroy();
});
