import {GitHubClient} from './github.js';
import {initTokenStore} from './token-store.js';
import {initAppearance} from './appearance.js';
import './style.css';
import './appearance.css';
import './editor-login.css';
import {mountEditorAccess} from './editor-access.js';

initAppearance();
const app=document.querySelector('#app');
const hosted=location.hostname.endsWith('.github.io');
const owner=hosted?location.hostname.split('.')[0]:'neura-neura';
const repo=hosted?location.pathname.split('/').filter(Boolean)[0]:'blog';
let access;
const tokens=initTokenStore({onChange:value=>{if(value)void access?.verify(value);else location.reload();}});
access=mountEditorAccess({app,tokens,verifyAccess:value=>new GitHubClient({owner,repo,token:value}).assertEditorAccess(),loadEditor:async()=>{const response=await fetch(new URL('./content-config.json',location.href),{cache:'no-store'});if(!response.ok)throw Error('No se pudo cargar la configuración de artículos. Recarga e inténtalo de nuevo.');const config=await response.json();if(config.version!==1||!config.repositories)throw Error('Configuración de artículos inválida.');globalThis.blogContentRepositories=config.repositories;return import('./main.js');}});
