// Consultas y calculos de los retos 1 y 2. No usa ALLOW FILTERING ni JOIN.
const { KS, LocalDate, diaLocal, ejecutar, leerSensores } = require("./bd");

function validarDia(dia) {
  if (typeof dia !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dia)) {
    throw new Error("El dia debe tener formato AAAA-MM-DD");
  }
  const fecha = new Date(dia + "T12:00:00Z");
  if (!Number.isFinite(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== dia) {
    throw new Error("El dia no existe en el calendario");
  }
  return dia;
}

function entero(valor, defecto, maximo, nombre) {
  const n = valor === null || valor === undefined || valor === "" ? defecto : Number(valor);
  if (!Number.isInteger(n) || n < 1 || n > maximo) {
    throw new Error(`${nombre} debe ser un entero entre 1 y ${maximo}`);
  }
  return n;
}

function desplazarDia(dia, desplazamiento) {
  const fecha = new Date(validarDia(dia) + "T12:00:00Z");
  fecha.setUTCDate(fecha.getUTCDate() + desplazamiento);
  return fecha.toISOString().slice(0, 10);
}

// stream lee TODAS las paginas, incluso con mas de 5000 filas por particion.
async function calcularResumen(cliente, sensor, dia) {
  const fecha = LocalDate.fromString(validarDia(String(dia)));
  const consulta = `SELECT temperatura FROM ${KS}.lecturas_por_sensor_dia WHERE sensor = ? AND dia = ?`;
  let total = 0, suma = 0, minimo = Infinity, maximo = -Infinity;
  for await (const fila of cliente.stream(consulta, [sensor, fecha], { prepare: true, fetchSize: 1000 })) {
    const temperatura = fila.temperatura;
    if (typeof temperatura !== "number" || !Number.isFinite(temperatura)) continue;
    total++;
    suma += temperatura;
    minimo = Math.min(minimo, temperatura);
    maximo = Math.max(maximo, temperatura);
  }
  if (!total) {
    await ejecutar(cliente, `DELETE FROM ${KS}.resumen_por_dia WHERE sensor = ? AND dia = ?`, [sensor, fecha]);
    return null;
  }
  const resumen = { sensor, dia: String(fecha), temp_min: minimo, temp_max: maximo,
    temp_promedio: suma / total, total, actualizado: new Date() };
  await ejecutar(cliente,
    `INSERT INTO ${KS}.resumen_por_dia (sensor, dia, temp_min, temp_max, temp_promedio, total, actualizado) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [sensor, fecha, minimo, maximo, resumen.temp_promedio, total, resumen.actualizado]);
  return resumen;
}

async function consultarResumenes(cliente, q) {
  const cql = [], dia = validarDia(q.get("dia") || diaLocal());
  const catalogo = await leerSensores(cliente, cql);
  const resumenes = [];
  for (const sensor of Object.values(catalogo).sort((a, b) => a.id.localeCompare(b.id))) {
    const resultado = await ejecutar(cliente,
      `SELECT temp_min, temp_max, temp_promedio, total, actualizado FROM ${KS}.resumen_por_dia WHERE sensor = ? AND dia = ?`,
      [sensor.id, LocalDate.fromString(dia)], cql);
    const fila = resultado.first();
    resumenes.push({ sensor: sensor.id, nombre: sensor.nombre, calculado: Boolean(fila),
      ...(fila ? { temp_min: fila.temp_min, temp_max: fila.temp_max, temp_promedio: fila.temp_promedio,
        total: fila.total, actualizado: fila.actualizado } : {}) });
  }
  return { dia, resumenes, cql };
}

async function consultarAlertasSensor(cliente, id, q) {
  const cql = [];
  const dias = entero(q.get("dias"), 7, 31, "dias");
  const limite = entero(q.get("limite"), 100, 500, "limite");
  const hasta = validarDia(q.get("hasta") || diaLocal());
  const catalogo = await leerSensores(cliente, cql);
  if (!Object.hasOwn(catalogo, id)) throw new Error("No existe el sensor " + id);
  const alertas = [];
  // Dias locales, incluidos hasta y los dias-1 anteriores. Se leen del nuevo al viejo.
  for (let i = 0; i < dias && alertas.length < limite; i++) {
    const dia = desplazarDia(hasta, -i);
    const resultado = await ejecutar(cliente,
      `SELECT hora, temperatura, mensaje FROM ${KS}.alertas_por_sensor_dia WHERE sensor = ? AND dia = ? LIMIT ?`,
      [id, LocalDate.fromString(dia), limite - alertas.length], cql);
    for (const fila of resultado.rows) alertas.push({ dia, hora: fila.hora,
      temperatura: fila.temperatura, mensaje: fila.mensaje });
  }
  return { sensor: id, desde: desplazarDia(hasta, 1 - dias), hasta, dias, limite, alertas, cql };
}

module.exports = { validarDia, entero, desplazarDia, calcularResumen, consultarResumenes, consultarAlertasSensor };
