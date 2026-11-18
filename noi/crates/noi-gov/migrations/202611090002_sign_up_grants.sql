-- 9 Nov: Governance's own login may use the sign-up table: read it, add to it, mark a sign-up used,
-- and end those older than a day. Left out of 202611090001, so opening any link failed.
GRANT SELECT, INSERT, UPDATE, DELETE ON gov.sign_ups TO noi_gov_runtime;
