#!/bin/bash
# Create one detached tmux session per powered-on computer.
set -euo pipefail

sessions=(jane atlas miles quinn sage rio)

for session in "${sessions[@]}"; do
  if ! tmux has-session -t "$session" 2>/dev/null; then
    tmux new-session -d -s "$session"
  fi
done
