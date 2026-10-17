// Reto 2. Copia alertas existentes al nuevo acceso por sensor; no toca contadores.
const { KS, crearCliente, ejecutar } = require("./bd");

async function migrarAlertas(cliente, informar = console.log) {
  let total = 0;
  for await (const { dia } of cliente.stream(`SELECT DISTINCT dia FROM ${KS}.alertas_por_dia`, [], { prepare: true })) {
    const filas = cliente.stream(`SELECT hora, sensor, temperatura, mensaje FROM ${KS}.alertas_por_dia WHERE dia = ?`, [dia], { prepare: true, fetchSize: 1000 });
    for await (const fila of filas) {
      await ejecutar(cliente,
        `INSERT INTO ${KS}.alertas_por_sensor_dia (sensor, dia, hora, temperatura, mensaje) VALUES (?, ?, ?, ?, ?)`,
        [fila.sensor, dia, fila.hora, fila.temperatura, fila.mensaje]);
      total++;
    }
  }
  informar(`Listo: ${total} alertas copiadas. Puedes repetirlo: las mismas llaves se sobrescriben.`);
  return total;
}
if (require.main === module) {
  (async () => {
    const cliente = crearCliente();
    try { await migrarAlertas(cliente); }
    finally { await cliente.shutdown(); }
  })().catch(error => { console.error("Error:", error.message); process.exitCode = 1; });
}
module.exports = { migrarAlertas };
