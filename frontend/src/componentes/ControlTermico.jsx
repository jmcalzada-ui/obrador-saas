import React from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { Campo, aNumero } from "./ui.jsx";

/** "2026-10-21" + "10:30" → ISO con la zona horaria del dispositivo. */
export function aISO(fecha, hora) {
  if (!fecha || !hora) return null;
  const d = new Date(`${fecha}T${hora}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
export const horaAhora = () => new Date().toTimeString().slice(0, 5);

/**
 * Evalúa al momento los valores escritos frente a los objetivos del preparado.
 * El abatimiento puede terminar otro día: hora fin anterior a la de inicio
 * se entiende como del día siguiente.
 */
export function evaluar(obj, v, fecha) {
  const coccion = aNumero(v.coccion_temp);
  const coccionOk = coccion == null || Number.isNaN(coccion) ? null : coccion >= obj.coccion_temp_min;
  let minutos = null;
  let abatOk = null;
  const fin = aNumero(v.abat_temp_fin);
  if (v.abat_hora_inicio && v.abat_hora_fin && fin != null && !Number.isNaN(fin)) {
    const ini = new Date(aISO(fecha, v.abat_hora_inicio));
    let f = new Date(aISO(fecha, v.abat_hora_fin));
    if (f < ini) f = new Date(f.getTime() + 86400000);
    minutos = Math.round((f - ini) / 60000);
    abatOk = fin <= obj.abatimiento_temp_max && minutos <= obj.abatimiento_minutos_max;
  }
  return { coccionOk, abatOk, minutos, fuera: coccionOk === false || abatOk === false };
}

function Resultado({ ok, textoOk, textoMal }) {
  if (ok === null) return null;
  return ok
    ? <span className="resultado-pcc ok"><CheckCircle2 size={18} aria-hidden /> {textoOk}</span>
    : <span className="resultado-pcc mal"><XCircle size={18} aria-hidden /> {textoMal}</span>;
}

/** Campos de cocción y abatimiento con sus objetivos y el resultado al momento. */
export default function ControlTermico({ obj, v, cambiar, fecha, soloAbatimiento = false }) {
  const r = evaluar(obj, v, fecha);
  return (
    <div className="pila">
      {!soloAbatimiento && (
        <section className="panel pila">
          <h3>Cocción</h3>
          <p className="objetivo">Objetivo: al menos {obj.coccion_temp_min} °C en el centro del producto.</p>
          <div className="dos-columnas">
            <Campo etiqueta="Temperatura (°C)" id="ct-temp">
              <input id="ct-temp" className="entrada grande" inputMode="decimal" value={v.coccion_temp} onChange={(e) => cambiar({ coccion_temp: e.target.value })} />
            </Campo>
            <Campo etiqueta="Tiempo (min)" id="ct-min">
              <input id="ct-min" className="entrada grande" inputMode="numeric" value={v.coccion_minutos} onChange={(e) => cambiar({ coccion_minutos: e.target.value })} />
            </Campo>
          </div>
          <Resultado ok={r.coccionOk} textoOk="Cocción correcta" textoMal={`Por debajo de ${obj.coccion_temp_min} °C`} />
        </section>
      )}

      <section className="panel pila">
        <h3>Abatimiento</h3>
        <p className="objetivo">Objetivo: bajar hasta {obj.abatimiento_temp_max} °C o menos en un máximo de {obj.abatimiento_minutos_max} minutos.</p>
        <div className="dos-columnas">
          <Campo etiqueta="Temp. al entrar (°C)" id="ct-ati">
            <input id="ct-ati" className="entrada" inputMode="decimal" value={v.abat_temp_inicio} onChange={(e) => cambiar({ abat_temp_inicio: e.target.value })} />
          </Campo>
          <Campo etiqueta="Hora de entrada" id="ct-hi">
            <input id="ct-hi" className="entrada" type="time" value={v.abat_hora_inicio} onChange={(e) => cambiar({ abat_hora_inicio: e.target.value })} />
          </Campo>
          <Campo etiqueta="Temp. al salir (°C)" id="ct-atf">
            <input id="ct-atf" className="entrada" inputMode="decimal" value={v.abat_temp_fin} onChange={(e) => cambiar({ abat_temp_fin: e.target.value })} />
          </Campo>
          <Campo etiqueta="Hora de salida" id="ct-hf">
            <input id="ct-hf" className="entrada" type="time" value={v.abat_hora_fin} onChange={(e) => cambiar({ abat_hora_fin: e.target.value })} />
          </Campo>
        </div>
        {!soloAbatimiento && !v.abat_hora_fin && <p className="suave pequeno">Si el abatimiento aún no ha terminado, deja la salida vacía y complétala después desde el lote.</p>}
        <Resultado ok={r.abatOk} textoOk={`Abatimiento correcto (${r.minutos} min)`} textoMal={`Fuera de objetivo (${r.minutos} min)`} />
      </section>

      {r.fuera && (
        <Campo etiqueta="Medida correctora aplicada" id="ct-corr" ayuda="Obligatoria cuando un control queda fuera del objetivo (p. ej. se recalienta, se desecha el lote…).">
          <textarea id="ct-corr" className="entrada" value={v.medida_correctora} onChange={(e) => cambiar({ medida_correctora: e.target.value })} />
        </Campo>
      )}
    </div>
  );
}
