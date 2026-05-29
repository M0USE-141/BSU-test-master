#!/bin/sh
# Provision a fresh local MinIO for the testmaster dev stack.
# Idempotent — re-runnable. Requires `mc` (run inside the minio container
# or install MinIO Client locally).
#
# Steps:
#   1. Wait for MinIO to be ready.
#   2. Create the two project buckets.
#   3. Create a project service-account with bucket-scoped policy.
#   4. Set CORS so `localhost:<spa-port>` can hit `localhost:9000` directly
#      (for presigned PUT/GET in dev).
#   5. Add lifecycle rule: imports/ expires after 24h.
#
# Usage (host with mc installed):
#   bash scripts/provision_minio_local.sh
#
# Usage (via docker exec):
#   docker compose -f docker-compose.dev.yml exec -T minio sh < scripts/provision_minio_local.sh

set -eu

ALIAS="${MINIO_ALIAS:-local}"
ENDPOINT="${MINIO_ENDPOINT:-http://localhost:9000}"
ROOT_USER="${MINIO_ROOT_USER:-minioadmin}"
ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-minioadmin}"

BUCKET_ASSETS="${BUCKET_ASSETS:-testmaster-assets}"
BUCKET_AVATARS="${BUCKET_AVATARS:-testmaster-avatars}"

APP_USER="${APP_USER:-testmaster_app}"
APP_PASSWORD="${APP_PASSWORD:-testmaster_app_secret}"

CORS_ORIGINS="${CORS_ORIGINS:-http://localhost:8000}"

echo ">>> Configuring mc alias '$ALIAS' -> $ENDPOINT"
mc alias set "$ALIAS" "$ENDPOINT" "$ROOT_USER" "$ROOT_PASSWORD" >/dev/null

# 1. Wait until MinIO accepts requests.
echo ">>> Waiting for MinIO..."
i=0
until mc ready "$ALIAS" >/dev/null 2>&1; do
    i=$((i + 1))
    if [ "$i" -ge 30 ]; then
        echo "!!! MinIO not ready after 30s, aborting" >&2
        exit 1
    fi
    sleep 1
done

# 2. Buckets.
for bucket in "$BUCKET_ASSETS" "$BUCKET_AVATARS"; do
    if mc ls "$ALIAS/$bucket" >/dev/null 2>&1; then
        echo ">>> Bucket '$bucket' already exists, skipping"
    else
        echo ">>> Creating bucket '$bucket'"
        mc mb "$ALIAS/$bucket"
    fi
done

# 3. Service-account with bucket-scoped policy.
POLICY_NAME="testmaster-app-policy"
POLICY_FILE="$(mktemp)"
cat >"$POLICY_FILE" <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket",
        "s3:GetBucketLocation"
      ],
      "Resource": [
        "arn:aws:s3:::$BUCKET_ASSETS",
        "arn:aws:s3:::$BUCKET_ASSETS/*",
        "arn:aws:s3:::$BUCKET_AVATARS",
        "arn:aws:s3:::$BUCKET_AVATARS/*"
      ]
    }
  ]
}
EOF
echo ">>> Creating/updating policy '$POLICY_NAME'"
mc admin policy create "$ALIAS" "$POLICY_NAME" "$POLICY_FILE" 2>/dev/null \
    || mc admin policy create "$ALIAS" "$POLICY_NAME" "$POLICY_FILE" \
    || true
rm -f "$POLICY_FILE"

if mc admin user info "$ALIAS" "$APP_USER" >/dev/null 2>&1; then
    echo ">>> User '$APP_USER' already exists, skipping creation"
else
    echo ">>> Creating user '$APP_USER'"
    mc admin user add "$ALIAS" "$APP_USER" "$APP_PASSWORD"
fi
mc admin policy attach "$ALIAS" "$POLICY_NAME" --user "$APP_USER" 2>/dev/null || true

# 4. CORS — allow presigned PUT/GET from SPA origin(s).
#    mc 2024+ syntax. If your mc is older, see https://min.io/docs.
echo ">>> Applying CORS for origins: $CORS_ORIGINS"
for bucket in "$BUCKET_ASSETS" "$BUCKET_AVATARS"; do
    mc anonymous set download "$ALIAS/$bucket/__never__" 2>/dev/null || true
    # CORS rules are applied to the bucket via JSON.
    CORS_FILE="$(mktemp)"
    cat >"$CORS_FILE" <<EOF
{
  "CORSRules": [
    {
      "AllowedOrigins": ["$CORS_ORIGINS"],
      "AllowedMethods": ["GET", "PUT", "HEAD"],
      "AllowedHeaders": ["*"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3600
    }
  ]
}
EOF
    # mc has no first-class CORS subcommand in all versions; fall back to
    # the JSON-policy `cors` endpoint via admin API if available.
    if mc cors set "$CORS_FILE" "$ALIAS/$bucket" 2>/dev/null; then
        echo "    CORS set on $bucket"
    else
        echo "    !!! mc cors set not supported in this client version; configure CORS via MinIO console (http://localhost:9001) or upgrade mc"
    fi
    rm -f "$CORS_FILE"
done

# 5. Lifecycle: imports/ expires after 24h.
echo ">>> Setting lifecycle: imports/ -> 1 day"
LIFECYCLE_FILE="$(mktemp)"
cat >"$LIFECYCLE_FILE" <<EOF
{
  "Rules": [
    {
      "ID": "expire-imports-24h",
      "Status": "Enabled",
      "Filter": {"Prefix": "imports/"},
      "Expiration": {"Days": 1}
    }
  ]
}
EOF
mc ilm import "$ALIAS/$BUCKET_ASSETS" <"$LIFECYCLE_FILE" 2>/dev/null \
    || echo "    !!! lifecycle import not supported on this mc, set via console"
rm -f "$LIFECYCLE_FILE"

echo
echo "OK: MinIO provisioned."
echo
echo "Add to your .env:"
echo "  STORAGE_BACKEND=s3"
echo "  S3_ENDPOINT=http://localhost:9000"
echo "  S3_PUBLIC_ENDPOINT=http://localhost:9000"
echo "  S3_ACCESS_KEY=$APP_USER"
echo "  S3_SECRET_KEY=$APP_PASSWORD"
echo "  S3_BUCKET_ASSETS=$BUCKET_ASSETS"
echo "  S3_BUCKET_AVATARS=$BUCKET_AVATARS"
