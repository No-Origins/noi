-- 9 Nov (agreed, step 7): each copy of the roles and rules keeps how current it is: every rule
-- meron under noi.gov by path, revision and state, as Mero says it. Mero sends its own with each
-- question; when they differ, Governance copies before it answers, so it never decides on a stale copy.
ALTER TABLE gov.copies ADD COLUMN version text;
