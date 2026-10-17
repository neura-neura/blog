# Blog Studio

Editor de artículos inspirado en X Articles. GitHub Pages sirve el blog y el editor; no hay servidor, VPN ni credenciales en el código publicado.

## Usar

Abre `https://neura-neura.github.io/blog-studio/editor.html`. Escribe o pega Markdown para convertirlo automáticamente en texto con formato. Los borradores se guardan en el almacenamiento local de ese navegador. Importa `.md` o `.json`; exporta Markdown, HTML o un respaldo JSON.

Para publicar, abre **Configuración**, indica usuario y repositorio y conecta un [token de GitHub](https://github.com/settings/personal-access-tokens/new) limitado a **este repositorio**, con **Contents: Read and write**. Para consultar el progreso de despliegue, añade **Actions: Read**. El token se guarda en `sessionStorage`, nunca en el repositorio ni en los borradores. Al cerrar la pestaña se termina esa sesión; también puedes desconectar desde Configuración. No uses el token en un equipo compartido.

**Publicar** guarda `posts/<slug>.json` mediante la API de GitHub. Actions verifica el proyecto, genera `posts/<slug>.html`, el índice, RSS y sitemap, y despliega Pages. Publica solo contenido que quieras hacer público: tanto el HTML como el JSON original quedan en el repositorio público. El código del editor puede abrirlo cualquiera; solo un token con acceso permite publicar.

## Contenido

Negrita, cursiva, tachado, títulos, listas y tareas, citas, enlaces, emojis, separadores, tablas editables, código, fórmulas LaTeX, imágenes y GIF, portada 5:2 y archivos de vídeo/audio mediante enlaces directos. Las imágenes pegadas, arrastradas o elegidas se incorporan al artículo. Usa archivos pequeños para respetar el límite de almacenamiento del navegador. Los servicios de GIF, embeds sociales y métricas propios de X no están integrados; los enlaces se insertan como citas enlazadas y el vídeo requiere una URL de archivo reproducible.

Las fórmulas y archivos multimedia se conservan en HTML y en el respaldo JSON. La exportación Markdown usa HTML para los bloques que Markdown no representa de forma nativa. El modo enfoque y la vista previa funcionan sin conexión a GitHub. Los borradores no se sincronizan entre dispositivos: exporta un JSON para trasladarlos.

## Desarrollo

```sh
npm ci
npm run dev
npm test
npm run build
npm run preview
```

El editor está en `/editor.html`. El índice público se genera en `dist/index.html` al ejecutar el build. Las dependencias principales son [Tiptap](https://github.com/ueberdosis/tiptap), [marked](https://github.com/markedjs/marked), DOMPurify, sanitize-html y KaTeX.

La publicación usa `.github/workflows/pages.yml`; configura Pages con fuente **GitHub Actions**. `SITE_URL` permite definir la URL canónica en otro repositorio. Las pruebas verifican generación, exclusión de borradores, protección XSS, imágenes, multimedia, fórmulas y contrato de publicación con GitHub.
