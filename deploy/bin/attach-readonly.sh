#!/bin/bash
# Attach to an agent tmux session as a read-only client.
# Creates the session when it does not exist yet.
set -euo pipefail

session="${1:?session name required}"

if ! tmux has-session -t "$session" 2>/dev/null; then
  tmux new-session -d -s "$session"
fi

exec tmux attach -r -t "$session"
