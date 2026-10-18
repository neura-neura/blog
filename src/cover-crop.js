export function cropGeometry(width,height,zoom=1,x=.5,y=.5,ratio=2.5) {
  zoom=Math.max(1,Math.min(3,Number(zoom)||1));
  const cropWidth=Math.min(width,height*ratio)/zoom;
  const cropHeight=cropWidth/ratio;
  return {x:Math.max(0,Math.min(1,x))*(width-cropWidth),y:Math.max(0,Math.min(1,y))*(height-cropHeight),width:cropWidth,height:cropHeight};
}
export const cropMarkup = `<div class="crop-actions"><p class="hint">Arrastra la imagen para encuadrar la portada.</p><button type="button" class="crop-apply">Aplicar</button></div><div class="crop-stage" tabindex="0" role="group" aria-label="Encuadre de portada. Usa las flechas para mover la imagen."><img alt="Imagen original para recortar" draggable="false"><div class="crop-shade top"></div><div class="crop-shade bottom"></div><div class="crop-frame"></div></div><div class="crop-zoom"><span aria-hidden="true">−</span><input type="range" aria-label="Zoom de portada" min="1" max="3" step="0.01" value="1"><span aria-hidden="true">+</span></div>`;
export async function mountCoverCrop(root,source,onApply,initial={},ratio=2.5) {
  const stage=root.querySelector('.crop-stage');
  const image=stage.querySelector('img');
  const range=root.querySelector('input');
  const shade=(1-1/ratio)/2;
  for(const node of root.querySelectorAll('.crop-shade'))node.style.height=`${shade*100}%`;
  const frame=root.querySelector('.crop-frame');frame.style.top=`${shade*100}%`;frame.style.height=`${100/ratio}%`;
  image.src=source;
  await image.decode();
  let x=initial.x??.5,y=initial.y??.5,zoom=initial.zoom??1;
  range.value=String(zoom);
  function render() {
    const crop=cropGeometry(image.naturalWidth,image.naturalHeight,zoom,x,y,ratio);
    const scale=stage.clientWidth/crop.width;
    image.style.width=`${image.naturalWidth*scale}px`;
    image.style.height=`${image.naturalHeight*scale}px`;
    image.style.left=`${-crop.x*scale}px`;
    image.style.top=`${stage.clientWidth*shade-crop.y*scale}px`;
    range.setAttribute('aria-valuetext',`${Math.round(zoom*100)} %`);
  }
  range.oninput=()=>{zoom=Number(range.value);render();};
  let drag;
  stage.onpointerdown=e=>{drag={clientX:e.clientX,clientY:e.clientY,x,y};stage.setPointerCapture(e.pointerId);};
  stage.onpointermove=e=>{
    if(!drag)return;
    const crop=cropGeometry(image.naturalWidth,image.naturalHeight,zoom,x,y,ratio),scale=stage.clientWidth/crop.width;
    const dx=(image.naturalWidth-crop.width)*scale,dy=(image.naturalHeight-crop.height)*scale;
    x=dx ? Math.max(0,Math.min(1,drag.x-(e.clientX-drag.clientX)/dx)) : .5;
    y=dy ? Math.max(0,Math.min(1,drag.y-(e.clientY-drag.clientY)/dy)) : .5;
    render();
  };
  stage.onpointerup=stage.onpointercancel=()=>{drag=null;};
  stage.onkeydown=e=>{if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();const step=e.shiftKey?.1:.02;if(e.key==='ArrowLeft')x=Math.max(0,x-step);if(e.key==='ArrowRight')x=Math.min(1,x+step);if(e.key==='ArrowUp')y=Math.max(0,y-step);if(e.key==='ArrowDown')y=Math.min(1,y+step);render();};
  const observer=new ResizeObserver(render);observer.observe(stage);
  const dialog=root.closest('dialog');
  dialog.addEventListener('close',()=>observer.disconnect(),{once:true});
  root.querySelector('.crop-apply').onclick=()=>{
    const crop=cropGeometry(image.naturalWidth,image.naturalHeight,zoom,x,y,ratio);
    const canvas=document.createElement('canvas');
    const step=ratio===3?3:5;
    canvas.width=Math.max(step,Math.floor(Math.min(1500,crop.width)/step)*step);canvas.height=canvas.width/ratio;
    canvas.getContext('2d').drawImage(image,crop.x,crop.y,crop.width,crop.height,0,0,canvas.width,canvas.height);
    onApply(canvas.toDataURL('image/webp',.92),{x,y,zoom});
  };
  render();
  return observer;
}
