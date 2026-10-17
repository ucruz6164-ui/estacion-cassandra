# Estacion Cassandra: los tres retos

Este proyecto contiene la solucion base del ZIP que proporcionaste y los cambios
para los tres retos de la pagina 33 de tu guia. Los datos de los sensores siguen
siendo simulados. El codigo esta preparado para el Codespace de la practica.

## Que incluye cada reto

| Reto | Resultado | Archivos principales |
|---|---|---|
| 1. Resumen diario | Minima, maxima, promedio y cantidad por sensor y dia; visible en el tablero | `cql/retos.cql`, `app/retos.js`, `app/resumen-diario.js`, `app/web/index.html`, `app/servidor.js` |
| 2. Alertas por sensor | Guardado en otra tabla, API por varios dias y pagina Alertas | `app/bd.js`, `cql/retos.cql`, `app/retos.js`, `app/web/alertas.html`, `app/web/app.js`, `app/servidor.js` |
| 3. Autenticacion y permisos | Configuracion del contenedor, rol `app_estacion` y conexion con `authProvider` | `scripts/activar-auth.sh`, `cql/permisos.cql`, `app/bd.js`, `app/.env.example`, `.gitignore` |

Tambien se agregaron `app/migrar-alertas.js` para copiar alertas anteriores y
`app/test/retos.test.js` con pruebas sin una base de datos real. Se corrigio el
comando `npm run historico`, que en el ZIP apuntaba a un archivo inexistente.

## 1. Coloca los archivos en el repositorio

Descomprime `estacion-cassandra-3-retos.zip`. Dentro esta la carpeta
`estacion-cassandra`. Sube **su contenido** a la raiz de tu repositorio:

```text
README.md
.gitignore
.gitattributes
cql/
app/
scripts/
```

Si ya tienes el proyecto en GitHub, conserva tus cambios personales y sustituye
los archivos correspondientes con los de esta version. No subas el ZIP como
un solo archivo. Despues abre o reabre tu Codespace.

Todos los comandos siguientes son para la **terminal Linux de Codespaces**.
El CQL se escribe dentro de `cqlsh>`. Las contrasenas se eligen al hacer el reto 3.

## 2. Comprueba el entorno y Cassandra

En la raiz del repositorio:

```bash
node --version
docker ps -a
```

Utiliza Node.js **22 o 24**. Si tu Codespace tiene otra version y dispone de nvm:

```bash
nvm install 22
nvm use 22
```

Si ya existe el contenedor `cassandra` pero esta detenido:

```bash
docker start cassandra
```

Solo si **no existe** ese contenedor, crealo:

```bash
docker run -d --name cassandra -p 9042:9042 -e MAX_HEAP_SIZE=1G -e HEAP_NEWSIZE=256M --restart unless-stopped cassandra:5.0
```

Espera el arranque:

```bash
docker logs -f cassandra
```

Cuando aparezca que escucha clientes CQL, presiona Ctrl+C. Esto cierra la vista
del registro. No elimina ni detiene Cassandra.

Si aun no has creado las cinco tablas de la practica base:

```bash
docker exec -i cassandra cqlsh < cql/esquema.cql
```

Si ya hiciste la practica base, no necesitas repetir ese archivo: sus INSERT
vuelven a establecer los nombres y umbrales originales de los sensores.

Estas instrucciones suponen que todavia no activaste la autenticacion. Si ya
la activaste, ejecuta los cambios de esquema dentro de cqlsh con tu administrador.

## 3. Agrega las tablas de los retos

Deten con Ctrl+C el servidor y el simulador si estan funcionando. Desde la raiz:

```bash
docker exec -i cassandra cqlsh < cql/retos.cql
docker exec -it cassandra cqlsh
```

Dentro de cqlsh:

```sql
USE estacion;
DESCRIBE TABLES;
DESCRIBE TABLE resumen_por_dia;
DESCRIBE TABLE alertas_por_sensor_dia;
```

