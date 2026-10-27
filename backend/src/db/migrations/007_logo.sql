-- Logotipo del obrador (imagen PNG o JPEG guardada en archivos).
ALTER TABLE obradores ADD COLUMN logo_id uuid;
ALTER TABLE obradores
  ADD CONSTRAINT obradores_logo_fk FOREIGN KEY (id, logo_id) REFERENCES archivos (obrador_id, id) ON DELETE SET NULL (logo_id);
