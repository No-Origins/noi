-- Invariants v0.2 implementation profile. Run with a migration owner, never an anon key.
CREATE SCHEMA mer;
REVOKE ALL ON SCHEMA mer FROM PUBLIC;

CREATE TABLE mer.meron_types (name text PRIMARY KEY);
INSERT INTO mer.meron_types VALUES ('system'),('agent'),('component'),('token'),('rule'),('invariant'),('document');
CREATE TABLE mer.relationship_types (
    name text PRIMARY KEY, acyclic boolean NOT NULL, description text NOT NULL
);
INSERT INTO mer.relationship_types VALUES
 ('contains',true,'Structural parent system; exactly one parent per child'),
 ('depends-on',true,'Dependency on another meron'),
 ('implements',false,'Target must be an invariant'),
 ('represents',false,'Document representation of an invariant'),
 ('governed-by',false,'Structural reference to Governance; does not confer authority');

CREATE TABLE mer.merons (
 uid uuid PRIMARY KEY,
 path text NOT NULL UNIQUE,
 name text NOT NULL CHECK (length(btrim(name)) > 0 AND octet_length(name) <= 200),
 kind text NOT NULL REFERENCES mer.meron_types(name),
 subtype text CHECK (subtype IS NULL OR (length(btrim(subtype)) > 0 AND octet_length(subtype) <= 80)),
 roles jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(roles) = 'array'),
 definition text NOT NULL CHECK (length(btrim(definition)) > 0 AND octet_length(definition) <= 8000),
 responsibility text NOT NULL CHECK (length(btrim(responsibility)) > 0 AND octet_length(responsibility) <= 8000),
 state text NOT NULL DEFAULT 'proposed' CHECK (state IN ('proposed','registered','active','deprecated','retired')),
 release_mode text NOT NULL DEFAULT 'inherited' CHECK (release_mode IN ('inherited','independent')),
 authority_scope uuid NOT NULL REFERENCES mer.merons(uid) DEFERRABLE INITIALLY DEFERRED,
 metadata jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(metadata) = 'object' AND octet_length(metadata::text) <= 65536),
 revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK (octet_length(path) <= 240 AND path ~ '^noi(\.[a-z][a-z0-9]*(-[a-z0-9]+)*)*$')
);
CREATE TABLE mer.identifiers (
 path text PRIMARY KEY,
 meron_uid uuid NOT NULL REFERENCES mer.merons(uid) DEFERRABLE INITIALLY DEFERRED,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(path,meron_uid)
);
ALTER TABLE mer.merons ADD CONSTRAINT canonical_identifier
 FOREIGN KEY(path,uid) REFERENCES mer.identifiers(path,meron_uid) DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE mer.relationships (
 uid uuid PRIMARY KEY,
 source uuid NOT NULL REFERENCES mer.merons(uid),
 predicate text NOT NULL REFERENCES mer.relationship_types(name),
 target uuid NOT NULL REFERENCES mer.merons(uid),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(source <> target), UNIQUE(source,predicate,target)
);
CREATE UNIQUE INDEX one_structural_parent ON mer.relationships(target) WHERE predicate='contains';
CREATE INDEX relationship_target ON mer.relationships(target,predicate);
CREATE TABLE mer.generations (
 meron_uid uuid NOT NULL REFERENCES mer.merons(uid),
 generation integer NOT NULL CHECK(generation > 0),
 justification text NOT NULL CHECK(length(btrim(justification)) > 0 AND octet_length(justification) <= 8000),
 PRIMARY KEY(meron_uid,generation)
);
CREATE TABLE mer.releases (
 uid uuid PRIMARY KEY,
 meron_uid uuid NOT NULL REFERENCES mer.merons(uid),
 generation integer NOT NULL,
 version text NOT NULL CHECK(version ~ '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$'),
 state text NOT NULL DEFAULT 'planned' CHECK(state IN ('planned','experimental','stable','deprecated','unsupported')),
 justification text NOT NULL CHECK(length(btrim(justification)) > 0 AND octet_length(justification) <= 8000),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision > 0),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(meron_uid,generation) REFERENCES mer.generations(meron_uid,generation),
 UNIQUE(meron_uid,version)
);
CREATE TABLE mer.events (
 sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 meron_uid uuid NOT NULL REFERENCES mer.merons(uid),
 action text NOT NULL,
 actor text NOT NULL CHECK(length(btrim(actor)) > 0),
 authorization_decision jsonb NOT NULL CHECK(coalesce(authorization_decision->>'decision'='allow' AND length(btrim(authorization_decision->>'reference')) > 0,false)),
 payload jsonb NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX event_meron ON mer.events(meron_uid,sequence);

-- All graph mutations take the same transaction lock, including direct SQL writes.
-- Statement-level locking happens before row locks, avoiding lock order inversion.
CREATE FUNCTION mer.lock_graph() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN PERFORM pg_advisory_xact_lock(726245901); RETURN NULL; END $$;
CREATE FUNCTION mer.no_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN RAISE EXCEPTION 'Invariants historical records cannot be updated or deleted'; END $$;
CREATE TRIGGER identifiers_immutable BEFORE UPDATE OR DELETE ON mer.identifiers FOR EACH ROW EXECUTE FUNCTION mer.no_mutation();
CREATE TRIGGER events_append_only BEFORE UPDATE OR DELETE ON mer.events FOR EACH ROW EXECUTE FUNCTION mer.no_mutation();
CREATE TRIGGER generations_immutable BEFORE UPDATE OR DELETE ON mer.generations FOR EACH ROW EXECUTE FUNCTION mer.no_mutation();
CREATE TRIGGER merons_retained BEFORE DELETE ON mer.merons FOR EACH ROW EXECUTE FUNCTION mer.no_mutation();
CREATE TRIGGER releases_retained BEFORE DELETE ON mer.releases FOR EACH ROW EXECUTE FUNCTION mer.no_mutation();
CREATE TRIGGER relationships_immutable BEFORE UPDATE ON mer.relationships FOR EACH ROW EXECUTE FUNCTION mer.no_mutation();
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['merons','identifiers','relationships','generations','releases','events'] LOOP
  EXECUTE format('CREATE TRIGGER serialize_mutation BEFORE INSERT OR UPDATE OR DELETE ON mer.%I FOR EACH STATEMENT EXECUTE FUNCTION mer.lock_graph()',t);
 END LOOP;
END $$;
CREATE FUNCTION mer.meron_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE scope_kind text; segment text;
BEGIN
 FOREACH segment IN ARRAY string_to_array(NEW.path,'.') LOOP
  IF octet_length(segment)>63 THEN RAISE EXCEPTION 'namespace segment too long'; END IF;
 END LOOP;
 IF jsonb_array_length(NEW.roles)>32 OR EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.roles) r WHERE jsonb_typeof(r)<>'string' OR length(btrim(r#>>'{}'))=0 OR octet_length(r#>>'{}')>80)
 OR (SELECT count(*) FROM jsonb_array_elements(NEW.roles)) <> (SELECT count(DISTINCT r) FROM jsonb_array_elements(NEW.roles) r)
 THEN RAISE EXCEPTION 'invalid roles'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.state<>'proposed' OR NEW.revision<>1 THEN RAISE EXCEPTION 'new meron must be proposed revision 1'; END IF;
 ELSE
  IF NEW.uid<>OLD.uid OR NEW.kind<>OLD.kind OR NEW.release_mode<>OLD.release_mode OR NEW.authority_scope<>OLD.authority_scope OR NEW.created_at<>OLD.created_at THEN RAISE EXCEPTION 'immutable identity/classification/binding'; END IF;
  IF NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'revision must advance exactly once'; END IF;
  IF OLD.state='retired' THEN RAISE EXCEPTION 'retired meron is immutable'; END IF;
  IF NEW.state<>OLD.state AND (OLD.state,NEW.state) NOT IN (('proposed','registered'),('registered','active'),('active','deprecated'),('deprecated','retired')) THEN RAISE EXCEPTION 'invalid meron lifecycle transition'; END IF;
  IF NEW.state='retired' AND EXISTS(SELECT 1 FROM mer.relationships WHERE target=NEW.uid OR (source=NEW.uid AND predicate='contains')) THEN RAISE EXCEPTION 'meron still referenced or contains children'; END IF;
  IF NEW.state='retired' AND EXISTS(SELECT 1 FROM mer.merons WHERE authority_scope=NEW.uid AND uid<>NEW.uid AND state<>'retired') THEN RAISE EXCEPTION 'meron is a governance scope'; END IF;
  IF OLD.path IN ('noi','noi.inv','noi.gov') AND NEW.path<>OLD.path THEN RAISE EXCEPTION 'foundation paths are reserved in this profile'; END IF;
 END IF;
 IF NEW.authority_scope=NEW.uid AND NEW.kind='system' AND NEW.path='noi' THEN RETURN NEW; END IF;
 SELECT kind INTO scope_kind FROM mer.merons WHERE uid=NEW.authority_scope AND state<>'retired';
 IF scope_kind IS DISTINCT FROM 'system' THEN RAISE EXCEPTION 'authority scope must reference a live system'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_meron BEFORE INSERT OR UPDATE ON mer.merons FOR EACH ROW EXECUTE FUNCTION mer.meron_guard();
CREATE FUNCTION mer.relationship_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE s mer.merons; t mer.merons;
BEGIN
 SELECT * INTO s FROM mer.merons WHERE uid=NEW.source;
 SELECT * INTO t FROM mer.merons WHERE uid=NEW.target;
 IF s.uid IS NULL OR t.uid IS NULL OR s.state='retired' OR t.state='retired' THEN RAISE EXCEPTION 'relationship endpoint missing or retired'; END IF;
 IF NEW.predicate='contains' AND (s.kind<>'system' OR t.path='noi' OR (t.path IN ('noi.inv','noi.gov') AND s.path<>'noi')) THEN RAISE EXCEPTION 'invalid structural parent'; END IF;
 IF NEW.predicate='implements' AND t.kind<>'invariant' THEN RAISE EXCEPTION 'implements requires an invariant'; END IF;
 IF NEW.predicate='represents' AND (s.kind<>'document' OR t.kind<>'invariant') THEN RAISE EXCEPTION 'represents requires document to invariant'; END IF;
 IF NEW.predicate='governed-by' AND (t.kind<>'system' OR t.path<>'noi.gov') THEN RAISE EXCEPTION 'governed-by must reference Governance'; END IF;
 IF NEW.predicate IN ('contains','depends-on') AND EXISTS(
  WITH RECURSIVE reachable(uid) AS (
   SELECT NEW.target UNION SELECT r.target FROM mer.relationships r JOIN reachable p ON r.source=p.uid WHERE r.predicate=NEW.predicate
  ) SELECT 1 FROM reachable WHERE uid=NEW.source
 ) THEN RAISE EXCEPTION 'relationship cycle'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_relationship BEFORE INSERT ON mer.relationships FOR EACH ROW EXECUTE FUNCTION mer.relationship_guard();
CREATE FUNCTION mer.release_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE e mer.merons;
BEGIN
 SELECT * INTO e FROM mer.merons WHERE uid=NEW.meron_uid;
 IF e.release_mode<>'independent' OR e.state NOT IN ('registered','active','deprecated') THEN RAISE EXCEPTION 'release requires admitted independent meron'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.state<>'planned' OR NEW.revision<>1 THEN RAISE EXCEPTION 'release begins planned at revision 1'; END IF;
 ELSE
  IF NEW.uid<>OLD.uid OR NEW.meron_uid<>OLD.meron_uid OR NEW.generation<>OLD.generation OR NEW.version<>OLD.version OR NEW.justification<>OLD.justification OR NEW.created_at<>OLD.created_at THEN RAISE EXCEPTION 'release identity is immutable'; END IF;
  IF NEW.revision<>OLD.revision+1 OR (OLD.state,NEW.state) NOT IN (('planned','experimental'),('experimental','stable'),('stable','deprecated'),('deprecated','unsupported')) THEN RAISE EXCEPTION 'invalid release transition'; END IF;
 END IF;
 IF NEW.state='stable' AND NEW.version LIKE '%-%' THEN RAISE EXCEPTION 'stable releases cannot have prerelease versions'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_release BEFORE INSERT OR UPDATE ON mer.releases FOR EACH ROW EXECUTE FUNCTION mer.release_guard();

-- A backend-only, non-login role. An operator may grant it to a dedicated login.
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='noi_mer_runtime') THEN CREATE ROLE noi_mer_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE; END IF; END $$;
GRANT USAGE ON SCHEMA mer TO noi_mer_runtime;
GRANT SELECT ON ALL TABLES IN SCHEMA mer TO noi_mer_runtime;
GRANT INSERT,UPDATE ON mer.merons,mer.releases TO noi_mer_runtime;
GRANT INSERT ON mer.identifiers,mer.generations,mer.events TO noi_mer_runtime;
GRANT INSERT,DELETE ON mer.relationships TO noi_mer_runtime;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA mer TO noi_mer_runtime;
REVOKE ALL ON ALL TABLES IN SCHEMA mer FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA mer FROM PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA mer TO noi_mer_runtime;
-- Defense against accidental PostgREST exposure. No public/anon/authenticated policies.
DO $$ DECLARE t text; r text; BEGIN
 FOREACH t IN ARRAY ARRAY['meron_types','relationship_types','merons','identifiers','relationships','generations','releases','events'] LOOP
  EXECUTE format('ALTER TABLE mer.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY backend_only ON mer.%I TO noi_mer_runtime USING (true) WITH CHECK (true)',t);
 END LOOP;
 FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
   EXECUTE format('REVOKE ALL ON SCHEMA mer FROM %I',r);
   EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA mer FROM %I',r);
  END IF;
 END LOOP;
END $$;
