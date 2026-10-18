// Explicit, opt-in integration test against your configured GitHub repository.
// Uses gh's existing keychain session; credentials are never written to disk.
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { GitHubClient } from '../src/github.js';
const owner=process.env.BLOG_OWNER||'neura-neura';
const repo=process.env.BLOG_REPO||'blog';
const token=execFileSync('gh',['auth','token'],{encoding:'utf8'}).trim();
const client=new GitHubClient({owner,repo,token});
const slug='prueba-automatica-publicacion';
const post={id:'blog-studio-integration-test',slug,title:'Prueba automática de publicación',author:'Blog Studio',markdown:'## Publicación verificada\n\nEste artículo temporal comprueba el flujo completo.',html:'<h2>Publicación verificada</h2><p>Este artículo temporal comprueba el flujo completo.</p>',status:'published',publishedAt:new Date().toISOString()};
async function deployment(sha){
  for(let i=0;i<80;i++){
    await new Promise(r=>setTimeout(r,5000));
    const run=await client.getDeploymentStatus(sha);
    if(run.status==='completed'){
      assert.equal(run.conclusion,'success',`Deployment failed: ${run.url}`);
      console.log('Deployment succeeded.');return;
    }
  }
  throw Error('Deployment did not complete within the integration test timeout.');
}
let created=false;
try{
  const result=await client.publishPost(post);created=true;
  console.log('Temporary post committed.');
  assert.equal((await client.getPost(slug)).title,post.title);
  await deployment(result.commitSha);
  const response=await fetch(result.url+'?verify='+Date.now());
  assert.equal(response.status,200);
  assert.match(await response.text(),/Publicación verificada/);
  const index=await fetch(`https://${owner}.github.io/${repo}/?verify=${Date.now()}`).then(r=>r.text());
  assert.match(index,new RegExp(`posts/${slug}\\.html`));
  console.log('Published HTML and automatic index link verified over HTTPS.');
}finally{
  if(created){const removed=await client.deletePost(slug);console.log('Temporary post removed from repository.');await deployment(removed.commitSha);console.log('Clean blog redeployed.');}
}
