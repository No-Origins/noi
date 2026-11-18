-- Part B, decision 4, changed 18 Nov 2026 (the user: "By the files"): a batch approved and waiting
-- lands when main carries its files, however they got there (a merge, a squash, a rebase), not when
-- one commit's id is on main. When one lands, another batch waiting with a change to the same meron
-- was approved against what was there before; it goes back to its proposer, to bring its branch up
-- to date and be approved again. So a proposal waiting to land may now be sent back, its approval
-- and its decider cleared (a sent-back proposal is undecided).
CREATE OR REPLACE FUNCTION mer.proposal_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
 IF OLD.state IN ('approved','rejected') THEN RAISE EXCEPTION 'a decided proposal is final'; END IF;
 IF NEW.uid <> OLD.uid OR NEW.batch <> OLD.batch OR NEW.position <> OLD.position OR NEW.operation <> OLD.operation OR NEW.created_at <> OLD.created_at THEN
  RAISE EXCEPTION 'a proposal keeps its identity, batch, place and operation';
 END IF;
 IF NOT ((OLD.state, NEW.state) IN (('waiting','waiting'),('waiting','sent-back'),('waiting','approved'),('waiting','rejected'),('sent-back','waiting'),('sent-back','rejected'),('waiting','landing'),('landing','approved'),('landing','rejected'),('landing','sent-back'))) THEN
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
 RETURN NEW;
END $$;
