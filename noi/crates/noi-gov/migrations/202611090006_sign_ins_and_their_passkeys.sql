-- 9 Nov (step 4): sign-ins made before a sign-in remembered its passkey learn it from the record.
-- A sign-in and its record entry were written in one transaction, so they share the same time, the
-- same account, and the record names the passkey. Nothing else changes.
UPDATE gov.sessions s
SET passkey = (r.detail->>'passkey')::uuid
FROM gov.record r
WHERE s.passkey IS NULL
  AND r.kind = 'sign-in'
  AND r.allowed
  AND r.account = s.account
  AND r.at = s.started_at
  AND r.detail->>'passkey' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND EXISTS (SELECT 1 FROM gov.passkeys p WHERE p.id = (r.detail->>'passkey')::uuid AND p.account = s.account);
