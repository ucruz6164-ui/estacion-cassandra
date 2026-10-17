-- Reto 3. Ejecutar como administrador DESPUES de crear app_estacion.
-- La contrasena se elige en cqlsh, no se guarda en este archivo.
GRANT SELECT ON KEYSPACE estacion TO app_estacion;
GRANT MODIFY ON KEYSPACE estacion TO app_estacion;
LIST ALL PERMISSIONS OF app_estacion;