Deben aparecer **siete tablas**: las cinco originales y las dos nuevas.
Sal con `exit`.

Si Cassandra ya requiere autenticacion, copia el archivo al contenedor:

```bash
docker cp cql/retos.cql cassandra:/tmp/retos-estacion.cql
docker exec -it cassandra cqlsh -u cassandra
```

Escribe la clave de administrador cuando la pida y luego:

```sql
SOURCE '/tmp/retos-estacion.cql';
```

Si elegiste otro nombre para el administrador, utilizalo en lugar de `cassandra`.
El rol de la aplicacion no tiene permiso para crear tablas.

## 4. Instala la dependencia

Desde la raiz:

```bash
cd app
npm install
cp .env.example .env
npm test
```

Si ya tienes un `.env`, conservalo en lugar de ejecutar `cp`.
Antes de activar autenticacion, deja vacios `CASSANDRA_USER` y
`CASSANDRA_PASSWORD`. Si tu Cassandra ya pide clave, completa ambos con el
rol de aplicacion que hayas creado.

Las pruebas usan un controlador simulado. No conectan con Cassandra ni cambian
tus datos. Las comprobaciones reales estan en los pasos siguientes.

## 5. Reto 1: genera y muestra el resumen diario

Desde `app`, si todavia no tienes lecturas:

```bash
npm run historico
```

Si ya tienes historico, aprovechalo; no hace falta volver a generarlo.
Calcula los resumenes:

```bash
npm run resumenes
```

El script encuentra las particiones existentes y lee **todas las paginas** de cada
una. Calcula minima, maxima y promedio sin limitarse a las primeras 5000 filas.
No modifica el historial ni los contadores. Puedes repetirlo: reemplaza el resumen
de la misma llave `(sensor, dia)`.

En otra terminal, desde la raiz:

```bash
cd app
npm run servidor
```

Abre el puerto 3000 y busca **Resumen diario**. Selecciona un dia que aparezca
en la salida del script y presiona **Consultar resumen**.

La tabla muestra minima, maxima, promedio, cantidad y fecha de calculo. Es un
resumen hasta su ultimo calculo: despues de agregar lecturas, vuelve a ejecutar
`npm run resumenes` y presiona el boton para consultar los resultados nuevos.

Para verificarlo en cqlsh (sustituye la fecha por una con datos):

```sql
SELECT * FROM estacion.resumen_por_dia
WHERE sensor = 'uthh-03';

SELECT MIN(temperatura), MAX(temperatura), AVG(temperatura), COUNT(*)
FROM estacion.lecturas_por_sensor_dia
WHERE sensor = 'uthh-03' AND dia = '2026-10-16';
```

Usa un dia historico o deten el simulador para que no cambien los datos entre
el calculo y la comprobacion. Las agregaciones de esta comprobacion leen una
particion; el script implementa el calculo leyendo sus filas.

**Evidencia sugerida:** estructura de `resumen_por_dia`, salida del script,
consulta de comprobacion y captura del resumen en el tablero.

## 6. Reto 2: recupera y consulta las alertas por sensor

Si ya tenias alertas de la practica base, desde `app` ejecuta:

```bash
npm run migrar-alertas
```

Este script copia las alertas originales desde `alertas_por_dia` a
`alertas_por_sensor_dia`. Conserva hora, mensaje y temperatura; no regenera
lecturas aleatorias ni incrementa contadores. Repetirlo sobrescribe las mismas
llaves y no duplica alertas.

Las lecturas nuevas se escriben automaticamente en ambas tablas de alertas
cuando `temperatura > temp_max`. El contador sigue fuera del BATCH.

Con el servidor funcionando, abre **Registrar** y envia:

- Sensor: Explanada (`uthh-03`).
- Temperatura: 40.
- Humedad: 60.

