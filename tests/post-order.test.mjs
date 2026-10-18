import test from 'node:test';
import assert from 'node:assert/strict';
import { compareArticles } from '../src/post-order.js';

const posts=[
  {title:'Zorro',publishedAt:'2026-01-01T00:00:00Z'},
  {title:'Árbol',publishedAt:'2026-03-01T00:00:00Z'},
  {title:'Libro 10',publishedAt:'2026-02-01T00:00:00Z'},
  {title:'Libro 2',publishedAt:'2026-02-01T00:00:00Z'},
];
test('feed orders publication dates both ways and preserves ties',()=>{
  assert.deepEqual([...posts].sort(compareArticles).map(p=>p.title),['Árbol','Libro 10','Libro 2','Zorro']);
  assert.deepEqual([...posts].sort((a,b)=>compareArticles(a,b,'oldest')).map(p=>p.title),['Zorro','Libro 10','Libro 2','Árbol']);
});
test('feed title ordering understands Spanish accents and numbers',()=>{
  assert.deepEqual([...posts].sort((a,b)=>compareArticles(a,b,'title')).map(p=>p.title),['Árbol','Libro 2','Libro 10','Zorro']);
});
