-- Invariants: checked meron content (`spec`), a fixed subtype list and invariant applicability.
CREATE TABLE mer.subtypes (
 kind text NOT NULL REFERENCES mer.meron_types(name),
 name text NOT NULL CHECK (length(btrim(name)) > 0 AND octet_length(name) <= 80),
 PRIMARY KEY (kind, name)
);
INSERT INTO mer.subtypes VALUES
 ('system','infrastructure'),('system','foundational-domain'),('system','design-system'),
 ('component','interactive'),('token','color'),('agent','ai-agent'),('rule','policy');
-- Subtypes already in use stay valid.
INSERT INTO mer.subtypes SELECT DISTINCT kind, subtype FROM mer.merons WHERE subtype IS NOT NULL ON CONFLICT DO NOTHING;
ALTER TABLE mer.merons ADD CONSTRAINT registered_subtype FOREIGN KEY (kind, subtype) REFERENCES mer.subtypes(kind, name);
ALTER TABLE mer.merons ADD COLUMN spec jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(spec) = 'object' AND octet_length(spec::text) <= 65536);

-- What an invariant applies to is fixed once created; changing it would silently move merons between rule sets.
CREATE FUNCTION mer.invariant_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
 IF NEW.kind='invariant' AND NEW.spec->'applies_to' IS DISTINCT FROM OLD.spec->'applies_to' THEN
  RAISE EXCEPTION 'invariant applicability is immutable';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER invariant_applicability BEFORE UPDATE ON mer.merons FOR EACH ROW EXECUTE FUNCTION mer.invariant_guard();
CREATE INDEX invariant_applies_to ON mer.merons((spec->'applies_to'->>'type')) WHERE kind='invariant';

GRANT SELECT ON mer.subtypes TO noi_mer_runtime;
REVOKE ALL ON mer.subtypes FROM PUBLIC;
REVOKE ALL ON FUNCTION mer.invariant_guard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mer.invariant_guard() TO noi_mer_runtime;
ALTER TABLE mer.subtypes ENABLE ROW LEVEL SECURITY;
CREATE POLICY backend_only ON mer.subtypes TO noi_mer_runtime USING (true) WITH CHECK (true);
DO $$ DECLARE r text; BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
   EXECUTE format('REVOKE ALL ON mer.subtypes FROM %I',r);
  END IF;
 END LOOP;
END $$;
