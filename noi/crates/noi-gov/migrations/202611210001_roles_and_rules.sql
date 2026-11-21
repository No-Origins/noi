-- 21 Nov 2026 (agreed 9 Nov, page "Where Roles and Rules Live", decisions 1, 2 and 5): roles and
-- rules live in Governance, every version kept. Governance no longer copies them from Mero: the
-- copy and how current it was go, and a version table and waiting proposals take their place.
-- What Governance decides with is the newest version of each role and rule that is in force.

-- Every version of every role and rule, never changed or removed. `seq` is the order versions were
-- written: the newest seq says how current the whole set is. A role or rule keeps its place (its
-- path, which grants name) for good; its revision goes up by one with each version. Versions moved
-- from Mero keep Mero's revisions, and Mero's own words for who and when.
CREATE TABLE gov.versions (
 seq bigserial PRIMARY KEY,
 path text NOT NULL CHECK (octet_length(path) <= 240 AND path ~ '^noi\.gov\.(roles|rules)(\.[a-z][a-z0-9]*(-[a-z0-9]+)*)+$'),
 revision bigint NOT NULL CHECK (revision > 0),
 kind text NOT NULL CHECK (kind IN ('role','rule')),
 CHECK ((kind = 'role') = (path LIKE 'noi.gov.roles.%')),
 name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
 definition text NOT NULL CHECK (length(btrim(definition)) BETWEEN 1 AND 8000),
 responsibility text NOT NULL CHECK (length(btrim(responsibility)) BETWEEN 1 AND 8000),
 -- A role grants one system's actions; a rule names its own.
 system text CHECK ((kind = 'role') = (system IS NOT NULL)),
 cedar text NOT NULL CHECK (length(cedar) BETWEEN 1 AND 20000),
 -- In force while active or deprecated (deprecated: no new grants). Proposed and registered are
 -- only ever Mero's earlier steps, moved with their history.
 state text NOT NULL CHECK (state IN ('proposed','registered','active','deprecated','retired')),
 at timestamptz NOT NULL DEFAULT now(),
 -- How it came: approved here, moved from Mero, the first roles and rules setup writes, or the
 -- recovery command on Governance's server.
 came text NOT NULL CHECK (came IN ('approved','moved','setup','recovery')),
 proposal uuid,
 approved_by uuid REFERENCES gov.accounts(id),
 why text,
 -- For a version moved from Mero: Mero's ID, its path then, who did it, Mero's record reference.
 mero jsonb CHECK (mero IS NULL OR jsonb_typeof(mero) = 'object'),
 CHECK ((came = 'moved') = (mero IS NOT NULL)),
 UNIQUE (path, revision)
);
CREATE TRIGGER versions_append_only BEFORE UPDATE OR DELETE ON gov.versions FOR EACH ROW EXECUTE FUNCTION gov.append_only();
CREATE TRIGGER versions_no_truncate BEFORE TRUNCATE ON gov.versions FOR EACH STATEMENT EXECUTE FUNCTION gov.append_only();

