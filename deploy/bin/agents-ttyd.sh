#!/bin/bash
# Start one localhost ttyd bound to a read-only tmux attach.
# Port map must match deploy/nginx/agents.lentechra.com.conf.
set -euo pipefail

session="${1:?session name required}"

case "$session" in
  jane) port=7681 ;;
  atlas) port=7682 ;;
  miles) port=7683 ;;
  quinn) port=7684 ;;
  sage) port=7685 ;;
  rio) port=7686 ;;
  *)
    echo "unknown session: $session" >&2
    exit 1
    ;;
esac

exec ttyd \
  --interface 127.0.0.1 \
  --port "$port" \
  --base-path "/term/${session}" \
  /usr/local/bin/attach-readonly.sh "$session"
