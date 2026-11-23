-- 21 Nov 2026 (step 3, agreed 9 Nov: "Where Roles and Rules Live", decision 5): a proposal may
-- retire a meron, with a note saying why or where it went. The roles and rules that moved to
-- Governance are retired this way, approved in Review like any change.
ALTER TABLE mer.proposals DROP CONSTRAINT proposals_operation_check;
ALTER TABLE mer.proposals ADD CONSTRAINT proposals_operation_check
  CHECK (operation IN ('add', 'update', 'rename', 'deprecate', 'reinstate', 'retire'));
