import { initAppearance } from './appearance.js';
initAppearance();
const message=document.querySelector('#pending-message');
const title=document.querySelector('#pending-title');
if(new URL(location.href).searchParams.has('v')&&/\/posts\/[a-z0-9]+(?:-[a-z0-9]+)*\.html$/.test(location.pathname)) {
  title.textContent='Comprobando disponibilidad del artículo';
  message.textContent='La página puede tardar un momento en estar disponible. Se abrirá automáticamente cuando esté lista.';
  let attempts=0;
  async function check() {
    const url=new URL(location.href);url.searchParams.set('v',String(Date.now()));
    try {
      const response=await fetch(url.href,{cache:'no-store'});
      if(response.ok && (await response.text()).includes('<meta name="article-version"')) {location.replace(url.href);return;}
    } catch { /* Keep the waiting page during transient failures. */ }
    if(++attempts<12)setTimeout(check,5000);
    else {title.textContent='El artículo no está disponible';message.textContent='El enlace puede haber cambiado o el artículo puede haberse retirado. Vuelve al blog o comprueba el enlace con su autor.';}
  }
  check();
}
