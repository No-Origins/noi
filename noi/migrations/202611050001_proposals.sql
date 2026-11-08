-- Review: changes wait here until a maintainer approves them. Mero's merons hold only what was approved.
-- A batch is what one proposer sends together. Each proposal keeps the exact change, the result of
-- its last test run, and its state. Nothing here is ever deleted.
CREATE TABLE mer.batches (
 uid uuid PRIMARY KEY,
 title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 200),
 proposer text NOT NULL CHECK(length(btrim(proposer)) BETWEEN 1 AND 200),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE mer.proposals (
 uid uuid PRIMARY KEY,
 batch uuid NOT NULL REFERENCES mer.batches(uid),
 position integer NOT NULL CHECK(position >= 0),
 operation text NOT NULL CHECK(operation IN ('add','update','rename','deprecate')),
 target uuid REFERENCES mer.merons(uid),
 change jsonb NOT NULL CHECK(jsonb_typeof(change) = 'object' AND change->>'operation' = operation),
 state text NOT NULL DEFAULT 'waiting' CHECK(state IN ('waiting','sent-back','approved','rejected')),
 revision integer NOT NULL DEFAULT 1 CHECK(revision >= 1),
 outcome jsonb NOT NULL CHECK(jsonb_typeof(outcome) = 'object'),
 checked_at timestamptz NOT NULL,
 decided_by text,
 decided_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(batch, position),
 CHECK((operation = 'add') = (target IS NULL)),
 CHECK((state IN ('approved','rejected')) = (decided_by IS NOT NULL AND decided_at IS NOT NULL))
);
CREATE INDEX proposal_batch ON mer.proposals(batch, position);
CREATE INDEX proposal_state ON mer.proposals(state);
CREATE TABLE mer.proposal_events (
 sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 batch uuid NOT NULL REFERENCES mer.batches(uid),
 proposal uuid REFERENCES mer.proposals(uid),
 action text NOT NULL CHECK(action IN ('proposal.submit','proposal.revise','proposal.send-back','proposal.approve','proposal.reject')),
 actor text NOT NULL CHECK(length(btrim(actor)) > 0),
 authorization_decision jsonb NOT NULL CHECK(coalesce(authorization_decision->>'decision'='allow' AND length(btrim(authorization_decision->>'reference')) > 0,false)),
 note text CHECK(note IS NULL OR length(btrim(note)) BETWEEN 1 AND 8000),
 payload jsonb NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX proposal_event_batch ON mer.proposal_events(batch, sequence);

-- Forward only: waiting → sent back → waiting again, or approved or rejected, which are final.
-- A proposal's change and identity are fixed except when its proposer revises it.
CREATE FUNCTION mer.proposal_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
 IF OLD.state IN ('approved','rejected') THEN RAISE EXCEPTION 'a decided proposal is final'; END IF;
 IF NEW.uid <> OLD.uid OR NEW.batch <> OLD.batch OR NEW.position <> OLD.position OR NEW.operation <> OLD.operation OR NEW.created_at <> OLD.created_at THEN
  RAISE EXCEPTION 'a proposal keeps its identity, batch, place and operation';
 END IF;
 IF NOT ((OLD.state, NEW.state) IN (('waiting','waiting'),('waiting','sent-back'),('waiting','approved'),('waiting','rejected'),('sent-back','waiting'),('sent-back','rejected'))) THEN
  RAISE EXCEPTION 'invalid proposal transition % -> %', OLD.state, NEW.state;
 END IF;
 IF NEW.change <> OLD.change AND NEW.revision <> OLD.revision + 1 THEN
  RAISE EXCEPTION 'a revised change needs the next revision';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER proposal_forward_only BEFORE UPDATE ON mer.proposals FOR EACH ROW EXECUTE FUNCTION mer.proposal_guard();
CREATE TRIGGER batches_immutable BEFORE UPDATE OR DELETE ON mer.batches FOR EACH ROW EXECUTE FUNCTION mer.no_mutation();
CREATE TRIGGER proposals_retained BEFORE DELETE ON mer.proposals FOR EACH ROW EXECUTE FUNCTION mer.no_mutation();
CREATE TRIGGER proposal_events_append_only BEFORE UPDATE OR DELETE ON mer.proposal_events FOR EACH ROW EXECUTE FUNCTION mer.no_mutation();

GRANT SELECT, INSERT ON mer.batches, mer.proposal_events TO noi_mer_runtime;
GRANT SELECT, INSERT, UPDATE ON mer.proposals TO noi_mer_runtime;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA mer TO noi_mer_runtime;
REVOKE ALL ON mer.batches, mer.proposals, mer.proposal_events FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mer.proposal_guard() TO noi_mer_runtime;
DO $$ DECLARE t text; r text; BEGIN
 FOREACH t IN ARRAY ARRAY['batches','proposals','proposal_events'] LOOP
  EXECUTE format('ALTER TABLE mer.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY backend_only ON mer.%I TO noi_mer_runtime USING (true) WITH CHECK (true)',t);
 END LOOP;
 FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
   EXECUTE format('REVOKE ALL ON mer.batches, mer.proposals, mer.proposal_events FROM %I',r);
  END IF;
 END LOOP;
END $$;
