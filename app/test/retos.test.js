// Pruebas sin Cassandra: datos controlados, un controlador simulado y HTTP local.
// La conexion, el CQL real y los permisos se verifican en Codespaces (README).
const test = require("node:test");
const assert = require("node:assert/strict");
const { Readable } = require("node:stream");
const Module = require("node:module");
class LocalDate {
  constructor(valor) { this.valor = valor; }
  static fromString(valor) { return new LocalDate(valor); }
  toString() { return this.valor; }
}
const cargarOriginal = Module._load;
Module._load = function(nombre, ...args) {
  if (nombre === "cassandra-driver") return {
    types: { LocalDate },
    Client: class { constructor(opciones) { this.opciones = opciones; } },
    auth: { PlainTextAuthProvider: class { constructor(usuario, clave) { this.usuario = usuario; this.clave = clave; } } },
  };
  return cargarOriginal.call(this, nombre, ...args);
};
const bd = require("../bd");
const retos = require("../retos");
const { generarResumenes } = require("../resumen-diario");
const { migrarAlertas } = require("../migrar-alertas");
const { crearServidor } = require("../servidor");
Module._load = cargarOriginal;

const flujo = filas => Readable.from(filas, { objectMode: true });
const resultado = filas => ({ rows: filas, first: () => filas[0] || null });
const sensor = { id: "uthh-03", nombre: "Explanada", temp_max: 35 };

test("el dia de la estacion cambia a las 06:00 UTC, no a medianoche UTC", () => {
  assert.equal(bd.diaLocal(new Date("2026-10-17T05:59:59Z")), "2026-10-16");
  assert.equal(bd.diaLocal(new Date("2026-10-17T06:00:00Z")), "2026-10-17");
  assert.equal(retos.desplazarDia("2024-03-01", -1), "2024-02-29");
  assert.throws(() => retos.validarDia("2026-02-30"));
});

test("el rol se configura con authProvider y una configuracion incompleta falla", () => {
  const claves = ["CASSANDRA_USER", "CASSANDRA_PASSWORD"];
  const anteriores = claves.map(clave => process.env[clave]);
  try {
    delete process.env.CASSANDRA_USER;
    delete process.env.CASSANDRA_PASSWORD;
    assert.equal(bd.crearCliente().opciones.authProvider, undefined);
    process.env.CASSANDRA_USER = "usuario_prueba";
    assert.throws(() => bd.crearCliente(), /juntos/);
    process.env.CASSANDRA_PASSWORD = "valor_solo_para_pruebas";
    assert.equal(bd.crearCliente().opciones.authProvider.usuario, "usuario_prueba");
  } finally {
    claves.forEach((clave, i) => anteriores[i] === undefined ? delete process.env[clave] : process.env[clave] = anteriores[i]);
  }
});

test("solo las temperaturas sobre el umbral se escriben en ambas tablas de alertas", async () => {
  let lote;
  const operaciones = [];
  const cliente = {
    batch: async consultas => { lote = consultas; },
    execute: async (...argumentos) => { operaciones.push(argumentos); return resultado([]); },
  };
  const hora = new Date("2026-10-16T18:00:00Z");
  await bd.guardarLectura(cliente, sensor, { hora, temperatura: 35, humedad: 60 });
  assert.equal(lote.length, 2);
  await bd.guardarLectura(cliente, sensor, { hora, temperatura: 40, humedad: 60 });
  assert.equal(lote.length, 4);
  assert.ok(lote.some(consulta => consulta.query.includes("alertas_por_dia")));
  assert.ok(lote.some(consulta => consulta.query.includes("alertas_por_sensor_dia")));
  assert.ok(lote.every(consulta => !consulta.query.includes("conteo_por_dia")));
  await bd.guardarLectura(cliente, sensor, { hora, temperatura: 40, humedad: 60 }, null, true);
  assert.ok(lote.every(consulta => !consulta.query.includes("ultima_lectura")));
  assert.equal(operaciones.length, 3); // El contador sigue fuera del BATCH.
});

test("el resumen procesa mas de 5000 filas y conserva precision en el promedio", async () => {
  const filas = Array.from({ length: 6001 }, (_, i) => ({ temperatura: i % 2 ? 40 : -10 }));
  filas.push({ temperatura: null }, { temperatura: NaN });
  let escritura;
  const cliente = { stream: () => flujo(filas), execute: async (...args) => { escritura = args; return resultado([]); } };
  const resumen = await retos.calcularResumen(cliente, "uthh-03", "2026-10-16");
  assert.equal(resumen.total, 6001);
  assert.equal(resumen.temp_min, -10);
  assert.equal(resumen.temp_max, 40);
  assert.equal(resumen.temp_promedio, (3000 * 40 - 3001 * 10) / 6001);
  assert.equal(escritura[1][5], 6001);
});

