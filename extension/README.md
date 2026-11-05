# Extensión de Chrome de Vena OS

Herramientas de dibujo sobre la página que estás viendo en Chrome. Las capturas quedan en **Documentos → Capturas**. Dibujas sobre la página real, con tu sesión, así que sirve también en las webs que no dejan entrar al servicio del Mac (Abrir web), como claude.ai o las que piden iniciar sesión.

## Instalar

1. En Chrome, abre `chrome://extensions`.
2. Activa **Modo de desarrollador**, arriba a la derecha.
3. Presiona **Cargar descomprimida** y elige esta carpeta, `extension`.
4. Fija el ícono: en la pieza de rompecabezas de la barra de Chrome, presiona el alfiler junto a **Vena OS**.

Chrome avisará que la extensión puede leer los datos de todos los sitios. Lo necesita para entrar a los marcos de otros dominios donde viven páginas como los artifacts de Claude. Solo actúa cuando presionas su ícono.

No cambies de lugar la carpeta: Chrome la lee de ahí. Después de actualizarla, presiona el botón de recargar de la extensión en `chrome://extensions` y recarga las páginas que tenías abiertas.

## Usar

Presiona el ícono en cualquier página y aparece la barra. Presiónalo otra vez, o la X, para cerrarla.

| Herramienta | Tecla |
|---|---|
| Usar la página (hacer clic, seleccionar, abrir secciones) | V |
| Lápiz | P |
| Resaltador | H |
| Borrador | E |
| Texto | T |
| Formas: rectángulo, círculo, línea y flecha | R |
| Captura | C |

Deshacer y rehacer con **Cmd + Z** y **Cmd + Shift + Z**. Con la rueda o el trackpad la página sigue bajando mientras dibujas, y los trazos bajan con ella.

**Captura:** arrastra un recuadro, o elige **Pantalla** o **Completo**. La imagen lleva tus trazos, sin la barra, y queda en Capturas sin sacarte de la página: una pestaña del OS se abre atrás, la guarda con tu sesión y se cierra sola. Si no tienes la sesión iniciada, esa pestaña pasa al frente para que entres.

**Completo:** la página baja sola y al terminar vuelve a donde estaba. Quédate en la pestaña, porque si cambias de pestaña la captura se detiene. Para cancelar, presiona **Esc**.

Los trazos no se guardan: al cerrar la barra o recargar la página se borran, y lo que queda es lo capturado.

## Cómo funciona

- **La barra va donde está el contenido.** Encuentra lo que se desplaza de verdad: la página, un panel por dentro o un marco de otro dominio. Ahí pone la barra, y la captura completa sale solo con eso, sin las barras de la aplicación alrededor.
- **Fotos por tramos.** Espera a que la página deje de moverse y conserva el centro de cada foto: muchas webs animan su propio desplazamiento o deslizan los elementos al entrar, y lo que toca los bordes queda a medio camino. Si la página se mueve durante la foto, la repite. Lo flotante (cabeceras fijas, burbujas de chat) solo sale en el primer tramo.
- **Nada de cuentas.** La extensión no tiene cuenta ni claves. Guarda los tramos en el disco del navegador hasta que el OS los pide y los sube con su sesión; solo el OS puede pedírselos (`externally_connectable`, comprobado también en el service worker). Lo que el OS no recoge se borra en la siguiente captura pasada una hora.

## Limitaciones

- Solo en Chrome de computador.
- Si la página se reacomoda (cambias el tamaño de la ventana, se abre una sección), los trazos no la siguen.
- Lo que se mueve por dentro, como un diagrama ancho con su propio desplazamiento, tampoco lleva los trazos consigo. Márcalo y captúralo en la misma posición. En **Completo**, esa parte sale como se vea en ese momento.
- El recuadro abarca lo que se ve en pantalla. Para más, usa **Completo**.
- Chrome permite dos fotos por segundo, así que una página muy larga tarda: más de un minuto cada 60.000 px, que es el máximo.
- Chrome no deja usarla en sus páginas internas (`chrome://`) ni en la tienda de extensiones. En esos casos el ícono muestra un `!`.

## Desarrollo

La barra está en `src/` y usa la geometría de dibujo del OS (`src/features/documentos/model.ts`). Después de cambiarla, en la raíz del repositorio:

```bash
npm run extension:build
```

Eso genera `overlay.js`, que se guarda en el repositorio para poder cargar la extensión tal cual.

## Pruebas

`lib.test.mjs` corre con `npm test` en la raíz. `pruebas/harness.mjs` ejecuta el flujo real en un Chromium sin ventana: dibuja con el puntero y guarda en el OS en modo demo. Cubre herramientas, recuadro, pantalla, página completa, marco de otro dominio, desplazamiento animado por código, cuerpo que se desplaza con un diagrama alto, panel interno, política de seguridad estricta, cancelar, cambiar de pestaña, cerrar, página prohibida, guardado silencioso, OS sin sesión y una web real. Mide cada captura: que no tenga bloques negros y que las filas de las páginas de prueba queden a distancias iguales. Las instrucciones están al comienzo del archivo y los resultados, en `pruebas/resultados/`.
