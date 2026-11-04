import React from "react";

/**
 * Campo de temperatura con botón «±»: el teclado numérico del móvil no tiene
 * signo menos, así que con el botón se cambia entre positivo y negativo
 * (−18 °C en congelación, temperaturas bajo cero en entradas congeladas…).
 */
export default function EntradaTemperatura({ id, value, onChange, className = "entrada", placeholder, negativoPorDefecto = false, ...resto }) {
  const texto = value == null ? "" : String(value);
  const negativo = /^\s*[-−–]/.test(texto);
  function cambiarSigno() {
    const limpio = texto.replace(/^\s*[-−–+]\s*/, "");
    onChange(negativo ? limpio : `-${limpio}`);
  }
  function escribir(e) {
    let v = e.target.value.replace(/[−–]/g, "-");
    // En congelación lo normal es bajo cero: el primer número que se escribe ya va en negativo.
    if (negativoPorDefecto && texto === "" && /^\d/.test(v)) v = `-${v}`;
    onChange(v);
  }
  return (
    <div className="entrada-temperatura">
      <button type="button" className={`signo ${negativo ? "activo" : ""}`} onClick={cambiarSigno}
        aria-label={negativo ? "Cambiar a temperatura positiva" : "Cambiar a temperatura bajo cero"} title="Cambiar el signo (+/−)">
        {negativo ? "−" : "+"}<span aria-hidden>/</span>{negativo ? "+" : "−"}
      </button>
      <input id={id} className={className} inputMode="decimal" autoComplete="off" value={texto} placeholder={placeholder} onChange={escribir} {...resto} />
    </div>
  );
}
