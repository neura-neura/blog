import {waitForPublication} from './publication.js';

// Persist only deployment metadata, so reloading can resume the same operation.
export function createPublicationMonitor({client,storage,key='blog-publication-progress',onChange=()=>{},wait=waitForPublication}){
  let records={};
  try{const saved=JSON.parse(storage?.getItem(key)||'{}');if(saved&&typeof saved==='object'&&!Array.isArray(saved))records=saved;}catch{}
  const active=new Map();
  const identity=post=>`${post.id}:${post.updatedAt}:${post.visibility||'public'}`;
  const get=post=>records[identity(post)];
  function update(post,value){
    records[identity(post)]=value;
    // Keep only recent operations; no article text or credentials are stored here.
    records=Object.fromEntries(Object.entries(records).slice(-100));
    try{storage?.setItem(key,JSON.stringify(records));}catch{}
    onChange(post,value);
  }
  function watch(post,result={}){
    const id=identity(post);
    if(active.has(id))return active.get(id);
    const previous=get(post);
    const api=client();
    const pageUrl=typeof api.url==='function'?api.url(post):`https://${api.owner}.github.io/${api.repo}/posts/${encodeURIComponent(post.slug)}.html`;
    const options={sha:result.commitSha||previous?.sha,url:result.private||post.visibility==='private'?undefined:result.url||pageUrl,version:post.updatedAt};
    const task=Promise.resolve().then(async()=>{
      update(post,{...options,status:'waiting'});
      try{
        if(result.deploymentPending)options.sha=await api.requestBuild();
        return await wait({api,...options,onState:state=>update(post,{...options,...state})});
      }catch{
        const state={...options,status:'failed'};update(post,state);return state;
      }
    }).finally(()=>active.delete(id));
    active.set(id,task);return task;
  }
  function observe(post){
    const state=get(post);
    if(!state&&post.visibility==='private')return;
    if(!state||state.status!=='ready')void watch(post);
  }
  return {get,watch,observe};
}
