import test from 'node:test';
import assert from 'node:assert/strict';
import {cropGeometry} from '../src/cover-crop.js';
test('body image original, wide and square crops stay within source bounds at every edge',()=>{
  for(const [w,h] of [[600,800],[1800,720],[800,800]])for(const ratio of [w/h,16/9,1])for(const zoom of [1,1.5,3])for(const x of [0,.5,1])for(const y of [0,.5,1]){
    const crop=cropGeometry(w,h,zoom,x,y,ratio);
    assert.ok(Math.abs(crop.width/crop.height-ratio)<.0001);
    assert.ok(crop.x>=0&&crop.y>=0&&crop.x+crop.width<=w+.0001&&crop.y+crop.height<=h+.0001);
    if(ratio===w/h&&zoom===1){assert.equal(crop.width,w);assert.equal(crop.height,h);}
  }
});
test('portrait, landscape, square and panoramic covers crop to 5:2 within source bounds',()=>{
  for(const [w,h] of [[720,1052],[1800,720],[800,800],[3000,500]])for(const zoom of [1,1.5,3])for(const x of [0,.5,1])for(const y of [0,.5,1]){
    const crop=cropGeometry(w,h,zoom,x,y);
    assert.equal(crop.width/crop.height,2.5);
    assert.ok(crop.x>=0&&crop.y>=0);
    assert.ok(crop.x+crop.width<=w+.0001&&crop.y+crop.height<=h+.0001);
  }
});
test('zoom narrows the crop and centering keeps the image midpoint',()=>{
  const crop=cropGeometry(720,1052,2,.5,.5);
  assert.equal(crop.width,360);assert.equal(crop.x+crop.width/2,360);assert.equal(crop.y+crop.height/2,526);
});

test('blog banners use a separate 3:1 crop within image bounds',()=>{
  for(const [w,h] of [[720,1052],[1800,720],[800,800],[3000,500]])for(const zoom of [1,2,3]){
    const crop=cropGeometry(w,h,zoom,.5,.5,3);
    assert.equal(crop.width/crop.height,3);
    assert.ok(crop.x>=0&&crop.y>=0&&crop.x+crop.width<=w&&crop.y+crop.height<=h);
    assert.equal(crop.x+crop.width/2,w/2);assert.equal(crop.y+crop.height/2,h/2);
  }
});
