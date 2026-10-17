import test from 'node:test';
import assert from 'node:assert/strict';
import { PALETTE, DEFAULT_APPEARANCE, APPEARANCE_KEY, normalizeAppearance, appearanceTokens, contrast, initAppearance } from '../src/appearance.js';

test('appearance rejects corrupt preferences and unknown options', () => {
  for(const value of [null, [], 'bad', {color:'red',size:99,background:'url(x)',system:'true'}]) assert.deepEqual(normalizeAppearance(value),DEFAULT_APPEARANCE);
});
test('all twelve colors keep readable foregrounds in both themes', () => {
  assert.equal(new Set(PALETTE.map(c=>c.hex)).size,12);
  for(const color of PALETTE) for(const background of ['light','dark']) {
    const tokens=appearanceTokens({color:color.id,background});
    assert.equal(tokens['--blue'],color.hex);
    assert.ok(contrast(tokens['--blue'],tokens['--on-accent'])>=4.5,color.id);
    assert.ok(contrast(tokens['--link'],tokens['--bg'])>=4.5,color.id);
  }
});
test('system preference controls background only when enabled', () => {
  assert.equal(appearanceTokens({system:true},true)['--bg'],'#000000');
  assert.equal(appearanceTokens({system:true,background:'dark'},false)['--bg'],'#ffffff');
  assert.equal(appearanceTokens({background:'light'},true)['--bg'],'#ffffff');
});
test('browser saves preferences, restores them and follows system changes', () => {
  const storage=new Map([[APPEARANCE_KEY,'broken json']]);
  const styles=new Map(); let onMedia;
  const media={matches:false,addEventListener:(name,cb)=>onMedia=cb};
  const win={localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},matchMedia:()=>media,document:{documentElement:{style:{setProperty:(k,v)=>styles.set(k,v)},dataset:{}}},Event:class {},dispatchEvent(){},addEventListener(){}};
  const controller=initAppearance(win);
  assert.deepEqual(controller.get(),DEFAULT_APPEARANCE);
  assert.equal(controller.set({color:'pink-pastel',size:4,system:true}),true);
  assert.equal(initAppearance(win).get().color,'pink-pastel');
  assert.equal(styles.get('--ui-font'),'18px');
  media.matches=true;onMedia();assert.equal(styles.get('--bg'),'#000000');
  win.localStorage.setItem=()=>{throw Error('blocked');};
  assert.equal(controller.set({color:'green'}),false);
  assert.equal(styles.get('--blue'),'#00ba7c');
});