test("recalcular los resumenes reemplaza las mismas llaves sin incrementar contadores", async () => {
  const almacen = new Map();
  const cliente = {
    stream: consulta => flujo(consulta.includes("DISTINCT")
      ? [{ sensor: "uthh-03", dia: LocalDate.fromString("2026-10-16") }]
      : [{ temperatura: 20 }, { temperatura: 40 }]),
    execute: async (consulta, parametros) => {
      assert.ok(consulta.includes("INSERT INTO estacion.resumen_por_dia"));
      almacen.set(parametros[0] + String(parametros[1]), parametros);
      return resultado([]);
    },
  };
  await generarResumenes(cliente, () => {});
  await generarResumenes(cliente, () => {});
  assert.equal(almacen.size, 1);
  assert.equal([...almacen.values()][0][4], 30);
});

test("las alertas cruzan un cambio de mes y respetan un limite global", async () => {
  const diasConsultados = [];
  const cliente = { execute: async (consulta, parametros) => {
    if (consulta.includes("FROM estacion.sensores")) return resultado([sensor]);
    const dia = String(parametros[1]);
    diasConsultados.push(dia);
    const filas = dia === "2026-02-02" ? [] : [
      { hora: new Date(dia + "T20:00:00Z"), temperatura: 40, mensaje: "Alerta reciente" },
      { hora: new Date(dia + "T19:00:00Z"), temperatura: 38, mensaje: "Alerta anterior" },
    ];
    return resultado(filas.slice(0, parametros[2]));
  } };
  const r = await retos.consultarAlertasSensor(cliente, "uthh-03", new URLSearchParams({ hasta: "2026-02-02", dias: "3", limite: "3" }));
  assert.deepEqual(diasConsultados, ["2026-02-02", "2026-02-01", "2026-01-31"]);
  assert.equal(r.alertas.length, 3);
  assert.deepEqual(r.alertas.map(a => a.dia), ["2026-02-01", "2026-02-01", "2026-01-31"]);
  assert.equal(r.desde, "2026-01-31");
  await assert.rejects(() => retos.consultarAlertasSensor(cliente, "uthh-03", new URLSearchParams("dias=32")), /dias/);
  await assert.rejects(() => retos.consultarAlertasSensor(cliente, "uthh-03", new URLSearchParams("limite=-1")), /limite/);
  await assert.rejects(() => retos.consultarAlertasSensor(cliente, "inexistente", new URLSearchParams()), /No existe/);
});

test("la migracion conserva las alertas existentes y repetirla no duplica sus llaves", async () => {
  const almacen = new Map();
  const alerta = { sensor: "uthh-03", hora: new Date("2026-10-16T20:00:00Z"), temperatura: 40, mensaje: "Original" };
  const cliente = {
    stream: consulta => flujo(consulta.includes("DISTINCT") ? [{ dia: LocalDate.fromString("2026-10-16") }] : [alerta]),
    execute: async (consulta, parametros) => {
      assert.ok(consulta.startsWith("INSERT INTO estacion.alertas_por_sensor_dia"));
      almacen.set(parametros.slice(0, 3).map(String).join("/"), parametros);
      return resultado([]);
    },
  };
  await migrarAlertas(cliente, () => {});
  await migrarAlertas(cliente, () => {});
  assert.equal(almacen.size, 1);
  assert.equal([...almacen.values()][0][4], alerta.mensaje);
});

test("las rutas nuevas funcionan por HTTP y entregan errores de entrada en JSON", async t => {
  const cliente = { execute: async consulta => {
    if (consulta.includes("FROM estacion.sensores")) return resultado([sensor]);
    if (consulta.includes("FROM estacion.resumen_por_dia")) return resultado([{ temp_min: 20, temp_max: 40, temp_promedio: 30, total: 2, actualizado: new Date() }]);
    return resultado([]);
  } };
  const servidor = crearServidor(cliente);
  await new Promise(resolve => servidor.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => servidor.close(resolve)));
  const origen = "http://127.0.0.1:" + servidor.address().port;
  const resumen = await fetch(origen + "/api/resumenes?dia=2026-10-16");
  assert.equal(resumen.status, 200);
  assert.equal((await resumen.json()).resumenes[0].temp_promedio, 30);
  const alertas = await fetch(origen + "/api/sensores/uthh-03/alertas?dias=7");
  assert.equal(alertas.status, 200);
  assert.deepEqual((await alertas.json()).alertas, []);
  const invalida = await fetch(origen + "/api/resumenes?dia=2026-02-30");
  assert.equal(invalida.status, 400);
  assert.match((await invalida.json()).error, /calendario/);
  const pagina = await fetch(origen + "/alertas.html");
  assert.equal(pagina.status, 200);
  assert.match(await pagina.text(), /Alertas por sensor/);
});
