import test from 'node:test';
import assert from 'node:assert/strict';
import {cropGeometry} from '../src/cover-crop.js';
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
