import { normalizeProfile } from './profile.js';
import { cropMarkup, mountCoverCrop } from './cover-crop.js';
import { mediaIcon } from './media-icons.js';
import './profile-editor.css';

const esc=value=>String(value||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const photoButton=(name,label,id)=>`<button type="button" id="${id}" aria-label="${label}" title="${label}">${mediaIcon(name)}</button>`;

export function openProfileEditor({ profile, onSave }) {
  let value=normalizeProfile(profile);
  const sources={avatar:value.avatar,banner:value.banner}, crops={};
  const dialog=document.createElement('dialog');dialog.className='profile-editor';dialog.setAttribute('aria-label','Editar perfil');
  const field=(name,label,limit,multiline=false)=>`<label class="profile-field"><span>${label}</span><span class="profile-field-count" data-count="${name}"></span>${multiline?`<textarea name="${name}" maxlength="${limit}" aria-label="${label}">${esc(value[name])}</textarea>`:`<input name="${name}" ${name==='author'?'required':''} type="${name==='website'?'url':'text'}" maxlength="${limit}" aria-label="${label}" value="${esc(value[name])}">`}</label>`;
  dialog.innerHTML=`<form><div class="profile-editor-top">${photoButton('close','Cancelar edición del perfil','profile-dismiss')}<h2>Editar perfil</h2><button class="profile-save" type="submit">Guardar</button></div><div class="profile-editor-banner"><div class="profile-banner-picture"></div><div class="profile-photo-overlays">${photoButton('camera','Cambiar portada del blog','profile-banner-upload')}${photoButton('crop','Ajustar portada del blog','profile-banner-adjust')}${photoButton('close','Quitar portada del blog','profile-banner-remove')}</div></div><div class="profile-editor-avatar-row"><div class="profile-editor-avatar"><div class="profile-avatar-picture"></div>${photoButton('camera','Cambiar foto de perfil','profile-avatar-upload')}</div><div class="profile-avatar-tools">${photoButton('crop','Ajustar foto de perfil','profile-avatar-adjust')}${photoButton('close','Quitar foto de perfil','profile-avatar-remove')}</div></div><div class="profile-editor-fields">${field('author','Nombre',100)}${field('handle','Nombre de usuario público',100)}${field('bio','Presentación',500,true)}${field('website','Sitio web',300)}<p class="hint">Tu foto, nombre y presentación se aplican al blog y a todos tus artículos. La portada del blog es independiente de las imágenes de tus artículos.</p><p class="form-error" role="alert" hidden></p></div><input type="file" name="avatar-file" accept="image/png,image/jpeg,image/webp,image/gif" hidden><input type="file" name="banner-file" accept="image/png,image/jpeg,image/webp,image/gif" hidden></form>`;
  document.body.append(dialog);const $=selector=>dialog.querySelector(selector);
  const error=$('.form-error'), save=$('.profile-save');
  $('#profile-dismiss').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});
  let busy=false;
  dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  function pictures(){
    for(const kind of ['avatar','banner']){
      const preview=$(`.profile-${kind}-picture`);preview.replaceChildren();
      if(value[kind]){const image=document.createElement('img');image.src=value[kind];image.alt=kind==='avatar'?'Foto de perfil':'Portada del blog';preview.append(image);}
      else if(kind==='avatar')preview.textContent=Array.from($('[name=author]').value||value.author)[0];
      $(`#profile-${kind}-adjust`).hidden=!value[kind];$(`#profile-${kind}-remove`).hidden=!value[kind];
    }
  }
  for(const input of dialog.querySelectorAll('.profile-field input,.profile-field textarea')){
    const count=$(`[data-count="${input.name}"]`);
    input.addEventListener('input',()=>{count.textContent=`${input.value.length} / ${input.maxLength}`;if(input.name==='author')pictures();});
    count.textContent=`${input.value.length} / ${input.maxLength}`;
  }
  async function adjust(kind){
    error.hidden=true;
    try{await cropProfilePhoto(sources[kind],kind,crops[kind],(url,state)=>{value[kind]=url;crops[kind]=state;pictures();});}
    catch{error.textContent='No pudimos abrir esta imagen. Prueba con un archivo PNG, JPEG, GIF o WebP.';error.hidden=false;}
  }
  for(const kind of ['avatar','banner']){
    const input=$(`[name=${kind}-file]`);
    $(`#profile-${kind}-upload`).onclick=()=>input.click();
    $(`#profile-${kind}-adjust`).onclick=()=>adjust(kind);
    $(`#profile-${kind}-remove`).onclick=()=>{value[kind]='';sources[kind]='';delete crops[kind];pictures();};
    input.onchange=async()=>{
      const file=input.files[0];input.value='';if(!file)return;
      if(!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type)||file.size>2*1024*1024){error.textContent='Usa una imagen PNG, JPEG, GIF o WebP de menos de 2 MB.';error.hidden=false;return;}
      try{const source=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});
        await cropProfilePhoto(source,kind,{},(url,state)=>{sources[kind]=source;value[kind]=url;crops[kind]=state;pictures();});
      }catch{error.textContent='No pudimos leer la imagen.';error.hidden=false;}
    };
  }
  $('form').onsubmit=async event=>{
    event.preventDefault();if(busy)return;error.hidden=true;
    const data=new FormData(event.target);const website=String(data.get('website')).trim();
    if(website&&!/^https?:\/\//i.test(website)){error.textContent='El sitio web debe empezar por https:// o http://.';error.hidden=false;return;}
    const next=normalizeProfile({...value,author:data.get('author'),bio:data.get('bio'),handle:data.get('handle'),website});
    busy=true;save.disabled=true;save.textContent='Guardando…';$('#profile-dismiss').disabled=true;
    try{await onSave(next);dialog.close();}
    catch(e){error.textContent=e.message;error.hidden=false;}
    finally{busy=false;save.disabled=false;save.textContent='Guardar';$('#profile-dismiss').disabled=false;}
  };
  pictures();dialog.showModal();return dialog;
}

