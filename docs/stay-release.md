# Rediseño Stay · integración en producción

Versión anterior: `734faced29581929ecfa462630314a2178dccb96`.

La capa visual incorpora Inicio con cronómetro y pendientes, vista de lista y favoritos de tableros, filtros de notas, búsqueda de proyectos/tareas, navegación móvil y diálogos accesibles. Los favoritos y la vista se guardan por ID de usuario en este navegador; no se sincronizan entre dispositivos. El modo demo continúa siendo efímero.

No hay migraciones ni cambios en las políticas de acceso, esquema, API de Supabase, colector, cálculos de tiempo/precios, almacenamiento de imágenes o serialización de Excalidraw. Se conservan el inicio de sesión real, exportación, configuración de PWA, variables de producción y flujo de publicación en Hostinger. La única extensión del contexto de cuenta expone el ID ya existente para separar preferencias.

## Validación

- Pruebas de esquema/seguridad de base de datos, colector y precios existentes.
- Pruebas de favoritos persistentes por cuenta, almacenamiento corrupto o bloqueado, sincronización de preferencias y modo demo efímero.
- Pruebas de captura: éxito, borrador retenido ante fallo y prevención de notas vacías.
- Compilación TypeScript y bundle con manifest/service worker de producción.
- Navegador sobre el bundle integrado en modo demo: completar/deshacer, cambiar cronómetro, crear/editar notas, lista/favoritos, crear/dibujar/guardar un tablero, búsqueda global y apertura de nueva tarea. Revisión clara/oscura y móvil de 390 px. Sin errores de consola durante esta revisión.
- Las pruebas de escritura en navegador usan datos demo; no sustituyen una comprobación autenticada de las escrituras reales en Supabase.

## Publicación y reversión

Publicar el commit validado en `main` activa `.github/workflows/deploy.yml`; verificar que el paso FTP termine correctamente y que el dominio sirva el nuevo CSS/JS y `sw.js`. Mantener el punto anterior con la etiqueta `pre-stay-redesign-2026-09-19`.

Si se detecta una regresión atribuible al rediseño, revertir su commit con `git revert <commit-del-rediseño>` en una rama de trabajo limpia y publicar el nuevo commit en `main`. El mismo workflow restaura el bundle anterior sin alterar la base de datos ni borrar preferencias guardadas. No usar reset forzado ni restaurar carpetas de diseño locales ajenas a esta entrega.
