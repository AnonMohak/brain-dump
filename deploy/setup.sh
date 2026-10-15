#!/usr/bin/env bash
# One-time server setup for Sift on Ubuntu 24.04 (Oracle Cloud Always Free).
# Run as root from a copy of this folder:  sudo bash setup.sh
# Optional values (environment):
#   DEPLOY_KEY    public SSH key of the GitHub Action (it can only run sift-deploy)
#   TUNNEL_TOKEN  token of the Cloudflare Tunnel (installs cloudflared as a service)
# Safe to run again: every step checks what is already there.
set -euo pipefail

REPO=https://github.com/AnonMohak/brain-dump.git
APP=/opt/sift
BUN_VERSION=1.3.14
HERE="$(cd "$(dirname "$0")" && pwd)"

[ "$(id -u)" = 0 ] || { echo "Run as root (sudo)." >&2; exit 1; }
export DEBIAN_FRONTEND=noninteractive

echo "== Packages"
apt-get update -q
apt-get install -y -q git curl unzip sqlite3 rclone unattended-upgrades

echo "== Swap (small VMs need it for bun install)"
if [ "$(awk '/MemTotal/ {print $2}' /proc/meminfo)" -lt 3000000 ] && ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "== Bun $BUN_VERSION"
if [ "$(/opt/bun/bin/bun --version 2>/dev/null)" != "$BUN_VERSION" ]; then
  curl -fsSL https://bun.sh/install | BUN_INSTALL=/opt/bun bash -s "bun-v$BUN_VERSION"
fi
ln -sf /opt/bun/bin/bun /usr/local/bin/bun

echo "== Users: sift runs the app, deploy updates the code"
id sift >/dev/null 2>&1 || useradd --system --home-dir /var/lib/sift --shell /usr/sbin/nologin sift
id deploy >/dev/null 2>&1 || useradd --create-home --shell /bin/bash deploy

echo "== Folders"
install -d -o sift -g sift -m 750 /var/lib/sift
install -d -o sift -g sift -m 700 /var/backups/sift
install -d -o root -g sift -m 750 /etc/sift
for file in sift.env backup.env; do
  [ -f "/etc/sift/$file" ] || install -o root -g sift -m 640 /dev/null "/etc/sift/$file"
done
install -d -o deploy -g deploy -m 755 "$APP"
[ -d "$APP/.git" ] || sudo -u deploy git clone --quiet "$REPO" "$APP"

echo "== Deploy command and its permissions"
install -o root -g root -m 755 "$HERE/sift-deploy.sh" /usr/local/bin/sift-deploy
echo 'deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart sift' > /etc/sudoers.d/sift-deploy
chmod 440 /etc/sudoers.d/sift-deploy
visudo -cq
if [ -n "${DEPLOY_KEY:-}" ]; then
  install -d -o deploy -g deploy -m 700 /home/deploy/.ssh
  echo "command=\"/usr/local/bin/sift-deploy\",restrict $DEPLOY_KEY" > /home/deploy/.ssh/authorized_keys
  chown deploy:deploy /home/deploy/.ssh/authorized_keys
  chmod 600 /home/deploy/.ssh/authorized_keys
fi

echo "== Services"
install -m 644 "$HERE/sift.service" "$HERE/sift-backup.service" "$HERE/sift-backup.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable sift.service sift-backup.timer
systemctl start sift-backup.timer

echo "== Cloudflare Tunnel"
if ! command -v cloudflared >/dev/null; then
  install -d -m 755 /usr/share/keyrings
  curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg -o /usr/share/keyrings/cloudflare-main.gpg
  echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' \
    > /etc/apt/sources.list.d/cloudflared.list
  apt-get update -q
  apt-get install -y -q cloudflared
fi
if [ -n "${TUNNEL_TOKEN:-}" ] && [ ! -f /etc/systemd/system/cloudflared.service ]; then
  cloudflared service install "$TUNNEL_TOKEN"
fi

echo "== Done. Next: fill /etc/sift/sift.env and backup.env, then deploy (GitHub Action)."
