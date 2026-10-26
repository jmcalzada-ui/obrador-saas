import { useEffect, useState } from "react";

/** true en pantallas de ordenador (1024 px o más): tablas en vez de tarjetas. */
export default function useEscritorio() {
  const consulta = "(min-width: 1024px)";
  const [es, setEs] = useState(() => typeof window !== "undefined" && window.matchMedia(consulta).matches);
  useEffect(() => {
    const m = window.matchMedia(consulta);
    const f = () => setEs(m.matches);
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, []);
  return es;
}
