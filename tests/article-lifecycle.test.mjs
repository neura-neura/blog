import test from 'node:test';
import assert from 'node:assert/strict';
import {recoverPublishedEdits,movePublicationToDraft,publicationWorkingCopy} from '../src/article-lifecycle.js';
import {draftEntries} from '../src/draft-list.js';
import {publishedArticles} from '../src/published-posts.js';
const live={id:'one',slug:'first',title:'Artículo',html:'<p>Publicado</p>',markdown:'Publicado',status:'published',updatedAt:'2026-10-18T10:00:00Z'};
test('legacy published edits become visible drafts without changing the public snapshot',()=>{
 const edited={...live,html:'<p>Edición local</p>',markdown:'Edición local',updatedAt:'2026-10-18T11:00:00Z'};
 const cloud={...edited,status:'draft',originalStatus:'published',privateSavedAt:'2026-10-18T11:01:00Z'};
 const local=recoverPublishedEdits([edited],[live]);assert.equal(local[0].status,'draft');
 assert.deepEqual(publishedArticles([live],local),[live]);
 assert.equal(draftEntries(local,[cloud],undefined,[live])[0].storage,'En este navegador y en la nube');
 assert.equal(draftEntries([], [cloud],undefined,[live])[0].draft.html,edited.html);
 assert.equal(draftEntries([live], [cloud],undefined,[live])[0].remoteOnly,true);
});
test('a newer cloud edition is available without being masked by an older local working copy',()=>{
 const local={...live,status:'draft'},cloud={...local,title:'Edición nueva',updatedAt:'2026-10-18T12:00:00Z',privateSavedAt:'2026-10-18T12:01:00Z'};
 assert.equal(draftEntries([local],[cloud],undefined,[live])[0].remoteOnly,true);
});
test('published to draft to cloud to republished flow preserves working edits and clears consumed cloud entries',async()=>{
 let posts=[live],local=[live];
 const {draft}=await movePublicationToDraft({post:live,removePublication:async slug=>{assert.equal(slug,'first');posts=[];return {deleted:true};},saveLocal:value=>{local=[value];}});
 assert.equal(draft.status,'draft');assert.equal(posts.length,0);assert.equal(draft.publishedAt,undefined);
 const edited={...draft,html:'<p>Nueva versión</p>',markdown:'Nueva versión',updatedAt:'2026-10-18T12:00:00Z'};
 const cloud={...edited,privateSavedAt:'2026-10-18T12:01:00Z',originalStatus:'draft'};
 assert.equal(draftEntries([],[cloud],undefined,posts)[0].remoteOnly,true);
 const republished={...edited,status:'published',updatedAt:'2026-10-18T12:02:00Z'};posts=[republished];local=[republished];
 assert.deepEqual(draftEntries(local,[cloud],undefined,posts),[]);
 assert.deepEqual(publishedArticles(posts,local),[republished]);
});
test('storage failure stops unpublishing; request failure retains the saved recovery draft',async()=>{
 let removed=false,saved;
 await assert.rejects(movePublicationToDraft({post:live,saveLocal:()=>{throw Error('storage full');},removePublication:async()=>{removed=true;}}),/storage full/);assert.equal(removed,false);
 await assert.rejects(movePublicationToDraft({post:live,saveLocal:d=>{saved=d;},removePublication:async()=>{throw Error('offline');}}),/offline/);assert.equal(saved.status,'draft');assert.equal(saved.html,live.html);
});

test('opening a public snapshot preserves the cloud revision without replacing public content',()=>{
 const prior={...live,privateSavedAt:'saved-revision',title:'An older publication'};
 const working=publicationWorkingCopy(live,[prior]);
 assert.equal(working.title,live.title);assert.equal(working.privateSavedAt,'saved-revision');
 const pending={...prior,status:'draft',title:'Working edit'};
 assert.equal(publicationWorkingCopy(live,[pending]),pending);
});
