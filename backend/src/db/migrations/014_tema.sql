-- 014 · Patrón de colores de la app para cada obrador (estética).
ALTER TABLE obradores ADD COLUMN tema text NOT NULL DEFAULT 'azul'
  CHECK (tema IN ('azul', 'verde', 'granate', 'morado', 'mostaza', 'grafito'));
