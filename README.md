# Blog

Editor de artículos inspirado en X Articles. GitHub Pages sirve el blog y el editor; no hay servidor, VPN ni credenciales en el código publicado.

## Usar

Abre `https://neura-neura.github.io/blog/editor.html`. Escribe o pega Markdown para convertirlo automáticamente en texto con formato. Los borradores se guardan en el almacenamiento local de ese navegador. Importa `.md` o `.json`; exporta Markdown, HTML o un respaldo JSON.

Para publicar, abre **Configuración**, indica usuario y repositorio y conecta un [token de GitHub](https://github.com/settings/personal-access-tokens/new) limitado a **blog, blog-drafts, blog-public, blog-unlisted y blog-private**, con **Contents: Read and write**. Para consultar el progreso de despliegue, añade **Actions: Read**. El token se guarda localmente en este navegador y se comparte entre sus pestañas; nunca se incluye en el repositorio ni en los borradores. Puedes desconectarlo desde Configuración. No uses el token en un equipo compartido.

**Más opciones → Guardar borrador en la nube** guarda una copia manual en el repositorio privado `neura-neura/blog-drafts`. El guardado automático continúa siendo local. Las copias aparecen en **Borradores**, junto con los borradores locales, con una indicación de dónde están guardadas. En móvil, abre **Artículos y borradores**. Si tu copia local difiere de la privada, el editor conserva la local como otro borrador antes de abrir la privada.

Para habilitarlo, edita tu token en GitHub: en **Repository access → Only select repositories**, conserva `blog` y añade `blog-drafts`, con **Contents: Read and write**. Puedes seguir usando el mismo token. El editor comprueba que el repositorio de borradores sea privado antes de leer o guardar contenido y rechaza las copias antiguas si otro dispositivo ya guardó una versión posterior. No hay guardado privado automático ni publicación al pulsar ese botón. Los borradores privados no forman parte del build, perfil, buscador, RSS ni repositorio público; solo pueden acceder quienes tengan permiso en el repositorio privado. Para usar otra instancia, crea primero su repositorio privado `<repositorio-del-blog>-drafts` con rama `main`.

**Publicar** permite elegir la visibilidad del artículo:

| Visibilidad | Lectura | Almacenamiento |
|---|---|---|
| Público | Aparece en el perfil, la búsqueda y RSS | `blog-public`, público |
| No listado | Se abre con un enlace aleatorio; no aparece en listados ni índices del blog | Fuente en `blog-unlisted`, privado; HTML en GitHub Pages |
| Privado | Se lee desde el editor con acceso autorizado | `blog-private`, privado; nunca se incluye en Pages |

En **Publicados** puedes filtrar las tres opciones. **Más opciones → Cambiar visibilidad** permite pasar de cualquiera a cualquiera conservando el contenido y la fecha original. El destino se guarda antes de retirar el origen. Los cambios en Pages requieren un despliegue; el editor confirma cuándo está disponible la página.

Un enlace no listado puede reenviarse: el enlace da acceso a quien lo tenga. Para contenido que requiera autenticación, usa Privado. Cambiar la visibilidad no borra copias anteriores, cachés ni el historial de un repositorio que haya sido público. Al pasar a No listado se genera un enlace aleatorio nuevo.

`blog` contiene el motor y el perfil. El despliegue usa claves de solo lectura para `blog-public` y `blog-unlisted`; no tiene acceso a `blog-private` ni `blog-drafts`. El editor solicita el despliegue mediante una actualización de `build-request.json`, que no contiene artículos. El acceso a artículos privados requiere un token con permiso sobre su repositorio.


## Contenido

Negrita, cursiva, tachado, títulos, listas y tareas, citas, enlaces, emojis, separadores, tablas editables, código, fórmulas LaTeX, imágenes y GIF, portada 5:2 y archivos de vídeo/audio mediante enlaces directos. Las imágenes pegadas, arrastradas o elegidas se incorporan al artículo. Usa archivos pequeños para respetar el límite de almacenamiento del navegador. Los servicios de GIF, embeds sociales y métricas propios de X no están integrados; los enlaces se insertan como citas enlazadas y el vídeo requiere una URL de archivo reproducible.

Las fórmulas y archivos multimedia se conservan en HTML y en el respaldo JSON. La exportación Markdown usa HTML para los bloques que Markdown no representa de forma nativa. El modo enfoque y la vista previa funcionan sin conexión a GitHub. Usa una versión en la nube o exporta un JSON para trasladar un borrador a otro dispositivo.

## Desarrollo

```sh
npm ci
npm run dev
npm test
PUBLIC_POSTS_DIR=.content-sources/public/posts UNLISTED_POSTS_DIR=.content-sources/unlisted/posts npm run build
npm run preview
```

Para el build local, clona `blog-public` en `.content-sources/public` y `blog-unlisted` en `.content-sources/unlisted`. Las variables anteriores usan sintaxis de shell POSIX; en PowerShell asígnalas con `$env:PUBLIC_POSTS_DIR` y `$env:UNLISTED_POSTS_DIR`.

El editor está en `/editor.html`. El índice público se genera en `dist/index.html` al ejecutar el build. Las dependencias principales son [Tiptap](https://github.com/ueberdosis/tiptap), [marked](https://github.com/markedjs/marked), DOMPurify, sanitize-html y KaTeX.

La publicación usa `.github/workflows/pages.yml`; configura Pages con fuente **GitHub Actions**. `SITE_URL` permite definir la URL canónica en otro repositorio. Las pruebas verifican generación, exclusión de borradores, protección XSS, imágenes, multimedia, fórmulas y contrato de publicación con GitHub.
