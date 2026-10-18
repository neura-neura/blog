import {GitHubClient} from './github.js';
import {initTokenStore} from './token-store.js';
import {initAppearance} from './appearance.js';
import './style.css';
import './appearance.css';
import './editor-login.css';

initAppearance();
const app=document.querySelector('#app');
const hosted=location.hostname.endsWith('.github.io');
const owner=hosted?location.hostname.split('.')[0]:'neura-neura';
const repo=hosted?location.pathname.split('/').filter(Boolean)[0]:'blog';
let entering=false;
const tokens=initTokenStore({onChange:value=>{if(value&&!entering)verify(value);else if(!value)location.reload();}});
app.innerHTML=`<main class="editor-login"><a class="login-brand" href="./index.html" aria-label="Volver al blog"><img src="./favicon.svg" alt="" width="44" height="44"></a><h1>Acceso al editor</h1><p>Solo el propietario y los colaboradores con permiso de escritura pueden editar este blog.</p><form id="login-form"><label for="login-token">Token de GitHub</label><input id="login-token" type="password" autocomplete="off" required placeholder="github_pat_…"><p class="login-hint">Se guardará en este navegador para tus próximas visitas.</p><p id="login-error" role="alert" hidden></p><button class="primary" type="submit">Entrar al editor</button></form><a class="login-back" href="./index.html">Volver a los artículos</a><button type="button" class="login-forget" hidden>Olvidar token guardado</button></main>`;
const form=document.querySelector('#login-form');
const input=document.querySelector('#login-token');
const error=document.querySelector('#login-error');
const submit=form.querySelector('[type=submit]');
const forget=document.querySelector('.login-forget');
input.value=tokens.get();forget.hidden=!tokens.get();
async function verify(value){
  if(entering)return;
  entering=true;submit.disabled=true;submit.textContent='Comprobando acceso…';error.hidden=true;
  try{
    const api=new GitHubClient({owner,repo,token:value});
    await api.assertEditorAccess();
    // Persist only after GitHub confirms write access to this site's repository.
    tokens.set(value);
    await import('./main.js');
  }catch(reason){
    entering=false;error.textContent=reason.message||'No pudimos comprobar el acceso. Inténtalo de nuevo.';
    error.hidden=false;submit.disabled=false;submit.textContent='Entrar al editor';forget.hidden=!tokens.get();
  }
}
form.addEventListener('submit',event=>{event.preventDefault();verify(input.value.trim());});
forget.addEventListener('click',()=>tokens.set(''));
if(tokens.get())verify(tokens.get());
