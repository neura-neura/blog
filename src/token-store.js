// Keep credentials local to this browser and this site's path, never in public profile data.
export function initTokenStore({win=window,onChange=()=>{}}={}) {
  const key=`blog-studio-token-v2:${new URL('./',win.location.href).pathname}`;
  const legacyKey='blog-studio-token';
  let value='';
  try {
    const stored=win.localStorage.getItem(key);
    value=stored===null?(win.sessionStorage.getItem(legacyKey)||''):stored;
    // An empty stored value also records disconnect, preventing old tab sessions from restoring it.
    win.localStorage.setItem(key,value);
    win.sessionStorage.removeItem(legacyKey);
  } catch { value=win.sessionStorage.getItem(legacyKey)||''; }
  win.addEventListener('storage',event=>{
    if(event.key!==key&&event.key!==null)return;
    value=win.localStorage.getItem(key)||'';
    win.sessionStorage.removeItem(legacyKey);
    onChange(value);
  });
  return {
    get:()=>value,
    set(next){
      const saved=String(next||'').trim();
      try {win.localStorage.setItem(key,saved);} catch {throw Error('Este navegador no permite guardar el token. Habilita el almacenamiento del sitio y vuelve a intentar.');}
      win.sessionStorage.removeItem(legacyKey);
      value=saved;onChange(value);
      return value;
    },
  };
}
