#!/usr/bin/env bash
# Abre el perfil de Chrome con el que se cargan las webs, en una ventana normal, para
# iniciar sesión en un sitio o aceptar sus cookies. Esas sesiones quedan solo en ese perfil.
# Cierra la ventana antes de cargar una web desde el OS: el perfil no se abre dos veces.
set -euo pipefail

PROFILE="${CAPTURE_PROFILE:-$HOME/Library/Application Support/Vena Downloader/chrome-profile}"
mkdir -p "$PROFILE"
open -na "Google Chrome" --args --user-data-dir="$PROFILE" --no-first-run "${1:-about:blank}"
