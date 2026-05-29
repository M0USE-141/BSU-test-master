#!/bin/sh
# Runs ONCE the first time the postgres container's data directory is
# empty (Postgres convention for /docker-entrypoint-initdb.d/*).
# After that it's never re-run by Postgres — re-provision new projects
# with scripts/provision_project.sh against the live container.
#
# This file deliberately seeds only the testmaster project; additional
# projects use the provisioning script.

set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE ROLE testmaster_user WITH LOGIN PASSWORD '${TESTMASTER_DB_PASSWORD:-testmaster_dev_change_me}';
    CREATE DATABASE testmaster OWNER testmaster_user;
    GRANT ALL PRIVILEGES ON DATABASE testmaster TO testmaster_user;
EOSQL

echo "Created database 'testmaster' owned by 'testmaster_user'."
