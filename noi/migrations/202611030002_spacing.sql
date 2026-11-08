-- Eidos spacing and sizing: scale steps are primitives, spacing roles point at them, and sizes
-- hold control, touch-target and icon dimensions. Their invariants and the registry's reference
-- check (noi-eio) give the subtypes their meaning; this only registers their names.
INSERT INTO mer.subtypes VALUES ('token','space'), ('token','space-role'), ('token','size');