Despues entra a **Alertas**, elige Explanada, un periodo de siete dias y pulsa
**Consultar alertas**. La lectura recien registrada debe aparecer. El dia final
esta incluido. Los dias se interpretan con el calendario de la estacion en Mexico.

La nueva API es:

```text
GET /api/sensores/uthh-03/alertas?dias=7&limite=100
GET /api/sensores/uthh-03/alertas?dias=7&hasta=2026-10-16&limite=100
```

Acepta de 1 a 31 dias y un limite global de 1 a 500 alertas. Entrega primero
las mas recientes. No necesita `ALLOW FILTERING`.

**Justificacion de la llave:** `PRIMARY KEY ((sensor, dia), hora)` agrupa las
alertas de un sensor en un dia y las ordena por hora descendente. Para N dias,
la API consulta como maximo N particiones conocidas. Agregar el dia evita que
una unica particion por sensor crezca indefinidamente. Este es un diseno
propuesto para resolver la pregunta del reto.

Comprueba en cqlsh usando la fecha de la lectura:

```sql
SELECT * FROM estacion.alertas_por_sensor_dia
WHERE sensor = 'uthh-03' AND dia = '2026-10-16';
```

**Evidencia sugerida:** tabla y llave, alerta guardada, respuesta de la API o
pagina Alertas y explicacion de por que se eligio esa llave.

## 7. Reto 3: activa autenticacion y autorizacion

Primero deten servidor y simulador con Ctrl+C y sal de las sesiones de cqlsh.
Desde la raiz del repositorio ejecuta:

```bash
bash scripts/activar-auth.sh
docker logs -f cassandra
```

El script guarda una copia de la configuracion en el contenedor y establece:

```yaml
authenticator: PasswordAuthenticator
authorizer: CassandraAuthorizer
role_manager: CassandraRoleManager
```

Despues reinicia **el mismo contenedor**. No ejecuta `docker rm` ni recrea tus
datos. La copia previa queda en `/etc/cassandra/cassandra.yaml.antes-retos`.

Las tres opciones son necesarias para esta configuracion. En particular,
`CassandraAuthorizer` hace que se apliquen los permisos de los roles.
Esta practica usa un solo nodo: se conserva replica 1 en `system_auth`.

Cuando termine el arranque, sal del registro con Ctrl+C y entra:

```bash
docker exec -it cassandra cqlsh -u cassandra
```

En la primera activacion, la clave inicial es `cassandra`. Si ya la cambiaste,
utiliza la que elegiste. Puede tardar un poco en quedar listo el acceso inicial;
si aun no acepta conexiones, revisa el registro y vuelve a intentarlo.

En cqlsh, **reemplaza los textos REEMPLAZA... por dos claves elegidas por ti**:

```sql
CREATE ROLE app_estacion
WITH PASSWORD = 'REEMPLAZA_POR_TU_CLAVE_APP'
AND LOGIN = true
AND SUPERUSER = false;

GRANT SELECT ON KEYSPACE estacion TO app_estacion;
GRANT MODIFY ON KEYSPACE estacion TO app_estacion;
LIST ALL PERMISSIONS OF app_estacion;

ALTER ROLE cassandra WITH PASSWORD = 'REEMPLAZA_POR_TU_CLAVE_ADMIN';
```

Conserva la clave de administrador para futuros cambios de esquema. Si el rol
`app_estacion` ya existia, en lugar de repetir CREATE ROLE utiliza ALTER ROLE
para establecer su clave y comprueba que no sea superusuario ni tenga otros
roles/permisos heredados. Para un rol nuevo, los dos GRANT anteriores son sus
unicos permisos de datos. `cql/permisos.cql` conserva esos GRANT sin contrasenas.

Sal con `exit` y prueba el rol de aplicacion:

```bash
docker exec -it cassandra cqlsh -u app_estacion
```

Escribe la clave de aplicacion y ejecuta:

