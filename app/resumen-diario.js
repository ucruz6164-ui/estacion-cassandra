// Reto 1. Recalcula todas las particiones existentes; repetir no duplica filas.
const { KS, crearCliente } = require("./bd");
const { calcularResumen } = require("./retos");

async function generarResumenes(cliente, informar = console.log) {
  let cantidad = 0;
  const particiones = cliente.stream(`SELECT DISTINCT sensor, dia FROM ${KS}.lecturas_por_sensor_dia`, [], { prepare: true });
  for await (const particion of particiones) {
    const resumen = await calcularResumen(cliente, particion.sensor, particion.dia);
    if (resumen) {
      cantidad++;
      informar(`${resumen.sensor} ${resumen.dia}: ${resumen.total} lecturas, min=${resumen.temp_min.toFixed(1)}, max=${resumen.temp_max.toFixed(1)}, promedio=${resumen.temp_promedio.toFixed(2)}`);
    }
  }
  informar(`Listo: ${cantidad} resumenes. Actualiza el tablero para verlos.`);
  return cantidad;
}

if (require.main === module) {
  (async () => {
    const cliente = crearCliente();
    try { await generarResumenes(cliente); }
    finally { await cliente.shutdown(); }
  })().catch(error => { console.error("Error:", error.message); process.exitCode = 1; });
}
module.exports = { generarResumenes };
