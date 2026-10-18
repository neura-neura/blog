import { compareArticles } from './post-order.js';
const input=document.querySelector('#article-search');
const cards=Array.from(document.querySelectorAll('.post-card'));
const normalize=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
function filter(){
  const query=normalize(input.value.trim());
  let shown=0;
  for(const card of cards){card.hidden=!normalize(card.dataset.search).includes(query);if(!card.hidden)shown++;}
  document.querySelector('#no-results').hidden=shown>0||cards.length===0;
  document.querySelector('#search-status').textContent=query?`${shown} ${shown===1?'artículo encontrado':'artículos encontrados'}`:'';
}
input?.addEventListener('input',filter);
document.querySelector('.blog-search')?.addEventListener('submit',e=>e.preventDefault());
for(const button of document.querySelectorAll('[data-topic]'))button.addEventListener('click',()=>{input.value=button.dataset.topic;filter();input.focus();});

const sortButton=document.querySelector('#feed-order-button');
const sortMenu=document.querySelector('#feed-order-menu');
const sortOptions=Array.from(document.querySelectorAll('[data-feed-order]'));
const sortKey='blog-feed-order';
function setOrder(order,announce=false){
  const selected=sortOptions.find(option=>option.dataset.feedOrder===order)||sortOptions[0];
  if(!selected)return;
  order=selected.dataset.feedOrder;
  sortButton.querySelector('span').textContent=selected.querySelector('span').textContent;
  for(const option of sortOptions)option.setAttribute('aria-checked',String(option===selected));
  const list=document.querySelector('#article-list');
  const sorted=[...cards].sort((a,b)=>compareArticles({title:a.dataset.title,publishedAt:a.dataset.publishedAt},{title:b.dataset.title,publishedAt:b.dataset.publishedAt},order));
  for(const card of sorted)list.insertBefore(card,document.querySelector('#no-results'));
  try{localStorage.setItem(sortKey,order);}catch{/* Sorting also works without browser storage. */}
  if(announce)document.querySelector('#search-status').textContent=`Orden: ${selected.querySelector('span').textContent}.`;
}
function closeOrder(restoreFocus=false){if(!sortMenu)return;sortMenu.hidden=true;sortButton.setAttribute('aria-expanded','false');if(restoreFocus)sortButton.focus();}
function openOrder(){sortMenu.hidden=false;sortButton.setAttribute('aria-expanded','true');(sortOptions.find(option=>option.getAttribute('aria-checked')==='true')||sortOptions[0]).focus();}
sortButton?.addEventListener('click',()=>sortMenu.hidden?openOrder():closeOrder(true));
sortButton?.addEventListener('keydown',event=>{if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();openOrder();}});
for(const option of sortOptions)option.addEventListener('click',()=>{setOrder(option.dataset.feedOrder,true);closeOrder(true);});
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
if(sortButton){let saved;try{saved=localStorage.getItem(sortKey);}catch{}setOrder(saved);}
