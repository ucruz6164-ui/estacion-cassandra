-- Ejecutar despues de esquema.cql y antes de arrancar el codigo modificado.
USE estacion;

-- Reto 1: una particion por sensor, con sus resumenes ordenados por dia.
-- Consulta: SELECT ... WHERE sensor = ? AND dia = ? (o un rango de dias).
CREATE TABLE IF NOT EXISTS resumen_por_dia (
  sensor text,
  dia date,
  temp_min double,
  temp_max double,
  temp_promedio double,
  total int,
  actualizado timestamp,
  PRIMARY KEY ((sensor), dia)
) WITH CLUSTERING ORDER BY (dia DESC);

-- Reto 2: un sensor en un dia es una particion; hora ordena las alertas.
-- Para los ultimos N dias se consultan N particiones, sin ALLOW FILTERING.
CREATE TABLE IF NOT EXISTS alertas_por_sensor_dia (
  sensor text,
  dia date,
  hora timestamp,
  temperatura float,
  mensaje text,
  PRIMARY KEY ((sensor, dia), hora)
) WITH CLUSTERING ORDER BY (hora DESC);
