#!/usr/bin/env bash
# Installation unique par machine, partagée par tous les projets :
#   - venv Python + piper-tts (TTS local, hors ligne)
#   - voix Piper (dépôt public rhasspy/piper-voices)
#   - Chromium pour Playwright
# Dossier : $VIDEO_STUDIO_HOME, sinon ${XDG_CACHE_HOME:-~/.cache}/video-studio.
# Usage : video-studio setup [voix supplémentaire, ex. de_DE-thorsten-medium]
# Le « Chrome Headless Shell » de Remotion est installé ensuite par la CLI
# (dans node_modules/.remotion du projet courant).
set -euo pipefail
HOME_DIR="${VIDEO_STUDIO_HOME:-${XDG_CACHE_HOME:-$HOME/.cache}/video-studio}"
PIPER_VERSION="1.8.0"
VOICES=(fr_FR-siwis-medium fr_FR-tom-medium en_GB-alba-medium "$@")

for bin in python3 ffmpeg ffprobe; do
  command -v "$bin" >/dev/null || { echo "✗ $bin introuvable (ex. sudo apt install python3-venv ffmpeg)"; exit 1; }
done
mkdir -p "$HOME_DIR/models"
echo "→ Dossier des voix : $HOME_DIR"
if [ ! -x "$HOME_DIR/.venv/bin/python" ]; then
  echo "→ Création du venv"
  python3 -m venv "$HOME_DIR/.venv"
fi
echo "→ piper-tts ${PIPER_VERSION}"
"$HOME_DIR/.venv/bin/pip" install -q "piper-tts==${PIPER_VERSION}"
for v in "${VOICES[@]}"; do
  [ -z "$v" ] && continue
  if [ -f "$HOME_DIR/models/${v}.onnx" ] && [ -f "$HOME_DIR/models/${v}.onnx.json" ]; then
    echo "✓ voix ${v}"
  else
    echo "→ téléchargement de la voix ${v} (~63 Mo)"
    "$HOME_DIR/.venv/bin/python" -m piper.download_voices --data-dir "$HOME_DIR/models" "$v"
  fi
done
echo "→ Chromium pour Playwright"
npx --yes playwright install chromium
echo "✓ video-studio prêt."
