// Impuesto de cada factura de la suscripción según dónde está el emisor
// (la titular de Obrador Control) y dónde está el obrador cliente.
// Todos los clientes son empresas o profesionales (servicio B2B).
//
//  Emisor en Canarias:   cliente canario → IGIC 7 %.
//                        cliente de Península/Baleares → sin IGIC; inversión del sujeto pasivo (IVA a cargo del cliente).
//                        cliente de Ceuta/Melilla → sin IGIC.
//  Emisor en Península:  cliente de Península/Baleares → IVA 21 %.
//                        cliente canario, de Ceuta o de Melilla → sin IVA; el impuesto local lo declara el cliente.
//
// Revisar con la gestoría. Se configura con EMISOR_TERRITORIO (canarias | peninsula), IGIC_PCT e IVA_PCT.
import { config } from "../config.js";

/** canarias | ceuta_melilla | peninsula, por el código postal español. */
export function territorioDeCp(cp) {
  const p = String(cp || "").trim().slice(0, 2);
  if (p === "35" || p === "38") return "canarias";
  if (p === "51" || p === "52") return "ceuta_melilla";
  return "peninsula";
}

const ISP = "Inversión del sujeto pasivo: el impuesto lo declara el destinatario.";

/** { tipo: "IGIC"|"IVA"|null, pct, mencion } para un obrador con ese código postal. */
export function impuestoParaCliente(cp, emisor = config.fiscal.emisorTerritorio) {
  const cliente = territorioDeCp(cp);
  if (emisor === "peninsula") {
    if (cliente === "peninsula") return { tipo: "IVA", pct: config.fiscal.ivaPct, mencion: null, territorio: cliente };
    return {
      tipo: null, pct: 0, territorio: cliente,
      mencion: `Operación no sujeta a IVA por localizarse en ${cliente === "canarias" ? "Canarias" : "Ceuta o Melilla"} (art. 69 Ley 37/1992). ${ISP}`,
    };
  }
  if (cliente === "canarias") return { tipo: "IGIC", pct: config.fiscal.igicPct, mencion: null, territorio: cliente };
  if (cliente === "peninsula") {
    return {
      tipo: null, pct: 0, territorio: cliente,
      mencion: "Operación no sujeta a IGIC (art. 17 Ley 20/1991). Inversión del sujeto pasivo: IVA a cargo del destinatario (art. 84.Uno.2º Ley 37/1992).",
    };
  }
  return { tipo: null, pct: 0, territorio: cliente, mencion: "Operación no sujeta a IGIC (art. 17 Ley 20/1991)." };
}

/** Importe con impuesto, redondeado a céntimos. */
export function conImpuesto(base, imp) {
  const cuota = Math.round(base * imp.pct) / 100;
  return { base, cuota, total: Math.round((base + cuota) * 100) / 100 };
}
