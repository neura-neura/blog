import {sameDraftContent} from './draft-content.js';
export const sameArticle=(a,b)=>Boolean(a&&b&&(a.id===b.id||(a.slug&&a.slug===b.slug)));
export const findPublication=(draft,published)=>published.find(post=>sameArticle(draft,post));

// Recover edits made by the old editor, which left edited copies marked published.
// The public snapshot remains independent and is never replaced by the working copy.
export function recoverPublishedEdits(local,published,sameContent=sameDraftContent){
  return local.map(draft=>{
    const live=findPublication(draft,published);
    return draft.status==='published'&&live&&!sameContent(draft,live)
      ? {...draft,status:'draft',originalStatus:'published'} : draft;
  });
}
export function visibleCloudDraft(draft,published){
  const live=findPublication(draft,published);
  // A cloud snapshot predating the last publication has already been published.
  return !live||!draft.privateSavedAt||!live.updatedAt||draft.privateSavedAt>live.updatedAt;
}
export function editableDraft(draft){
  const result={...draft,status:'draft',updatedAt:new Date().toISOString()};
  delete result.originalStatus;
  delete result.publishedAt;
  return result;
}
export async function movePublicationToDraft({post,workingCopy=post,removePublication,saveLocal}){
  const next=editableDraft(workingCopy);
  if(post.updatedAt)next.sourcePublicationUpdatedAt=post.updatedAt;
  // Persist the working copy before withdrawing the public file, so a storage
  // failure cannot remove the public article and leave no recoverable draft.
  saveLocal(next);
  const result=await removePublication(post.slug);
  return {draft:next,result};
}

// Public JSON deliberately excludes private metadata. Reattach only the local
// cloud revision when reopening it; never replace newer public content.
export function publicationWorkingCopy(post,local,sameContent=sameDraftContent){
  const previous=local.find(draft=>sameArticle(draft,post));
  if(previous?.status==='draft')return previous;
  const next={...post};
  if(previous?.privateSavedAt)next.privateSavedAt=previous.privateSavedAt;
  if(previous&&sameContent(previous,post)){
    for(const key of ['html','coverSource','coverCrop'])if(previous[key]!==undefined)next[key]=previous[key];
  }
  return next;
}
