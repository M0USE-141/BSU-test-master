# Deploy

Production deployment artifacts. See
[`docs/superpowers/specs/2026-05-28-postgres-minio-mail-migration-design.md`](../docs/superpowers/specs/2026-05-28-postgres-minio-mail-migration-design.md)
for the architectural context.

## Layout

```
deploy/
  shared/                    # one-time, one-per-VPS infrastructure
    docker-compose.yml       # caddy + postgres + minio
    Caddyfile                # reverse-proxy rules per subdomain
    init-databases.sh        # ONE-SHOT Postgres bootstrap on first start
    .env.example             # POSTGRES_ROOT_PASSWORD, MINIO_ROOT_*, DOMAIN
  testmaster/                # per-project stack — copy for siblings
    docker-compose.yml       # just `app`; joins shared networks
    .env.example             # SECRET_KEY, DATABASE_URL, S3_*, RESEND_API_KEY
  README.md                  # this file
```

`/srv/shared/` on the VPS = `deploy/shared/` here. `/srv/testmaster/` =
`deploy/testmaster/`. Other projects clone the testmaster directory.

## First deploy

```sh
# On the VPS:
sudo mkdir -p /srv && sudo chown $(id -un) /srv
git clone <repo> /tmp/testmaster
cp -r /tmp/testmaster/deploy/shared /srv/
cp -r /tmp/testmaster/deploy/testmaster /srv/
cp -r /tmp/testmaster /srv/testmaster/src

cd /srv/shared
cp .env.example .env
$EDITOR .env                                    # set DOMAIN, ACME_EMAIL, …
docker compose up -d
# init-databases.sh runs once — creates the testmaster db+role.

cd /srv/testmaster
cp .env.example .env
$EDITOR .env                                    # match DB_PASSWORD, set SECRET_KEY, …
docker compose up -d --build
docker compose exec app alembic upgrade head    # apply pg_initial
```

DNS: point `testmaster.<DOMAIN>`, `s3.<DOMAIN>`, `s3-console.<DOMAIN>`
at the VPS IP **before** the first start, or Let's Encrypt rate-limits
the initial issuance.

## Adding a project

```sh
cp -r /srv/testmaster /srv/myproject
bash /srv/testmaster/src/scripts/provision_project.sh myproject
$EDITOR /srv/myproject/.env                     # paste the DB / S3 creds the script printed
# Add a server block to /srv/shared/Caddyfile, then:
docker compose -f /srv/shared/docker-compose.yml exec caddy \
    caddy reload --config /etc/caddy/Caddyfile
docker compose -f /srv/myproject/docker-compose.yml up -d --build
```

## Updates

```sh
cd /srv/testmaster/src && git pull
docker compose -f /srv/testmaster/docker-compose.yml build app
docker compose -f /srv/testmaster/docker-compose.yml up -d --no-deps app
docker compose -f /srv/testmaster/docker-compose.yml exec app alembic upgrade head
```

Downtime is the ~5 s container restart. Caddy buffers in-flight requests.

## Verifying it's up

```sh
curl -sS https://testmaster.<DOMAIN>/api/health         # expect {"db":"ok","version":"..."}
docker compose -f /srv/shared/docker-compose.yml ps     # caddy/postgres/minio "healthy"
docker compose -f /srv/testmaster/docker-compose.yml ps # app "healthy"
```
