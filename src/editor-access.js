export function mountEditorAccess({app,tokens,verifyAccess,loadEditor}){
let entering=false;
app.innerHTML=`<main class="editor-login" ${tokens.get()?'hidden':''}><a class="login-brand" href="./index.html" aria-label="Volver al blog"><img src="./favicon.svg" alt="" width="44" height="44"></a><h1>Acceso al editor</h1><p>Solo el propietario y los colaboradores con permiso de escritura pueden editar este blog.</p><form id="login-form"><label for="login-token">Token de GitHub</label><input id="login-token" type="password" autocomplete="off" required placeholder="github_pat_â€¦"><p class="login-hint">Se guardarÃ¡ en este navegador para tus prÃ³ximas visitas.</p><p id="login-error" role="alert" hidden></p><button class="primary" type="submit">Entrar al editor</button></form><a class="login-back" href="./index.html">Volver a los artÃ­culos</a><button type="button" class="login-forget" hidden>Olvidar token guardado</button></main><div class="editor-loading" role="status" ${tokens.get()?'':'hidden'}>Cargando editor…</div>`;
const login=app.querySelector('.editor-login');
const loading=app.querySelector('.editor-loading');
const form=app.querySelector('#login-form');
const input=app.querySelector('#login-token');
const error=app.querySelector('#login-error');
const submit=form.querySelector('[type=submit]');
const forget=app.querySelector('.login-forget');
input.value=tokens.get();forget.hidden=!tokens.get();
async function verify(value){
  const restoring=!!tokens.get();
  login.hidden=restoring;loading.hidden=!restoring;
  if(entering)return;
  entering=true;submit.disabled=true;submit.textContent='Comprobando accesoâ€¦';error.hidden=true;
  try{
    await verifyAccess(value);
    // Persist only after GitHub confirms write access to this site's repository.
    tokens.set(value);
    await loadEditor();
  }catch(reason){
    entering=false;login.hidden=false;loading.hidden=true;error.textContent=reason.message||'No pudimos comprobar el acceso. IntÃ©ntalo de nuevo.';
    error.hidden=false;submit.disabled=false;submit.textContent='Entrar al editor';forget.hidden=!tokens.get();
  }
}
form.addEventListener('submit',event=>{event.preventDefault();verify(input.value.trim());});
forget.addEventListener('click',()=>tokens.set(''));
if(tokens.get())void verify(tokens.get());
return {verify};

}
