#!/usr/bin/env bash
# Ejecutar en la terminal Linux del Codespace, con servidor y simulador detenidos.
set -euo pipefail

docker exec -u 0 cassandra sh -eu -c '
  config=/etc/cassandra/cassandra.yaml
  test -f "$config"
  grep -Eq "^authenticator:" "$config"
  grep -Eq "^authorizer:" "$config"
  grep -Eq "^role_manager:" "$config"
  # La copia se conserva en el contenedor. No se elimina ni recrea el contenedor.
  if [ ! -f "$config.antes-retos" ]; then cp -p "$config" "$config.antes-retos"; fi
  sed -i \
    -e "s/^authenticator:.*/authenticator: PasswordAuthenticator/" \
    -e "s/^authorizer:.*/authorizer: CassandraAuthorizer/" \
    -e "s/^role_manager:.*/role_manager: CassandraRoleManager/" "$config"
  grep -E "^(authenticator|authorizer|role_manager):" "$config"
'
docker restart cassandra
echo 'Espera el arranque: docker logs -f cassandra (Ctrl+C sale del registro).'
echo 'Despues entra con: docker exec -it cassandra cqlsh -u cassandra'
echo 'Si es la primera activacion, la clave inicial es cassandra. Cambiala en cqlsh.'
