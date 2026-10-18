import { renderFeedCard } from './feed-card.js';
import { createFeedPager } from './feed-pager.js';
import { initProfile, applyProfileDOM } from './profile.js';
const input=document.querySelector('#article-search');
const list=document.querySelector('#article-list');
const cards=document.querySelector('#feed-cards');
const status=document.querySelector('#search-status');
const loading=document.querySelector('#feed-loading');
const loadStatus=document.querySelector('#feed-load-status');
const moreButton=document.querySelector('#feed-load-more');
const noResults=document.querySelector('#no-results');
const total=Number(list?.dataset.total)||0;
const pageSize=Number(list?.dataset.pageSize)||20;
const sortButton=document.querySelector('#feed-order-button');
const sortMenu=document.querySelector('#feed-order-menu');
const sortOptions=Array.from(document.querySelectorAll('[data-feed-order]'));
const sortKey='blog-feed-order';
const fallbackProfile={author:document.querySelector('[data-profile=author]')?.textContent||'Mi blog',avatar:document.querySelector('.profile-avatar img')?.getAttribute('src')||''};
const profile=initProfile();
const renderResult=result=>renderFeedCard(JSON.parse(result.meta.card),profile.get()||fallbackProfile);
let order='newest', engine, engineAttempt=0, uiRevision=0, retry=null, timer;
let replaceOnNext=false;
async function search(query,sort){
  if(!total)return {results:[]};
  if(!engine){
    const url=new URL(`${list.dataset.searchPath||'./pagefind/'}pagefind.js`,import.meta.url);
    // Failed ES module fetches are cached by browsers: a retry needs a new URL.
    url.searchParams.set('load',String(engineAttempt++));
    engine=import(url.href).catch(error=>{engine=null;throw error;});
  }
  const api=await engine;
  try{return await api.search(query||null,{sort:sort==='title'?{title:'asc'}:{date:sort==='oldest'?'asc':'desc'}});}
  catch(error){engine=null;await api.destroy();throw error;}
}
const pager=createFeedPager({search,pageSize,initialCount:cards?.querySelectorAll('.post-card').length||0,total});
// Keep only nearby card batches in the DOM; measured spacers preserve scrolling.
const virtualObserver='IntersectionObserver' in window?new IntersectionObserver(async entries=>{
  for(const entry of entries){
    const node=entry.target;
    if(!entry.isIntersecting||node.dataset.restoring==='true')continue;
    node.dataset.restoring='true';
    const version=uiRevision;
    try{
      const batch=await pager.page(Number(node.dataset.offset));
      if(!batch||version!==uiRevision||!node.isConnected)continue;
      node.innerHTML=batch.map(renderResult).join('');
      node.style.height='';node.classList.remove('feed-spacer');node.removeAttribute('aria-hidden');
      virtualObserver.unobserve(node);
      refreshProfile();virtualize();
    }catch{ /* Keep the spacer and retry when it next enters the viewport. */ }
    finally{delete node.dataset.restoring;}
  }
},{rootMargin:'800px'}):null;
function refreshProfile(){const value=profile.get();if(value)applyProfileDOM(document,value);}
function virtualize(){
  if(!virtualObserver)return;
  const batches=[...cards.querySelectorAll('.feed-page:not(.feed-spacer)')];
  if(batches.length<=6)return;
  for(const node of batches){
    if(cards.querySelectorAll('.feed-page:not(.feed-spacer)').length<=6)break;
    const rect=node.getBoundingClientRect();
    if((rect.bottom < -1200 || rect.top > innerHeight+1200)&&!node.contains(document.activeElement)){
      node.style.height=`${rect.height}px`;node.replaceChildren();node.classList.add('feed-spacer');node.setAttribute('aria-hidden','true');virtualObserver.observe(node);
    }
  }
}
if(cards?.children.length){const initial=document.createElement('div');initial.className='feed-page';initial.dataset.offset='0';initial.append(...cards.childNodes);cards.append(initial);}
function updateControls(){
  const state=pager.state();
  loading.hidden=!state.more&&!retry;
  moreButton.disabled=state.busy;
  moreButton.textContent=retry?'Reintentar':state.busy?'Cargando…':'Cargar más artículos';
  list.setAttribute('aria-busy',String(state.busy));
}
async function load(reset=false){
  if(pager.state().busy&&!reset)return;
  const version=uiRevision;
  retry=null;loading.hidden=false;moreButton.disabled=true;moreButton.textContent='Cargando…';
  loadStatus.textContent='';list.setAttribute('aria-busy','true');
  const offset=reset?0:pager.state().loaded;
  try{
    const batch=await (reset?pager.reset(input.value.trim(),order):pager.next());
    if(!batch||version!==uiRevision)return;
    if(reset||replaceOnNext){virtualObserver?.disconnect();cards.replaceChildren();replaceOnNext=false;}
    if(batch.length){
      const page=document.createElement('div');page.className='feed-page';page.dataset.offset=String(offset);
      page.innerHTML=batch.map(renderResult).join('');cards.append(page);refreshProfile();virtualize();
    }
    noResults.hidden=pager.state().count>0;
    status.textContent=input.value.trim()?`${pager.state().count} ${pager.state().count===1?'artículo encontrado':'artículos encontrados'}`:`${pager.state().loaded} de ${pager.state().count} artículos`;
  }catch{
    if(version!==uiRevision)return;
    retry=()=>load(reset);
    loadStatus.textContent='No pudimos cargar los artículos. Revisa tu conexión y vuelve a intentarlo.';
    status.textContent=loadStatus.textContent;
  }finally{if(version===uiRevision)updateControls();}
}
function resetFeed(){
  clearTimeout(timer);uiRevision++;replaceOnNext=true;noResults.hidden=true;
  status.textContent=input.value.trim()?'Buscando en todos los artículos…':'Cargando artículos…';
  load(true);
}
input?.addEventListener('input',()=>{clearTimeout(timer);uiRevision++;timer=setTimeout(resetFeed,250);});
document.querySelector('.blog-search')?.addEventListener('submit',event=>{event.preventDefault();resetFeed();});
for(const link of document.querySelectorAll('a[href="#article-search"]'))link.addEventListener('click',()=>input.focus());
for(const button of document.querySelectorAll('[data-topic]'))button.addEventListener('click',()=>{input.value=button.dataset.topic;resetFeed();input.focus();});
moreButton?.addEventListener('click',()=>retry?retry():load());
if('IntersectionObserver' in window){
  const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)&&pager.state().more&&!pager.state().busy&&!retry&&!replaceOnNext)load();},{rootMargin:'600px'});
  const sentinel=document.querySelector('#feed-sentinel');if(sentinel)observer.observe(sentinel);
}
function setOrder(value){
  const selected=sortOptions.find(option=>option.dataset.feedOrder===value)||sortOptions[0];
  if(!selected)return;
  order=selected.dataset.feedOrder;
  sortButton.querySelector('span').textContent=selected.querySelector('span').textContent;
  for(const option of sortOptions)option.setAttribute('aria-checked',String(option===selected));
  try{localStorage.setItem(sortKey,order);}catch{}
  resetFeed();
}
function closeOrder(restoreFocus=false){if(!sortMenu)return;sortMenu.hidden=true;sortButton.setAttribute('aria-expanded','false');if(restoreFocus)sortButton.focus();}
function openOrder(){sortMenu.hidden=false;sortButton.setAttribute('aria-expanded','true');(sortOptions.find(option=>option.getAttribute('aria-checked')==='true')||sortOptions[0]).focus();}
sortButton?.addEventListener('click',()=>sortMenu.hidden?openOrder():closeOrder(true));
sortButton?.addEventListener('keydown',event=>{if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();openOrder();}});
for(const option of sortOptions)option.addEventListener('click',()=>{setOrder(option.dataset.feedOrder);closeOrder(true);});
sortMenu?.addEventListener('keydown',event=>{
  const index=sortOptions.indexOf(document.activeElement);
  if(event.key==='Escape'){event.preventDefault();closeOrder(true);}
  if(event.key==='Tab')closeOrder();
  if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
    event.preventDefault();
    const next=event.key==='Home'?0:event.key==='End'?sortOptions.length-1:(index+(event.key==='ArrowDown'?1:-1)+sortOptions.length)%sortOptions.length;
    sortOptions[next].focus();
  }
});
document.addEventListener('click',event=>{if(!event.target.closest('.feed-order'))closeOrder();});

if(sortButton){let saved;try{saved=localStorage.getItem(sortKey);}catch{}if(saved&&saved!=='newest')setOrder(saved);}