async function cropProfilePhoto(source,kind,initial,onApply){
  const avatar=kind==='avatar';
  const dialog=document.createElement('dialog');dialog.className=`profile-photo-crop ${avatar?'is-avatar':''}`;dialog.setAttribute('aria-label',avatar?'Ajustar foto de perfil':'Ajustar portada del blog');
  dialog.innerHTML=`<div class="profile-editor-top">${photoButton('back','Cancelar ajuste de foto','profile-crop-cancel')}<h2>${avatar?'Ajustar foto de perfil':'Ajustar portada'}</h2><button type="button" class="profile-crop-apply profile-save" disabled>Aplicar</button></div><div class="profile-crop-body">${cropMarkup}</div><p class="hint">Arrastra para encuadrar. También puedes usar las flechas y el zoom.</p>`;
  dialog.querySelector('.crop-actions').hidden=true;
  dialog.querySelector('.crop-stage').setAttribute('aria-label',avatar?'Encuadre de foto de perfil. Usa las flechas para moverla.':'Encuadre de portada del blog. Usa las flechas para moverla.');
  dialog.querySelector('input[type=range]').setAttribute('aria-label',avatar?'Zoom de foto de perfil':'Zoom de portada del blog');
  document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.querySelector('#profile-crop-cancel').onclick=()=>dialog.close();dialog.showModal();
  try{
    await mountCoverCrop(dialog,source,(url,state)=>{onApply(url,state);dialog.close();},initial||{},avatar?1:3,avatar?512:1500);
    if(!dialog.isConnected)return;
    const apply=dialog.querySelector('.profile-crop-apply');apply.disabled=false;apply.onclick=()=>dialog.querySelector('.crop-apply').click();
  }catch(e){dialog.close();throw e;}
}
