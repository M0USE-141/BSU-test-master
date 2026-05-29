#!/bin/sh
# Provision DB + MinIO resources for a new per-project stack.
#
# Idempotent — re-running against existing resources is fine. Run from
# any host with access to the shared stack's containers (typically the
# server hosting them, or via `docker context`).
#
# Usage:
#   bash scripts/provision_project.sh <project_name>
#
# Examples:
#   bash scripts/provision_project.sh testmaster      # already created by init-databases.sh
#   bash scripts/provision_project.sh mynewproject    # creates db, role, buckets, policy, account
#
# Required env (typically read from deploy/shared/.env):
#   POSTGRES_ROOT_PASSWORD, MINIO_ROOT_USER, MINIO_ROOT_PASSWORD
# Optional override:
#   <PROJECT>_DB_PASSWORD, <PROJECT>_S3_SECRET — set explicitly or auto-generated.
#   CORS_ORIGINS — comma-separated origins permitted by MinIO bucket CORS.

set -eu

if [ "$#" -lt 1 ]; then
    echo "Usage: $0 <project_name>" >&2
    exit 1
fi

PROJECT="$1"

# Validate — only [a-z0-9_]+ to avoid SQL-injection in CREATE ROLE etc.
case "$PROJECT" in
    *[!a-z0-9_]*)
        echo "Project name must match [a-z0-9_]+ (got: $PROJECT)" >&2
        exit 1
        ;;
esac

# Names derived from PROJECT.
DB_NAME="$PROJECT"
DB_ROLE="${PROJECT}_user"
BUCKET_ASSETS="${PROJECT}-assets"
BUCKET_AVATARS="${PROJECT}-avatars"
APP_USER="${PROJECT}_app"
POLICY_NAME="${PROJECT}-app-policy"

# Reusable secrets — pull from env if caller set them, else generate.
DB_PW="${PROJECT_DB_PASSWORD:-$(openssl rand -hex 24)}"
S3_SECRET="${PROJECT_S3_SECRET:-$(openssl rand -hex 24)}"
CORS_ORIGINS="${CORS_ORIGINS:-https://${PROJECT}.${DOMAIN:-example.uz}}"

# ---------- Postgres ----------
echo ">>> Postgres: create database '$DB_NAME' and role '$DB_ROLE' (if missing)"
docker compose -f /srv/shared/docker-compose.yml exec -T postgres \
    psql -v ON_ERROR_STOP=1 -U postgres -d postgres <<SQL || true
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '$DB_ROLE') THEN
        CREATE ROLE $DB_ROLE WITH LOGIN PASSWORD '$DB_PW';
    END IF;
END
\$\$;
SELECT 'CREATE DATABASE $DB_NAME OWNER $DB_ROLE'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$DB_NAME')\gexec
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_ROLE;
SQL

# ---------- MinIO ----------
echo ">>> MinIO: ensure buckets, policy, and service-account"
docker compose -f /srv/shared/docker-compose.yml exec -T minio sh <<EOSH
set -e
mc alias set local http://127.0.0.1:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null

# Buckets.
mc mb -p "local/$BUCKET_ASSETS" 2>/dev/null || echo "  $BUCKET_ASSETS already exists"
mc mb -p "local/$BUCKET_AVATARS" 2>/dev/null || echo "  $BUCKET_AVATARS already exists"

# Policy scoped to the project's buckets.
cat >/tmp/policy.json <<POL
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject","s3:PutObject","s3:DeleteObject","s3:ListBucket","s3:GetBucketLocation"],
      "Resource": [
        "arn:aws:s3:::$BUCKET_ASSETS",
        "arn:aws:s3:::$BUCKET_ASSETS/*",
        "arn:aws:s3:::$BUCKET_AVATARS",
        "arn:aws:s3:::$BUCKET_AVATARS/*"
      ]
    }
  ]
}
POL
mc admin policy create local "$POLICY_NAME" /tmp/policy.json 2>/dev/null || true

# Service-account.
mc admin user info local "$APP_USER" >/dev/null 2>&1 \
    || mc admin user add local "$APP_USER" "$S3_SECRET"
mc admin policy attach local "$POLICY_NAME" --user "$APP_USER" 2>/dev/null || true

# Lifecycle: imports/ TTL 24h on the assets bucket.
cat >/tmp/lifecycle.json <<LIF
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
LIF
mc ilm import "local/$BUCKET_ASSETS" </tmp/lifecycle.json 2>/dev/null \
    || echo "  ilm import unsupported by this mc version, skipping"

# CORS — let the SPA PUT presigned URLs from the configured origin.
cat >/tmp/cors.json <<COR
{
  "CORSRules": [
    {
      "AllowedOrigins": ["$CORS_ORIGINS"],
      "AllowedMethods": ["GET","PUT","HEAD"],
      "AllowedHeaders": ["*"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3600
    }
  ]
}
COR
mc cors set /tmp/cors.json "local/$BUCKET_ASSETS" 2>/dev/null \
    || echo "  cors set unsupported by this mc version, configure via console"

rm -f /tmp/policy.json /tmp/lifecycle.json /tmp/cors.json
EOSH

cat <<SUMMARY

OK: '$PROJECT' provisioned.

Add to /srv/$PROJECT/.env:
  DATABASE_URL=postgresql+psycopg2://$DB_ROLE:$DB_PW@postgres:5432/$DB_NAME
  S3_ACCESS_KEY=$APP_USER
  S3_SECRET_KEY=$S3_SECRET
  S3_BUCKET_ASSETS=$BUCKET_ASSETS
  S3_BUCKET_AVATARS=$BUCKET_AVATARS

Then add a Caddy block for $PROJECT.$DOMAIN to /srv/shared/Caddyfile
and reload Caddy:
  docker compose -f /srv/shared/docker-compose.yml exec caddy caddy reload --config /etc/caddy/Caddyfile
SUMMARY