-- A change to a role or rule, waiting for an owner (decision 2): a new one, a change to what it says,
-- or setting one aside, bringing it back or retiring it. It holds the whole version it proposes.
-- Approving writes that version; sending back and rejecting close it with a note.
CREATE TABLE gov.proposals (
 id uuid PRIMARY KEY,
 path text NOT NULL CHECK (octet_length(path) <= 240 AND path ~ '^noi\.gov\.(roles|rules)(\.[a-z][a-z0-9]*(-[a-z0-9]+)*)+$'),
 kind text NOT NULL CHECK (kind IN ('role','rule')),
 CHECK ((kind = 'role') = (path LIKE 'noi.gov.roles.%')),
 operation text NOT NULL CHECK (operation IN ('add','change','set-aside','bring-back','retire')),
 -- The revision it changes, so a proposal made before another change is stale.
 base_revision bigint CHECK (base_revision IS NULL OR base_revision > 0),
 CHECK ((operation = 'add') = (base_revision IS NULL)),
 name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
 definition text NOT NULL CHECK (length(btrim(definition)) BETWEEN 1 AND 8000),
 responsibility text NOT NULL CHECK (length(btrim(responsibility)) BETWEEN 1 AND 8000),
 system text CHECK ((kind = 'role') = (system IS NOT NULL)),
 cedar text NOT NULL CHECK (length(cedar) BETWEEN 1 AND 20000),
 -- Cedar the form can't read, new or changed: proposing it asked write-cedar, with a touch.
 by_hand boolean NOT NULL DEFAULT false,
 why text NOT NULL CHECK (length(btrim(why)) BETWEEN 1 AND 2000),
 proposed_by uuid NOT NULL REFERENCES gov.accounts(id),
 proposed_at timestamptz NOT NULL DEFAULT now(),
 state text NOT NULL DEFAULT 'waiting' CHECK (state IN ('waiting','approved','sent-back','rejected')),
 decided_by uuid REFERENCES gov.accounts(id),
 decided_at timestamptz,
 note text CHECK (note IS NULL OR length(note) <= 2000),
 CHECK ((state = 'waiting') = (decided_at IS NULL)),
 CHECK (state IN ('waiting','approved') OR length(btrim(coalesce(note, ''))) > 0)
);
CREATE INDEX proposals_waiting ON gov.proposals (proposed_at) WHERE state = 'waiting';
-- A proposal never changes once made (review, 21 Nov): only its decision is written, once, while it
-- waits. So the touch that decides it, which names its ID, names exactly what it says.
CREATE FUNCTION gov.proposal_decided_once() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
 IF OLD.state <> 'waiting' THEN RAISE EXCEPTION 'a decided proposal does not change'; END IF;
 IF (NEW.id, NEW.path, NEW.kind, NEW.operation, NEW.base_revision, NEW.name, NEW.definition, NEW.responsibility,
     NEW.system, NEW.cedar, NEW.by_hand, NEW.why, NEW.proposed_by, NEW.proposed_at)
    IS DISTINCT FROM
    (OLD.id, OLD.path, OLD.kind, OLD.operation, OLD.base_revision, OLD.name, OLD.definition, OLD.responsibility,
     OLD.system, OLD.cedar, OLD.by_hand, OLD.why, OLD.proposed_by, OLD.proposed_at)
 THEN RAISE EXCEPTION 'a proposal does not change once made: only its decision is written'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER proposals_decided_once BEFORE UPDATE ON gov.proposals FOR EACH ROW EXECUTE FUNCTION gov.proposal_decided_once();
CREATE TRIGGER proposals_kept BEFORE DELETE ON gov.proposals FOR EACH ROW EXECUTE FUNCTION gov.append_only();
REVOKE ALL ON FUNCTION gov.proposal_decided_once() FROM PUBLIC;
ALTER TABLE gov.versions ADD CONSTRAINT versions_proposal FOREIGN KEY (proposal) REFERENCES gov.proposals(id);

-- The copy goes (decision 5): no more copies of Mero, and no version of Mero's to keep up with. The
-- last copy Governance decided with is kept aside, read only, so the move can be checked against it
-- (review, 21 Nov): what is in force after the move must be exactly what it held. A later migration
-- removes both once the move has run. The record keeps every copy that was taken.
ALTER TABLE gov.policies RENAME TO last_copy;
REVOKE INSERT, UPDATE, DELETE ON gov.last_copy, gov.copies FROM noi_gov_runtime;

-- What Governance decides with: the newest version of each role and rule, when it is in force.
CREATE VIEW gov.policies AS
 SELECT path, kind, name, system, cedar, state, revision, seq
 FROM (SELECT DISTINCT ON (path) path, kind, name, system, cedar, state, revision, seq
       FROM gov.versions ORDER BY path, revision DESC) newest
 WHERE state IN ('active','deprecated');

REVOKE ALL ON gov.versions, gov.proposals, gov.policies FROM PUBLIC;
GRANT SELECT, INSERT ON gov.versions TO noi_gov_runtime;
GRANT USAGE ON SEQUENCE gov.versions_seq_seq TO noi_gov_runtime;
GRANT SELECT, INSERT, UPDATE ON gov.proposals TO noi_gov_runtime;
GRANT SELECT ON gov.policies TO noi_gov_runtime;
DO $$ DECLARE r text; BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated','noi_mer_runtime'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
   EXECUTE format('REVOKE ALL ON gov.versions, gov.proposals, gov.policies FROM %I', r);
  END IF;
 END LOOP;
END $$;
