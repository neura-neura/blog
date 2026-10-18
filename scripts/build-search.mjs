import * as pagefind from 'pagefind';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { summarizePost } from './render-index.mjs';
import { compareArticles } from '../src/post-order.js';

export async function buildSearch(posts, { output, profile, escapeHtml, safeImageUrl, plainText }) {
  // Extract shared raster images so cards/index fragments don't repeat base64 blobs.
  const images = new Map();
  const imageUrl = value => {
    const safe = safeImageUrl(value);
    const match = /^data:image\/(png|jpeg|webp|gif);base64,([a-z0-9+/=]+)$/i.exec(safe);
    if (!match) return safe;
    const name = createHash('sha256').update(safe).digest('hex').slice(0,24)+'.'+match[1].toLowerCase();
    if (!images.has(name)) images.set(name, Buffer.from(match[2], 'base64'));
    return `./media/${name}`;
  };
  imageUrl(profile.banner);imageUrl(profile.avatar);
  const renderOptions={profile,escapeHtml,safeImageUrl:imageUrl,plainText};
  const titleRanks=new Map([...posts].sort((a,b)=>compareArticles(a,b,'title')).map((post,index)=>[post.slug,String(index)]));
  const dateRanks=new Map(posts.map((post,index)=>[post.slug,String(posts.length-index)]));
  const digest=createHash('sha256');
  const { index, errors } = await pagefind.createIndex({ forceLanguage:'es' });
  if (errors?.length || !index) throw new Error('No se pudo crear el índice de búsqueda.');
  try {
    // Bound in-flight work instead of starting 100,000 filesystem/index requests.
    for (let offset=0;offset<posts.length;offset+=32) {
      await Promise.all(posts.slice(offset,offset+32).map(async post=>{
        const text=plainText(post);
        const record={
          url:`/posts/${encodeURIComponent(post.slug)}.html`, language:'es',
          content:[post.title,post.excerpt,...(post.tags||[]),text].filter(Boolean).join('\n'),
          meta:{title:post.title||'Sin título',card:JSON.stringify(summarizePost(post,{...renderOptions,plainText:()=>text}))},
          sort:{date:dateRanks.get(post.slug),title:titleRanks.get(post.slug)},
        };
        digest.update(JSON.stringify(record));
        const result=await index.addCustomRecord(record);
        if(result.errors?.length)throw new Error(`No se pudo indexar el artículo ${post.slug}.`);
      }));
    }
    const version=digest.digest('hex').slice(0,16);
    const result=await index.writeFiles({ outputPath:path.join(output,'pagefind',version) });
    if(result.errors?.length)throw new Error('No se pudo guardar el índice de búsqueda.');
    if(images.size){
      await mkdir(path.join(output,'media'),{recursive:true});
      for(const [name,bytes] of images)await writeFile(path.join(output,'media',name),bytes);
    }
    return { renderOptions:{...renderOptions,searchPath:`./pagefind/${version}/`} };
  } finally { await index.deleteIndex(); }
}
