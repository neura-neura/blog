import {GitHubClient} from './github.js';

export const VISIBILITIES={public:'Público',unlisted:'No listado',private:'Privado'};
export const visibilityOf=post=>post?.visibility||'public';
const encode=value=>{const bytes=new TextEncoder().encode(JSON.stringify(value));let text='';for(let i=0;i<bytes.length;i+=0x8000)text+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(text);};

// The engine never stores article bodies. CI can read public/unlisted sources;
// private publications are fetched only by the authenticated administrator.
export class VisibilityClient extends GitHubClient {
  constructor(options){super(options);this.repositories=options.repositories;this.options=options;}
  source(visibility){
    if(!Object.hasOwn(VISIBILITIES,visibility))throw Error('Selecciona una visibilidad válida.');
    const repo=this.repositories?.[visibility];
    if(!repo)throw Error('Falta configurar el repositorio de artículos.');
    return new GitHubClient({...this.options,repo});
  }
  async checkedSource(visibility){
    const api=this.source(visibility),repository=await api.request('');
    if(!repository?.permissions?.push)throw Error(`Tu token necesita acceso de lectura y escritura a ${api.repo}. Revisa sus repositorios autorizados.`);
    if(visibility!=='public'&&repository.private!==true)throw Error(`No se puede usar ${api.repo}: debe ser un repositorio privado.`);
    return api;
  }
  async listPosts(){
    const groups=await Promise.all(Object.keys(VISIBILITIES).map(async visibility=>{
      const api=await this.checkedSource(visibility);
      const posts=await api.listPosts();
      return posts.filter(post=>visibilityOf(post)===visibility).map(post=>({...post,visibility}));
    }));
    const byId=new Map();
    for(const post of groups.flat().sort((a,b)=>(a.updatedAt||'').localeCompare(b.updatedAt||'')))byId.set(post.id,post);
    return [...byId.values()];
  }
  async getPost(slug,visibility='public'){return (await this.checkedSource(visibility)).getPost(slug);}
  async getLastPublication(slug,visibility='public'){return (await this.checkedSource(visibility)).getLastPublication(slug);}
  async getDeploymentStatus(commitSha){
    if(commitSha)return super.getDeploymentStatus(commitSha);
    const result=await this.request('/actions/workflows/pages.yml/runs?per_page=1',{cache:'no-store'});
    const run=result?.workflow_runs?.[0];
    return run?{status:run.status,conclusion:run.conclusion,url:run.html_url}:null;
  }
  url(post){return visibilityOf(post)==='private'?`https://${this.owner}.github.io/${this.repo}/editor.html#article=${encodeURIComponent(post.id)}`:`https://${this.owner}.github.io/${this.repo}/posts/${encodeURIComponent(post.slug)}.html`;}
  async requestBuild(){
    // Contents permission suffices: no Actions-write token needed in the browser.
    const path='/contents/build-request.json';
    for(let attempt=0;attempt<3;attempt++){
      const existing=await this.request(path+'?ref='+encodeURIComponent(this.branch),{cache:'no-store'});
      try{
        const result=await this.request(path,{method:'PUT',body:JSON.stringify({message:'Rebuild blog',branch:this.branch,content:encode({request:crypto.randomUUID(),requestedAt:new Date().toISOString()}),...(existing?.sha?{sha:existing.sha}:{})})});
        if(!result?.commit?.sha)throw Error('No se confirmó la actualización del sitio. Vuelve a intentarlo.');
        return result.commit.sha;
      }catch(error){if(error.status!==409||attempt===2)throw error;}
    }
  }
  async publishPost(post){
    const visibility=visibilityOf(post),api=await this.checkedSource(visibility);
    const saved=await api.publishPost({...post,visibility});
    let commitSha=null,deploymentPending=false;
    if(visibility!=='private'){try{commitSha=await this.requestBuild();}catch{deploymentPending=true;}}
    return {...saved,commitSha,deploymentPending,url:this.url({...post,visibility}),private:visibility==='private'};
  }
  async deletePost(slug,visibility='public'){
    const result=await (await this.checkedSource(visibility)).deletePost(slug);
    let commitSha=null,deploymentPending=false;
    if(visibility!=='private'){try{commitSha=await this.requestBuild();}catch{deploymentPending=true;}}
    return {...result,commitSha,deploymentPending};
  }
  async changeVisibility(post,target){
    if(!Object.hasOwn(VISIBILITIES,target))throw Error('Selecciona una visibilidad válida.');
    const from=visibilityOf(post);
    if(from===target)return {post,result:{url:this.url(post),unchanged:true}};
    const destination=await this.checkedSource(target);
    const source=await this.checkedSource(from);
    const publicSlug=post.publicSlug||(from==='public'?post.slug:undefined);
    // Rotate the unlisted link whenever it was publicly listed in the meantime.
    const slug=target==='unlisted'?crypto.randomUUID():target==='public'?(publicSlug||post.slug):post.id;
    const next={...post,visibility:target,slug,publicSlug,updatedAt:new Date().toISOString(),status:'published'};
    const existing=await source.getPost(post.slug);
    if(!existing||existing.updatedAt!==post.updatedAt)throw Error('El artículo cambió en otro dispositivo. Actualiza Publicados antes de cambiar su visibilidad.');
    if(await destination.getPost(next.slug))throw Error('Ya existe una versión en el destino. Actualiza Publicados antes de reintentar.');
    await destination.publishPost(next);
    // Destination is durable before removing source. On a failed removal, undo
    // only the just-created destination, leaving the original article intact.
    try{await source.deletePost(post.slug);}catch(error){
      try{await destination.deletePost(next.slug);}catch{throw Error('El cambio quedó pendiente entre repositorios. Actualiza Publicados antes de reintentar. Tu contenido está conservado.');}
      throw error;
    }
    let commitSha=null,deploymentPending=false;
    try{commitSha=await this.requestBuild();}catch{deploymentPending=true;}
    return {post:next,result:{commitSha,deploymentPending,url:this.url(next),private:target==='private'}};
  }
}
