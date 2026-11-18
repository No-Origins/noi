-- Eidos for the 3D world (17 Nov): a length in metres, a time in seconds and a speed in metres a
-- second. Their invariants give the subtypes their meaning; code that draws in 3D reads the values.
-- A control's motion stays a duration (50 to 300 ms); a time here is the 3D world's.
INSERT INTO mer.subtypes VALUES ('token','length'), ('token','time'), ('token','speed');