```sql
SELECT * FROM estacion.sensores;
CREATE TABLE estacion.prueba_permisos (id int PRIMARY KEY);
```

El SELECT debe funcionar. El CREATE TABLE debe dar **Unauthorized** porque
no concediste CREATE. Si se crea la tabla, revisa `CassandraAuthorizer` y los
permisos: esa prueba no esta cumplida. No uses DROP sobre tablas de la practica
para probar las restricciones.

Sal de cqlsh. Edita `app/.env` en el editor del Codespace:

```dotenv
CASSANDRA_HOSTS=127.0.0.1
CASSANDRA_DATACENTER=datacenter1
CASSANDRA_USER=app_estacion
CASSANDRA_PASSWORD="REEMPLAZA_POR_TU_CLAVE_APP"
```

Escribe la misma clave que asignaste al rol. El codigo carga `.env` mediante
Node.js y utiliza `new cassandra.auth.PlainTextAuthProvider(...)` en `bd.js`.
El navegador no recibe la clave. Si usas variables exportadas en la terminal,
esas variables tienen prioridad sobre `.env`.

## 8. Prueba la aplicacion con el rol

Desde `app`, en una terminal:

```bash
npm run servidor
```

En otra terminal, tambien dentro de `app`:

```bash
npm run simulador
```

El simulador debe escribir lecturas sin errores de permisos. En la web,
registra una lectura de 40 grados en Explanada y comprueba que aparece en
Alertas. Esto comprueba tambien el permiso de escritura del rol.

En otra terminal, recalcula con ese mismo rol:

```bash
cd app
npm run resumenes
```

Presiona **Consultar resumen** en el tablero. Si acabas de cambiar permisos,
espera unos segundos y vuelve a conectar los clientes para repetir la prueba.

**Evidencia sugerida:** las tres opciones de autenticacion/autorizacion,
permisos del rol, SELECT permitido, CREATE rechazado y aplicacion funcionando.
No incluyas contrasenas en capturas ni en el repositorio.

El rol protege la conexion entre la aplicacion y Cassandra. La web conserva el
acceso de la practica base: no se agrego un inicio de sesion para visitantes.
Manten privado el puerto 9042. Publica 3000 solo cuando necesites probar
desde el celular y devuelvelo a Private al terminar.

## 9. Guarda los cambios y documenta los retos

Sube los cambios mediante Control de codigo fuente del Codespace. Conserva
`.gitignore` y verifica que `.env`, archivos locales de claves y `node_modules`
no aparezcan entre los cambios. Si se genera `app/package-lock.json` con
`npm install`, guardalo tambien para registrar las versiones instaladas.

Agrega al PDF de entrega las evidencias de cada reto y sus explicaciones,
ademas de las evidencias y reflexiones de la practica base. La guia asigna
cinco puntos extra a cada uno de estos retos.

## Comprobaciones realizadas al preparar estos archivos

- Ocho pruebas automatizadas con datos controlados y controlador simulado.
- Comprobacion de sintaxis de los JavaScript y los scripts incluidos en HTML.
- Comprobacion de referencias a elementos HTML e identificadores duplicados.
- Comprobacion sintactica del script Bash de configuracion.

No se ejecuto Cassandra en este equipo, por lo que la creacion real de tablas,
el reinicio del contenedor y los permisos deben comprobarse en tu Codespace
con los pasos anteriores. Las pruebas simuladas no sustituyen esa comprobacion.

## Referencias

- Guia proporcionada: retos opcionales de la pagina 33.
- [Autenticacion y autorizacion en Cassandra](https://cassandra.apache.org/doc/stable/cassandra/managing/operating/security.html).
- [Roles y permisos CQL](https://cassandra.apache.org/doc/latest/cassandra/developing/cql/security.html).
- [Controlador Node.js de Apache Cassandra](https://github.com/apache/cassandra-nodejs-driver).
- [Variables de entorno de Node.js](https://nodejs.org/api/environment_variables.html).
