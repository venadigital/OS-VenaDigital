# Vena OS

Sistema operativo personal de trabajo de Vena Digital. Funciona en el navegador y se instala en el iPhone como app (PWA).

| Módulo | Qué hace |
|---|---|
| **Inicio** | Resumen del día: cronómetro en curso, tiempo de hoy, consumo de IA del mes, notas fijadas y tableros recientes. Captura rápida de notas. |
| **Tiempo** | Proyectos → tareas → registros. Cronómetro único (si inicias otra tarea, la anterior se detiene). Vista por día, semana y mes, filtro por proyecto, edición de registros. Se sincroniza en vivo entre dispositivos. |
| **Consumo IA** | Tokens de Claude Code y Codex convertidos a USD a precio de API, por día, cuenta y modelo. Compara con lo que pagas en suscripciones. Precios editables. |
| **Tableros** | Pizarras con [Excalidraw](https://github.com/excalidraw/excalidraw) (MIT). Varios tableros, guardado automático y exportación a PNG. |
| **Notas** | Muro de post-its: por hacer, por investigar, links (con vista previa), notas e inspiración (con imágenes). |

La propuesta visual está en [`design/`](design/): los mockups se generan con `node design/build/index.mjs`.

## Stack

- React 19 + TypeScript + Vite + Tailwind CSS 4, PWA con `vite-plugin-pwa`.
- Supabase: Auth, Postgres con RLS, Realtime (cronómetro) y Storage (imágenes de notas).
- Colector local en Node (sin dependencias) para medir el consumo de IA desde el Mac.
- Build estático: se publica en cualquier plan de Hostinger.

## 1. Base de datos (Supabase)

1. Crea un proyecto en [supabase.com](https://supabase.com) (por ejemplo "vena-os").
2. Abre **SQL Editor**, pega [`supabase/setup.sql`](supabase/setup.sql) completo y dale **Run**. Crea las tablas, las políticas RLS, las funciones del cronómetro y del colector, el bucket de imágenes y la vista previa de links.
3. En **Authentication → URL Configuration** pon la URL donde vivirá la app (por ejemplo `https://os.venadigital.com`) como *Site URL* y agrégala a *Redirect URLs* (también `http://localhost:5173` para desarrollo).
4. Entra a la app y **crea tu cuenta** con tu correo. Luego, en **Authentication → Sign In / Providers**, desactiva *Allow new users to sign up* para que nadie más pueda registrarse.

> Las migraciones viven en `supabase/migrations/`. Si cambias alguna, regenera el archivo único con `npm run db:setup-sql`.

## 2. Variables de entorno

Copia `.env.example` como `.env.local` (desarrollo) y como `.env.production` (build). Los valores están en Supabase → **Project Settings → API**:

```
VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Ambos valores son públicos por diseño (van dentro del JavaScript). Lo que protege tus datos son las políticas RLS.

## 3. Desarrollo

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # pruebas de la base (Postgres en memoria) y del colector
npm run build      # genera dist/
```

¿Quieres verla sin Supabase? Abre `http://localhost:5173/?demo`: carga datos de ejemplo en memoria y no guarda nada.

## 4. Publicar en Hostinger

**Opción A: automática con GitHub Actions** (recomendada). Cada push a `main` corre las pruebas, hace el build y sube `dist/` por FTP.

1. En Hostinger → **Archivos → Cuentas FTP**, copia el servidor, usuario y contraseña FTP.
2. En GitHub → **Settings → Secrets and variables → Actions**, crea los secretos `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD` y, si la app no va en la raíz del dominio, `FTP_SERVER_DIR` (por defecto `public_html/`).
3. Crea también las *variables* `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`, o sube `.env.production` al repositorio.

**Opción B: manual.** Corre `npm run build` y sube el contenido de `dist/` a `public_html` con el Administrador de archivos. El `.htaccess` incluido hace que las rutas de la app funcionen y que las actualizaciones lleguen.

Activa el SSL gratuito del dominio en Hostinger: la PWA y el login necesitan HTTPS.

## 5. Colector de consumo IA (en tu Mac)

El colector lee `~/.claude/projects` (Claude Code) y `~/.codex` (Codex), anota qué cuenta de Claude tiene la sesión abierta (revisa cada 30 segundos) y sube los totales de tokens por día, cuenta y modelo cada 5 minutos. **Nunca sube el contenido de tus conversaciones.**

1. En la app: **Consumo IA → Conectar mi Mac → Generar token**.
2. En la carpeta del proyecto, corre los dos comandos que te muestra la app:

```bash
node collector/collector.mjs setup --url https://TU-PROYECTO.supabase.co --key sb_publishable_... --token vos_...
node collector/collector.mjs install
```

`install` deja un servicio de macOS (launchd) que arranca solo con el Mac. Más comandos:

```bash
node collector/collector.mjs sync --dry-run   # muestra qué subiría, sin subir nada
node collector/collector.mjs status           # cuenta activa, última subida, cambios de cuenta
node collector/collector.mjs uninstall        # detiene y quita el servicio
```

- **Varias cuentas de Claude:** si cambias de cuenta en Claude Code (cerrar e iniciar sesión), el colector registra el cambio con su hora y reparte el consumo en la cuenta correcta. En la app, registra cada cuenta con su correo en *Cuentas y suscripciones*.
- **Historial anterior al colector:** los registros viejos no dicen con qué cuenta se hicieron. Puedes asignarlos a una cuenta al configurar: `setup ... --history-account tu@correo.com`. Si no, aparecen como "Sin cuenta asignada".
- Si actualizas Node con otra ruta (por ejemplo con nvm), vuelve a correr `install`.

## Estructura

```
src/
  components/      shell (menú, barra inferior, búsqueda ⌘K) y kit de UI
  data/            API: Supabase y modo demo con la misma interfaz, hooks de React Query
  features/        home · tiempo · consumo · tableros · notas · ajustes · auth
  lib/             formato es-CO, rangos de fechas, precios y cálculo de costos
supabase/
  migrations/      esquema, RLS y funciones
  setup.sql        todo en un archivo para el SQL Editor
  tests/           pruebas del esquema con PGlite
collector/         colector local de Claude Code + Codex
design/            mockups de la propuesta visual
```

## Precios de referencia

La tabla inicial (USD por millón de tokens) sale de las páginas oficiales de Anthropic y OpenAI al 11 de septiembre de 2026. Las variantes `-codex` que no aparecen en la página de OpenAI usan el precio de su modelo base. Todo es editable desde **Consumo IA → Tabla de precios**; un modelo sin precio queda marcado y no suma al total.
