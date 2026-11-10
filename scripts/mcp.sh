#!/bin/sh
# agy-memory MCP stdio server launcher (macOS / Linux).
DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec node "$DIR/server.js"
