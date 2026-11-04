# Extensión de Chrome de Vena OS

Guarda en **Documentos** la página que estás viendo en Chrome. Usa tu propio navegador, así que sirve también para las webs que no dejan entrar al servicio del Mac (Abrir web), como claude.ai o las que piden iniciar sesión.

## Instalar

1. En Chrome, abre `chrome://extensions`.
2. Activa **Modo de desarrollador**, arriba a la derecha.
3. Presiona **Cargar descomprimida** y elige esta carpeta, `extension`.
4. Fija el ícono: en la pieza de rompecabezas de la barra de Chrome, presiona el alfiler junto a **Vena OS**.

Chrome avisará que la extensión puede leer los datos de todos los sitios. Lo necesita para entrar a los marcos de otros dominios donde viven páginas como los artifacts de Claude. Solo actúa cuando presionas uno de sus botones.

No cambies de lugar la carpeta: Chrome la lee de ahí. Después de actualizarla, presiona el botón de recargar de la extensión en `chrome://extensions`.

## Usar

Abre la página, presiona el ícono y elige:

- **Anotar en el OS:** la guarda en Documentos y la abre en el visor, con todas las herramientas.
- **Capturar página completa:** guarda una imagen de toda la página en Documentos → Capturas.
- **Capturar pantalla:** lo mismo, solo con lo que se ve ahora.

Se abre una pestaña del OS, que guarda todo con tu sesión. Tienes que tener la sesión iniciada en ese mismo Chrome; si no, te la pide y sigue.

Mientras captura, **quédate en la pestaña**: la página baja sola y al cambiar de pestaña la captura se detiene. Al terminar, la página vuelve a donde estaba. Para cancelar, presiona otra vez el ícono.

## Cómo funciona

- Encuentra lo que se desplaza de verdad: la página, un panel por dentro o un marco de otro dominio. La captura sale solo con eso, sin las barras de la aplicación alrededor.
- Baja por tramos y de cada foto conserva el centro de la pantalla: muchas webs deslizan los elementos al entrar y lo deshacen al salir, y lo que toca los bordes queda a medio camino. Lo flotante (cabeceras fijas, burbujas de chat) solo sale en el primer tramo.
- Guarda los tramos en el disco del navegador hasta que el OS los pide. Lo que el OS no recoge se borra en la siguiente captura pasada una hora.
- La extensión no tiene cuenta ni claves. El OS es quien sube los archivos, y solo el OS puede pedirle datos (`externally_connectable`, comprobado también en el service worker).

## Limitaciones

- Solo en Chrome de computador.
- Lo que se desplaza de lado (un diagrama ancho dentro de la página) sale como se ve en ese momento, no completo.
- Chrome permite dos fotos por segundo, así que una página muy larga tarda: más de un minuto cada 60.000 px, que es el máximo.
- Chrome no deja capturar sus páginas internas (`chrome://`) ni la tienda de extensiones.

## Pruebas

`lib.test.mjs` corre con `npm test` en la raíz. `pruebas/harness.mjs` ejecuta el flujo real en un Chromium sin ventana, con el popup de verdad y el OS en modo demo: página larga, marco de otro dominio, panel interno, pantalla, cancelar, cambiar de pestaña, página prohibida y una web real. Las instrucciones están al comienzo del archivo y los resultados, en `pruebas/resultados/`.
