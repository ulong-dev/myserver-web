#!/bin/zsh
set -euo pipefail

project_root='/Users/2pfamily/Library/Mobile Documents/com~apple~CloudDocs/myserver'
cd "$project_root"

/usr/local/bin/node scripts/build-private-site.mjs
/usr/local/bin/node scripts/verify-private-site.mjs _private_site

exec /usr/local/bin/python3 scripts/serve-private-site.py \
  --bind 10.232.53.87 \
  --port 8443 \
  --directory "$project_root/_private_site" \
  --certificate /Users/2pfamily/.config/myserver/zerotier/tls/server.crt \
  --private-key /Users/2pfamily/.config/myserver/zerotier/tls/server.key \
  --proxy-config /Users/2pfamily/.config/myserver/zerotier/proxy-config.json
