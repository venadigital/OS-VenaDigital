#!/usr/bin/env bash
# Instala (o actualiza) el servicio de descargas en este Mac.
# Copia el código a ~/Library/Application Support (fuera de Documentos, que macOS
# protege para procesos en segundo plano), prepara los motores y lo deja
# arrancando solo al iniciar sesión. Volver a correrlo actualiza todo.
set -euo pipefail

LABEL="co.venadigital.downloader"
SRC="$(cd "$(dirname "$0")/.." && pwd)"
APP="$HOME/Library/Application Support/Vena Downloader"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/vena-downloader.log"
PORT="${PORT:-4318}"

need() { command -v "$1" >/dev/null 2>&1 || { echo "Falta $1: $2" >&2; exit 1; }; }
need node "instala Node 22.18 o superior"
need ffmpeg "instala ffmpeg (https://evermeet.cx/ffmpeg/)"
need ffprobe "instala ffprobe junto a ffmpeg"
need uv "instala uv (https://docs.astral.sh/uv/)"
NODE="$(command -v node)"; FFMPEG="$(command -v ffmpeg)"; UV="$(command -v uv)"
node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>22||(a===22&&b>=18)?0:1)' \
  || { echo "Node $(node -v) es muy viejo: se necesita 22.18 o superior" >&2; exit 1; }

echo "→ Copiando el servicio a $APP"
mkdir -p "$APP/app" "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
rsync -a --delete --exclude '.engines' --exclude 'node_modules' --exclude 'test' --exclude 'scripts' "$SRC/" "$APP/app/"

echo "→ Preparando motores (yt-dlp, gallery-dl)"
[ -x "$APP/engines/bin/python" ] || "$UV" venv "$APP/engines" --python 3.12 -q
"$UV" pip install -q --upgrade --python "$APP/engines/bin/python" "yt-dlp[default]" gallery-dl
date -u +%FT%TZ > "$APP/engines/.last-update"

echo "→ Registrando el arranque automático"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>$NODE</string><string>$APP/app/src/server.ts</string></array>
  <key>WorkingDirectory</key><string>$APP/app</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$(dirname "$FFMPEG"):$(dirname "$NODE"):/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>PORT</key><string>$PORT</string>
    <key>ENGINES_DIR</key><string>$APP/engines</string>
    <key>UV_BIN</key><string>$UV</string>
    <key>FFMPEG_BIN</key><string>$FFMPEG</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
PLIST

# Stop the previous instance and wait until launchd has really let it go.
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
for _ in $(seq 1 20); do launchctl print "gui/$(id -u)/$LABEL" >/dev/null 2>&1 || break; sleep 0.5; done
launchctl bootstrap "gui/$(id -u)" "$PLIST"

echo -n "→ Esperando al servicio"
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then echo " listo."; break; fi
  echo -n "."; sleep 1
done
curl -fsS "http://127.0.0.1:$PORT/api/health" || { echo; echo "No respondió. Revisa $LOG" >&2; exit 1; }
echo
echo "Servicio activo en http://127.0.0.1:$PORT · registro en $LOG"
