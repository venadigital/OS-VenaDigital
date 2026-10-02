#!/usr/bin/env bash
# Quita el servicio de descargas de este Mac (código, motores y arranque automático).
set -euo pipefail
LABEL="co.venadigital.downloader"
APP="$HOME/Library/Application Support/Vena Downloader"
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/$LABEL.plist"
rm -rf "${APP:?}"
echo "Servicio de descargas desinstalado."
