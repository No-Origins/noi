-- 23 Nov 2026: a proposer may take back its own batch while nothing in it is decided (`noi withdraw`).
-- Every waiting or sent-back proposal of it becomes 'withdrawn', which is final, like 'rejected', and
-- names who withdrew it and when. Each carries a 'proposal.withdraw' event with the proposer's note.
-- Nothing else changes: a proposal approved, waiting to land, or decided is not the proposer's to take back.
ALTER TABLE mer.proposals DROP CONSTRAINT proposals_state_check;
ALTER TABLE mer.proposals ADD CONSTRAINT proposals_state_check
  CHECK (state IN ('waiting', 'sent-back', 'landing', 'approved', 'rejected', 'withdrawn'));
ALTER TABLE mer.proposals DROP CONSTRAINT proposals_decided;
ALTER TABLE mer.proposals ADD CONSTRAINT proposals_decided
  CHECK ((state IN ('landing', 'approved', 'rejected', 'withdrawn')) = (decided_by IS NOT NULL AND decided_at IS NOT NULL));
ALTER TABLE mer.proposal_events DROP CONSTRAINT proposal_events_action_check;
ALTER TABLE mer.proposal_events ADD CONSTRAINT proposal_events_action_check
  CHECK (action IN ('proposal.submit', 'proposal.revise', 'proposal.send-back', 'proposal.approve', 'proposal.reject', 'proposal.land', 'proposal.withdraw'));
-- Forward only, as before (202611180002), with withdrawn as one more end: from waiting or sent back.
CREATE OR REPLACE FUNCTION mer.proposal_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
 IF OLD.state IN ('approved','rejected','withdrawn') THEN RAISE EXCEPTION 'a decided proposal is final'; END IF;
 IF NEW.uid <> OLD.uid OR NEW.batch <> OLD.batch OR NEW.position <> OLD.position OR NEW.operation <> OLD.operation OR NEW.created_at <> OLD.created_at THEN
  RAISE EXCEPTION 'a proposal keeps its identity, batch, place and operation';
 END IF;
 IF NOT ((OLD.state, NEW.state) IN (('waiting','waiting'),('waiting','sent-back'),('waiting','approved'),('waiting','rejected'),('sent-back','waiting'),('sent-back','rejected'),('waiting','landing'),('landing','approved'),('landing','rejected'),('landing','sent-back'),('waiting','withdrawn'),('sent-back','withdrawn'))) THEN
  RAISE EXCEPTION 'invalid proposal transition % -> %', OLD.state, NEW.state;
 END IF;
 IF OLD.state = 'landing' AND NEW.change <> OLD.change THEN
  RAISE EXCEPTION 'an approved change waiting to land is not changed';
 END IF;
 IF OLD.state = 'landing' AND NEW.state = 'sent-back' AND NEW.approval IS NOT NULL THEN
  RAISE EXCEPTION 'a proposal sent back keeps no approval';
 END IF;
 IF NEW.change <> OLD.change AND NEW.revision <> OLD.revision + 1 THEN
  RAISE EXCEPTION 'a revised change needs the next revision';
 END IF;
 IF NEW.state = 'withdrawn' AND OLD.state <> 'withdrawn' AND NEW.decided_by <> (SELECT proposer FROM mer.batches WHERE uid = NEW.batch) THEN
  RAISE EXCEPTION 'only its proposer withdraws a proposal';
 END IF;
 RETURN NEW;
END $$;
