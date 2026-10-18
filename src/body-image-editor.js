import { cropGeometry } from './cover-crop.js';
import './body-image.css';
import { mediaIcon } from './media-icons.js';

export function openBodyImageEditor(editor, getPos, mode = 'crop') {
  const pos = getPos();const node = editor.state.doc.nodeAt(pos);
  if (node?.type.name !== 'image') return;
  const attrs = { ...node.attrs };
  const dialog = document.createElement('dialog');dialog.className = 'body-media-dialog';
  const top = document.createElement('div');top.className = 'body-media-top';
  const cancel = document.createElement('button');cancel.type = 'button';cancel.textContent = '←';cancel.setAttribute('aria-label', 'Cancelar edición de imagen');
  const heading = document.createElement('h2');heading.textContent = mode === 'caption' ? 'Editar pie de imagen' : 'Recortar imagen';
  const save = document.createElement('button');save.type = 'button';save.className = 'body-media-save';save.textContent = 'Guardar';
  top.append(cancel, heading);
  const body = document.createElement('div');body.className = 'body-media-body';
  const error = document.createElement('p');error.className = 'form-error';error.hidden = true;error.setAttribute('role', 'alert');
  dialog.append(top, body, error);document.body.append(dialog);
  let cleanup = () => {};
  dialog.addEventListener('close', () => { cleanup();dialog.remove();editor.commands.focus(); }, { once: true });
  cancel.onclick = () => dialog.close();
  function update(patch) {
    const position = getPos();
    if (typeof position !== 'number' || editor.state.doc.nodeAt(position)?.type.name !== 'image') { dialog.close();return; }
    editor.view.dispatch(editor.state.tr.setNodeMarkup(position, undefined, { ...editor.state.doc.nodeAt(position).attrs, ...patch }));
    dialog.close();
  }
  if (mode === 'caption') {
    const remove = document.createElement('button');remove.type = 'button';remove.className = 'body-caption-remove';remove.textContent = 'Quitar';remove.onclick = () => update({ caption: '' });
    top.append(remove, save);
    const input = document.createElement('textarea');input.className = 'body-caption-input';input.placeholder = 'Añade un pie de imagen (opcional)';input.setAttribute('aria-label', 'Pie de imagen (opcional)');input.value = attrs.caption || '';
    const preview = document.createElement('div');preview.className = 'body-caption-preview';const image = document.createElement('img');image.src = attrs.src;image.alt = attrs.alt || '';preview.append(image);
    body.append(input, preview);save.onclick = () => update({ caption: input.value.trim() });dialog.showModal();return;
  }
  top.append(save);save.disabled = true;
  const tabs = document.createElement('div');tabs.className = 'body-media-tabs';tabs.setAttribute('role', 'tablist');tabs.setAttribute('aria-label', 'Editar imagen');
  const cropTab = document.createElement('button');cropTab.type = 'button';cropTab.innerHTML = mediaIcon('crop');cropTab.setAttribute('aria-label', 'Recortar imagen');cropTab.title = 'Recortar imagen';cropTab.setAttribute('role', 'tab');
  const altTab = document.createElement('button');altTab.type = 'button';altTab.textContent = 'ALT';altTab.setAttribute('role', 'tab');altTab.setAttribute('aria-label', 'Editar descripción de imagen');tabs.append(cropTab, altTab);
  const cropPanel = document.createElement('div');cropPanel.className = 'body-crop-panel';
  const stage = document.createElement('div');stage.className = 'body-crop-stage';stage.tabIndex = 0;stage.setAttribute('role', 'group');stage.setAttribute('aria-label', 'Encuadre de imagen. Arrastra o usa las flechas para moverla.');
  const image = document.createElement('img');image.draggable = false;image.alt = 'Imagen original';
  const frame = document.createElement('div');frame.className = 'body-crop-frame';stage.append(image, frame);
  const controls = document.createElement('div');controls.className = 'body-crop-controls';
  const ratios = document.createElement('div');ratios.className = 'body-crop-ratios';
  const range = document.createElement('input');range.type = 'range';range.min = '1';range.max = '3';range.step = '.01';range.value = '1';range.setAttribute('aria-label', 'Zoom de imagen');
  const zoomButton = (name, text, step) => { const button=document.createElement('button');button.type='button';button.innerHTML=mediaIcon(name);button.title=text;button.setAttribute('aria-label',text);button.onclick=()=>{range.value=String(Number(range.value)+step);range.dispatchEvent(new Event('input'));};return button; };
  controls.append(ratios, zoomButton('zoomOut','Alejar imagen',-.1), range, zoomButton('zoomIn','Acercar imagen',.1));cropPanel.append(stage, controls);
  const altPanel = document.createElement('div');altPanel.className = 'body-alt-panel';altPanel.hidden = true;
  const altPreview = document.createElement('div');altPreview.className='body-alt-preview';const previewImage=document.createElement('img');previewImage.src=attrs.src;previewImage.alt=attrs.alt||'';altPreview.append(previewImage);
  const label = document.createElement('label');label.className='body-alt-field';const caption=document.createElement('span');caption.textContent='Descripción';const alt = document.createElement('textarea');alt.maxLength = 1000;alt.value = attrs.alt || '';alt.setAttribute('aria-label', 'Texto alternativo');
  const count = document.createElement('span');count.className = 'body-alt-count';alt.oninput = () => { count.textContent = `${alt.value.length} / 1,000`; };alt.oninput();label.append(caption,count,alt);
  const help=document.createElement('button');help.type='button';help.className='body-alt-help';help.textContent='¿Qué es el texto alternativo?';
  help.onclick=()=>{const info=document.createElement('dialog');info.className='body-alt-info';const title=document.createElement('h2');title.textContent='Añade descripciones';const text=document.createElement('p');text.textContent='El texto alternativo permite que las personas ciegas o con baja visión conozcan el contenido de tus imágenes mediante un lector de pantalla. Describe de forma breve y precisa lo que aparece y el contexto que aporta al artículo. Es diferente del pie de imagen, que pueden leer todos los visitantes.';const done=document.createElement('button');done.type='button';done.className='body-media-save';done.textContent='Entendido';done.onclick=()=>info.close();info.append(title,text,done);document.body.append(info);info.addEventListener('close',()=>info.remove(),{once:true});info.showModal();};
  altPanel.append(altPreview,label,help);
  body.append(tabs, cropPanel, altPanel);
  function tab(active) { cropPanel.hidden = !active;altPanel.hidden = active;cropTab.setAttribute('aria-selected', String(active));altTab.setAttribute('aria-selected', String(!active));heading.textContent = active ? 'Recortar imagen' : 'Editar descripción de imagen';if (active) render();else alt.focus(); }
  cropTab.onclick = () => tab(true);altTab.onclick = () => tab(false);
  let state = { x: .5, y: .5, zoom: 1, ratio: 'original' }, dirty = false, ready = false, rect;
  try { state = { ...state, ...JSON.parse(attrs.crop || '{}') }; } catch { /* Older images start with their natural aspect ratio. */ }
  range.value = String(state.zoom);
  const ratio = () => state.ratio === 'square' ? 1 : state.ratio === 'wide' ? 16 / 9 : image.naturalWidth / image.naturalHeight;
  function render() {
    if (!ready || !stage.clientWidth) return;
    const r = ratio(), w = Math.min(stage.clientWidth - 48, (stage.clientHeight - 48) * r), h = w / r;
    rect = { x: (stage.clientWidth - w) / 2, y: (stage.clientHeight - h) / 2, width: w, height: h };
    Object.assign(frame.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${w}px`, height: `${h}px` });
    const crop = cropGeometry(image.naturalWidth, image.naturalHeight, state.zoom, state.x, state.y, r), scale = w / crop.width;
    Object.assign(image.style, { width: `${image.naturalWidth * scale}px`, height: `${image.naturalHeight * scale}px`, left: `${rect.x - crop.x * scale}px`, top: `${rect.y - crop.y * scale}px` });
    range.setAttribute('aria-valuetext', `${Math.round(state.zoom * 100)} %`);
  }
  for (const [value, text] of [['original', 'Original'], ['wide', 'Panorámico'], ['square', 'Cuadrado']]) {
    const button = document.createElement('button');button.type = 'button';button.innerHTML = mediaIcon(value);button.title=text;button.dataset.ratio = value;button.setAttribute('aria-label', `Proporción: ${text}`);
    button.onclick = () => { state.ratio = value;state.x = state.y = .5;state.zoom = 1;range.value = '1';dirty = true;selectRatio();render(); };ratios.append(button);
  }
  function selectRatio() { for (const button of ratios.children) button.setAttribute('aria-pressed', String(button.dataset.ratio === state.ratio)); }
  selectRatio();range.oninput = () => { state.zoom = Number(range.value);dirty = true;render(); };
  let drag;
  stage.onpointerdown = event => { if (!ready) return;drag = { x: event.clientX, y: event.clientY, startX: state.x, startY: state.y };stage.setPointerCapture(event.pointerId); };
  stage.onpointermove = event => {
    if (!drag) return;
    const crop = cropGeometry(image.naturalWidth, image.naturalHeight, state.zoom, state.x, state.y, ratio()), scale = rect.width / crop.width;
    const dx = (image.naturalWidth - crop.width) * scale, dy = (image.naturalHeight - crop.height) * scale;
    state.x = dx ? Math.max(0, Math.min(1, drag.startX - (event.clientX - drag.x) / dx)) : .5;
    state.y = dy ? Math.max(0, Math.min(1, drag.startY - (event.clientY - drag.y) / dy)) : .5;dirty = true;render();
  };
  stage.onpointerup = stage.onpointercancel = () => { drag = null; };
  stage.onkeydown = event => { if (!event.key.startsWith('Arrow')) return;event.preventDefault();const step = event.shiftKey ? .1 : .02;if (event.key === 'ArrowLeft') state.x -= step;if (event.key === 'ArrowRight') state.x += step;if (event.key === 'ArrowUp') state.y -= step;if (event.key === 'ArrowDown') state.y += step;state.x = Math.max(0, Math.min(1, state.x));state.y = Math.max(0, Math.min(1, state.y));dirty = true;render(); };
  const observer = new ResizeObserver(render);observer.observe(stage);cleanup = () => observer.disconnect();
  save.onclick = () => {
    try {
      const patch = { alt: alt.value };
      if (dirty) {
        const crop = cropGeometry(image.naturalWidth, image.naturalHeight, state.zoom, state.x, state.y, ratio());
        const canvas = document.createElement('canvas');const scale = Math.min(1, 1600 / Math.max(crop.width, crop.height));canvas.width = Math.max(1, Math.round(crop.width * scale));canvas.height = Math.max(1, Math.round(crop.height * scale));
        canvas.getContext('2d').drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
        patch.src = canvas.toDataURL('image/webp', .92);patch.originalSrc = attrs.originalSrc || attrs.src;patch.crop = JSON.stringify(state);patch.width = null;patch.height = null;
      }
      update(patch);
    } catch { error.textContent = 'No se pudo recortar esta imagen. Si procede de otra web, descárgala e insértala como archivo para permitir su edición.';error.hidden = false; }
  };
  dialog.showModal();tab(true);
  if (/^https?:/i.test(attrs.originalSrc || attrs.src)) image.crossOrigin = 'anonymous';
  image.src = attrs.originalSrc || attrs.src;
  image.decode().then(() => { if (!dialog.isConnected) return;ready = true;save.disabled = false;render(); }).catch(() => {
    // ALT remains editable even if an external image refuses CORS image decoding.
    save.disabled = false;error.textContent = 'No se pudo abrir el original para recortarlo. Puedes editar la descripción ALT o insertar la imagen desde un archivo.';error.hidden = false;
  });
}
