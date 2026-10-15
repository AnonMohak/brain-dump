#!/usr/bin/env bash
# Nightly Sift backup (sift-backup.timer): a consistent SQLite copy, kept 14 days
# on the server and 30 days in Cloudflare R2. R2 values come from /etc/sift/backup.env.
set -euo pipefail

DB=/var/lib/sift/sift.db
DIR=/var/backups/sift
NAME="sift-$(date -u +%Y-%m-%d-%H%M).db"

[ -f "$DB" ] || { echo "No database at $DB yet."; exit 0; }
sqlite3 "$DB" ".backup '$DIR/$NAME'"
[ "$(sqlite3 "$DIR/$NAME" 'PRAGMA integrity_check;')" = ok ] || { echo "The copy failed the integrity check." >&2; exit 1; }
gzip -f "$DIR/$NAME"
find "$DIR" -name 'sift-*.db.gz' -mtime +14 -delete
echo "Saved $DIR/$NAME.gz"

if [ -n "${R2_BUCKET:-}" ]; then
  export RCLONE_CONFIG_R2_TYPE=s3 RCLONE_CONFIG_R2_PROVIDER=Cloudflare RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true
  export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
  export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
  export RCLONE_CONFIG_R2_ENDPOINT="https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com"
  rclone copy "$DIR/$NAME.gz" "r2:$R2_BUCKET/"
  rclone delete --min-age 30d "r2:$R2_BUCKET/"
  echo "Copied to R2 bucket $R2_BUCKET"
fi
