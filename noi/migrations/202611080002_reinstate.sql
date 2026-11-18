-- 8 Nov: the one way back. A deprecated meron may be reinstated to active, through Review with a
-- reason (agreed 8 Nov; the first design's "reinstatement"). Retired stays final. The guard is the
-- one from the first migration, with that one pair added.
CREATE OR REPLACE FUNCTION mer.meron_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
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
  IF NEW.state<>OLD.state AND (OLD.state,NEW.state) NOT IN (('proposed','registered'),('registered','active'),('active','deprecated'),('deprecated','retired'),('deprecated','active')) THEN RAISE EXCEPTION 'invalid meron lifecycle transition'; END IF;
  IF NEW.state='retired' AND EXISTS(SELECT 1 FROM mer.relationships WHERE target=NEW.uid OR (source=NEW.uid AND predicate='contains')) THEN RAISE EXCEPTION 'meron still referenced or contains children'; END IF;
  IF NEW.state='retired' AND EXISTS(SELECT 1 FROM mer.merons WHERE authority_scope=NEW.uid AND uid<>NEW.uid AND state<>'retired') THEN RAISE EXCEPTION 'meron is a governance scope'; END IF;
  IF OLD.path IN ('noi','noi.inv','noi.gov') AND NEW.path<>OLD.path THEN RAISE EXCEPTION 'foundation paths are reserved in this profile'; END IF;
 END IF;
 IF NEW.authority_scope=NEW.uid AND NEW.kind='system' AND NEW.path='noi' THEN RETURN NEW; END IF;
 SELECT kind INTO scope_kind FROM mer.merons WHERE uid=NEW.authority_scope AND state<>'retired';
 IF scope_kind IS DISTINCT FROM 'system' THEN RAISE EXCEPTION 'authority scope must reference a live system'; END IF;
 RETURN NEW;
END $$;
-- Review may propose it: "reinstate" joins the changes a proposal can hold.
ALTER TABLE mer.proposals DROP CONSTRAINT proposals_operation_check;
ALTER TABLE mer.proposals ADD CONSTRAINT proposals_operation_check
  CHECK (operation IN ('add', 'update', 'rename', 'deprecate', 'reinstate'));
