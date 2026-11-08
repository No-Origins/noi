-- Governance roles and rules, as merons under noi.gov. A role (rule/role) is a Cedar template with
-- blanks for who and where; a rule (rule/policy, already registered) is a Cedar policy without
-- blanks. Their invariants give the subtypes their meaning; Governance enforces from its own copy.
INSERT INTO mer.subtypes VALUES ('rule','role');
