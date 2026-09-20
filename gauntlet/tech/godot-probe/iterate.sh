#!/bin/bash
# One full agent iteration: (text files already edited) -> export -> serve -> screenshot
set -e
P=/home/user/campus-app/gauntlet/tech/godot-probe
OUT=${1:-$P/shots/iter.png}
"$P/bin/Godot_v4.5.1-stable_linux.x86_64" --headless --path "$P/project" --export-release "Web" ../web/index.html > "$P/logs/export.log" 2>&1
node "$P/shot.js" http://127.0.0.1:8791/index.html "$OUT" 30000 "${2:-8000}" > "$P/logs/shot.json" 2>&1
tail -n +1 "$P/logs/shot.json"
