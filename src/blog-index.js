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
