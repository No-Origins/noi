-- Eidos typography: font families and size steps are primitives, and text styles point at them.
-- Their invariants and the registry's text-style check (noi-eio) give the subtypes their
-- meaning; this only registers their names.
INSERT INTO mer.subtypes VALUES ('token','font-family'), ('token','font-size'), ('token','text-style');
