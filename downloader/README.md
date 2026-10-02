# Servicio de descargas

Corre en el Mac y atiende la sección **Descargar** del OS. Tiene API propia, cero dependencias de npm y motores intercambiables. En el celular la sección no aparece.

## Instalar en el Mac

```bash
cd downloader
npm run service:install     # copia el servicio a ~/Library/Application Support/Vena Downloader,
                            # instala los motores y lo deja arrancando solo (launchd)
npm run service:uninstall   # quita servicio, motores y arranque automático
```

- Se instala fuera de Documentos porque macOS bloquea esa carpeta a los procesos en segundo plano.
- Después de cambiar el código, vuelve a correr `service:install` para que el Mac use la versión nueva.
- El registro queda en `~/Library/Logs/vena-downloader.log`.
- Los motores se actualizan solos cada 7 días, siempre que no haya descargas en curso (`AUTO_UPDATE_DAYS`, 0 lo apaga).
- La primera vez, Chrome pide permiso para que os.venadigital.com.co acceda a apps de este dispositivo. Hay que aceptarlo. Si se rechazó, se cambia en la configuración del sitio, en el permiso de red local.

## Desarrollo

```bash
npm run engines:install   # motores en .engines/ para desarrollo (usa uv)
npm start                 # http://127.0.0.1:4318 (detén antes el servicio instalado o usa PORT=4319)
npm test                  # pruebas sin red
npm run typecheck
```

## Arquitectura

```
OS · sección Descargar ─▶  API HTTP (src/server.ts)
                          │  /api/detect   /api/inspect   /api/jobs …
                          ▼
                        JobManager (src/core/jobs.ts) ── TempStore (src/core/storage.ts)
                          │  cola, cancelación, plazos      carpeta temporal por trabajo
                          ▼
                        Compatibilidad (src/core/compat.ts)
                          │  todo video termina en H.264 + AAC, sin importar el motor
                          ▼
                        Router (src/core/router.ts)
                          │  orden por plataforma + capacidad + salud, con respaldo
                          ▼
                        DownloadProvider (src/core/types.ts)
                          ├─ YtDlpProvider      video y audio en las 4 plataformas
                          ├─ GalleryDlProvider  imágenes y carruseles
                          └─ CobaltProvider     instancia propia de Cobalt por HTTP (opcional)
```

El cliente nunca sabe qué motor respondió. Recibe tipos normalizados (`MediaInfo`, calidades como `720`, formatos `mp3`/`m4a`) y códigos de error propios con su texto en español. Solo `/api/health` y los logs nombran motores.

### El contrato `DownloadProvider`

| Pedido original          | En el prototipo            | Por qué                                                                 |
|--------------------------|----------------------------|-------------------------------------------------------------------------|
| `getMetadata(url)`       | `inspect(target)`          | Los motores resuelven metadatos y formatos en la misma llamada.         |
| `getFormats(url)`        | `inspect(target).options`  | Se exponen calidades normalizadas, nunca ids de formato de un motor.   |
| `downloadVideo/Audio`    | `download({ kind })`       | Un solo método; `kind` es `video`, `audio` o `image`.                   |
| `cancel(job)`            | `AbortSignal` en `ctx`     | Los proveedores no guardan estado; el JobManager es dueño de los trabajos. |
| `healthCheck()`          | `healthCheck()`            | Igual. El router lo cachea 5 min y salta motores caídos.               |
| —                        | `capabilities(platform)`   | El router filtra por lo que cada motor sabe hacer en cada plataforma.  |

### Rutas por plataforma

Por defecto:

| Plataforma | Orden                              |
|------------|------------------------------------|
| YouTube    | yt-dlp → Cobalt                    |
| Instagram  | yt-dlp → gallery-dl → Cobalt       |
| TikTok     | yt-dlp → gallery-dl → Cobalt       |
| X          | yt-dlp → gallery-dl → Cobalt       |

Se cambian sin tocar código con `ROUTES="youtube=cobalt,yt-dlp;x=yt-dlp"`. Agregar un motor nuevo es escribir una clase que implemente `DownloadProvider` y registrarla en `buildApp`.

