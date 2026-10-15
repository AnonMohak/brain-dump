#!/usr/bin/env bash
# Deploys one commit of Sift. The GitHub Action runs it over SSH:
#   tar -czf - dist | ssh deploy@<server> <commit sha>
# The Action's key can run only this command (forced command in authorized_keys).
# setup.sh installs it as /usr/local/bin/sift-deploy.
set -euo pipefail

APP=/opt/sift
SHA="${SSH_ORIGINAL_COMMAND:-${1:-}}"
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "Give a full commit sha, and the dist/ tarball on stdin." >&2; exit 2; }

exec 9>/tmp/sift-deploy.lock
flock 9

UPLOAD="$(mktemp -d)"
trap 'rm -rf "$UPLOAD"' EXIT
tar -xzf - -C "$UPLOAD"
[ -f "$UPLOAD/dist/index.html" ] || { echo "The upload has no dist/index.html." >&2; exit 1; }

cd "$APP"
PREVIOUS="$(git rev-parse HEAD)"

install_and_restart() {
  /usr/local/bin/bun install --frozen-lockfile --production --silent
  sudo /usr/bin/systemctl restart sift
}

healthy() {
  # 200, or 403 when ORIGIN_KEY is set (only the router gets through): both mean the server runs.
  for _ in $(seq 1 30); do
    code="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3001/api/health || true)"
    if [ "$code" = 200 ] || [ "$code" = 403 ]; then return 0; fi
    sleep 1
  done
  return 1
}

echo "Deploying $SHA (now at $PREVIOUS)"
git fetch --quiet origin
git checkout --quiet --force "$SHA"
rm -rf dist.previous
if [ -d dist ]; then mv dist dist.previous; fi
mv "$UPLOAD/dist" dist

if install_and_restart && healthy; then
  echo "Sift $SHA is running."
  exit 0
fi

echo "The new version did not start. Going back to $PREVIOUS." >&2
git checkout --quiet --force "$PREVIOUS"
if [ -d dist.previous ]; then rm -rf dist && mv dist.previous dist; fi
install_and_restart || true
exit 1
