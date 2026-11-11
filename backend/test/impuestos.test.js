import { test } from "node:test";
import assert from "node:assert/strict";
import { impuestoParaCliente, territorioDeCp, conImpuesto } from "../src/lib/impuestos.js";

test("territorio por código postal", () => {
  assert.equal(territorioDeCp("38205"), "canarias");
  assert.equal(territorioDeCp("35001"), "canarias");
  assert.equal(territorioDeCp("28224"), "peninsula");
  assert.equal(territorioDeCp("07001"), "peninsula");
  assert.equal(territorioDeCp("51001"), "ceuta_melilla");
});

test("emisor en Canarias: IGIC a clientes canarios, inversión del sujeto pasivo a la Península", () => {
  const can = impuestoParaCliente("38205", "canarias");
  assert.equal(can.tipo, "IGIC"); assert.equal(can.pct, 7);
  const pen = impuestoParaCliente("28224", "canarias");
  assert.equal(pen.tipo, null); assert.match(pen.mencion, /Inversión del sujeto pasivo/);
  assert.deepEqual(conImpuesto(29.9, can), { base: 29.9, cuota: 2.09, total: 31.99 });
});

test("emisor en Península: IVA a la Península, sin IVA a Canarias", () => {
  assert.equal(impuestoParaCliente("28224", "peninsula").tipo, "IVA");
  const can = impuestoParaCliente("38205", "peninsula");
  assert.equal(can.tipo, null); assert.match(can.mencion, /no sujeta a IVA/);
});