## Videos que se ven en iPhone

Instagram entrega los reels en VP9, y YouTube usa VP9 o AV1 por encima de 1080p. Los reproductores de Apple no abren esos códecs dentro de un `.mp4`. Después de cualquier motor, el servicio revisa cada video con ffprobe:

| Lo que llega                     | Qué se hace                                   |
|----------------------------------|-----------------------------------------------|
| H.264, o HEVC etiquetado `hvc1`  | Nada                                          |
| HEVC etiquetado `hev1`           | Solo se cambia la etiqueta, sin recodificar   |
| VP9, AV1, Opus, WebM…            | Se convierte a H.264 + AAC                    |

En un Mac usa el codificador por hardware (VideoToolbox), y en un servidor usa libx264. Un reel de 3 minutos en 1080p tarda unos 25 segundos.

## Política de limpieza

Ningún video se guarda de forma permanente. Todo vive en una carpeta temporal del sistema (`$TMPDIR/vena-downloader`), fuera del proyecto y de iCloud, con una subcarpeta por trabajo.

| Momento                                   | Qué pasa                                         | Ajuste                 |
|-------------------------------------------|--------------------------------------------------|------------------------|
| Al arrancar el servicio                   | Se borra toda la carpeta (restos de un cierre brusco) | —                  |
| Falla o se cancela                        | Se borra su carpeta al momento                   | —                      |
| Archivo listo y descargado completo       | Se borra 60 s después (margen para reintentar)   | `DELIVERED_GRACE_SEC`  |
| Archivo listo que nadie descarga          | Se borra a los 15 min                            | `READY_TTL_MIN`        |
| Trabajo que tarda demasiado               | Se corta y se borra a los 20 min                 | `JOB_TIMEOUT_MIN`      |
| Carpetas sin trabajo vivo                 | El barrido (cada 60 s) las borra tras 5 min      | `ORPHAN_GRACE_MIN`     |
| Disco temporal lleno                      | Se rechazan trabajos nuevos sobre 5 GB           | `QUOTA_MB`             |
| Archivo enorme                            | El motor se detiene sobre 2 GB                   | `MAX_FILE_MB`          |
| Al apagar (Ctrl+C / SIGTERM)              | Se detienen los motores y se borra todo          | —                      |

La carpeta raíz se valida: el servicio se niega a arrancar con una ruta corta o que no contenga "downloader", para que un error de configuración nunca borre otra cosa.

## Seguridad

- Escucha solo en `127.0.0.1`. `DOWNLOADER_TOKEN` exige `Authorization: Bearer …` si algún día se expone.
- Solo el OS puede usarlo desde el navegador: se rechazan otros orígenes, hosts que no sean `127.0.0.1`/`localhost` (protección contra *DNS rebinding*) y POST que no sean JSON (así otra página no puede disparar descargas con un formulario).
- Solo acepta enlaces de las cuatro plataformas: no es un proxy abierto ni descarga de cualquier sitio.
- Los motores se ejecutan con lista de argumentos y `--` antes de la URL: nada pasa por una shell.
- Las miniaturas se sirven a través del servicio, y solo las que devolvió un motor.
- Los nombres de archivo nunca vienen del cliente; los trabajos se identifican con UUID.
- Cookies de sesión (`COOKIES_FILE` o `COOKIES_FROM_BROWSER=chrome`) están apagadas por defecto.

## Configuración

| Variable               | Por defecto                        |
|------------------------|------------------------------------|
| `PORT` / `HOST`        | `4318` / `127.0.0.1`               |
| `CORS_ORIGINS`         | `http://localhost:5183,https://os.venadigital.com.co` |
| `YTDLP_BIN`, `GALLERYDL_BIN` | `.engines/bin/…`             |
| `YTDLP_JS_RUNTIME`     | el Node que corre el servicio      |
| `COBALT_URL`, `COBALT_API_KEY` | vacío (Cobalt apagado)     |
| `MAX_CONCURRENT` / `MAX_QUEUED` | `2` / `6`                 |
