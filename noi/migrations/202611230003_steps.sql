-- Eidos for the 3D world (23 Nov, the user's decision on how values are registered): a set of named
-- steps in one record, such as an element's scale (Small 0.5, Base 1, Medium 1.5, Large 2) or the
-- heights a stage's base may have (2, 4, 6, 8, 10 m). Its invariant gives the subtype its meaning;
-- code that draws in 3D reads the steps.
INSERT INTO mer.subtypes VALUES ('token','steps');
