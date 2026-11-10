#!/bin/sh
# agy-memory hook launcher (macOS / Linux).
# Antigravity runs hook commands through `sh -c`; keep it dependency free.
DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec node "$DIR/hook.js" "$@"
