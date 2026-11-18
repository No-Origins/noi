-- Part B of "Components in Mero" (agreed 18 Nov 2026): what you approve is what lands. A batch may
-- name the branch and the commit its code is on. Approving such a batch leaves it approved, waiting to
-- land ('landing'): Mero's merons stay as they are, so main and Mero agree. It takes effect when that
-- commit is on main (`noi landed`), under the approval it was given, as an approval always applies.
ALTER TABLE mer.batches
  ADD COLUMN branch text CHECK (branch IS NULL OR (length(branch) BETWEEN 1 AND 200 AND branch !~ '[[:space:]]')),
  ADD COLUMN commit text CHECK (commit IS NULL OR commit ~ '^[0-9a-f]{40}$'),
  ADD CONSTRAINT batches_branch_and_commit CHECK ((branch IS NULL) = (commit IS NULL));

ALTER TABLE mer.proposals DROP CONSTRAINT proposals_state_check;
ALTER TABLE mer.proposals ADD CONSTRAINT proposals_state_check
  CHECK (state IN ('waiting', 'sent-back', 'landing', 'approved', 'rejected'));
ALTER TABLE mer.proposals DROP CONSTRAINT proposals_check2;
ALTER TABLE mer.proposals ADD CONSTRAINT proposals_decided
  CHECK ((state IN ('landing', 'approved', 'rejected')) = (decided_by IS NOT NULL AND decided_at IS NOT NULL));
-- The approval's own answer from Governance, kept so the batch lands under it; and when it landed.
ALTER TABLE mer.proposals
  ADD COLUMN approval jsonb CHECK (approval IS NULL OR coalesce(approval->>'decision' = 'allow' AND length(btrim(approval->>'reference')) > 0, false)),
  ADD COLUMN landed_at timestamptz,
  ADD CONSTRAINT proposals_landing_kept CHECK (state <> 'landing' OR approval IS NOT NULL);

ALTER TABLE mer.proposal_events DROP CONSTRAINT proposal_events_action_check;
ALTER TABLE mer.proposal_events ADD CONSTRAINT proposal_events_action_check
  CHECK (action IN ('proposal.submit', 'proposal.revise', 'proposal.send-back', 'proposal.approve', 'proposal.reject', 'proposal.land'));

-- Forward only, as before, with two more steps: approved, waiting to land, then landed (approved);
-- and a batch waiting to land may still be rejected, when its code will not land.
CREATE OR REPLACE FUNCTION mer.proposal_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
 IF OLD.state IN ('approved','rejected') THEN RAISE EXCEPTION 'a decided proposal is final'; END IF;
 IF NEW.uid <> OLD.uid OR NEW.batch <> OLD.batch OR NEW.position <> OLD.position OR NEW.operation <> OLD.operation OR NEW.created_at <> OLD.created_at THEN
  RAISE EXCEPTION 'a proposal keeps its identity, batch, place and operation';
 END IF;
 IF NOT ((OLD.state, NEW.state) IN (('waiting','waiting'),('waiting','sent-back'),('waiting','approved'),('waiting','rejected'),('sent-back','waiting'),('sent-back','rejected'),('waiting','landing'),('landing','approved'),('landing','rejected'))) THEN
  RAISE EXCEPTION 'invalid proposal transition % -> %', OLD.state, NEW.state;
 END IF;
 IF OLD.state = 'landing' AND NEW.change <> OLD.change THEN
  RAISE EXCEPTION 'an approved change waiting to land is not changed';
 END IF;
 IF NEW.change <> OLD.change AND NEW.revision <> OLD.revision + 1 THEN
  RAISE EXCEPTION 'a revised change needs the next revision';
 END IF;
 RETURN NEW;
END $$;
