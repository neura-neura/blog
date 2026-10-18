import { initAppearance } from './appearance.js';
initAppearance();
const message=document.querySelector('#pending-message');
const title=document.querySelector('#pending-title');
if(/\/posts\/[a-z0-9]+(?:-[a-z0-9]+)*\.html$/.test(location.pathname)) {
  title.textContent='Estamos preparando este artículo';
  message.textContent='La página puede tardar un momento en estar disponible. Se abrirá automáticamente cuando esté lista.';
  let attempts=0;
  async function check() {
    const url=new URL(location.href);url.searchParams.set('v',String(Date.now()));
    try {
      const response=await fetch(url.href,{cache:'no-store'});
      if(response.ok && (await response.text()).includes('<meta name="article-version"')) {location.replace(url.href);return;}
    } catch { /* Keep the waiting page during transient failures. */ }
    if(++attempts<60)setTimeout(check,5000);
    else message.textContent='La página todavía no está disponible. Vuelve a intentarlo en unos minutos o visita el blog.';
  }
  check();
}
