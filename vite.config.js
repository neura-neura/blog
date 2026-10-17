import { defineConfig } from 'vite';
export default defineConfig({base:'./',build:{rollupOptions:{input:'editor.html',output:{manualChunks:{editor:['@tiptap/core','@tiptap/starter-kit','@tiptap/markdown'],math:['katex']}}}}});
