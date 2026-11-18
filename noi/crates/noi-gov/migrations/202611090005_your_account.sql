-- 9 Nov (agreed, step 4): Your account. A sign-in and a touch remember the passkey that made them,
-- so removing a passkey ends the sign-ins it made, and never the one you confirm with; a passkey
-- can be added while signed in; and a new email waits until a link sent to it is opened.
ALTER TABLE gov.sessions ADD COLUMN passkey uuid REFERENCES gov.passkeys(id);
ALTER TABLE gov.touches ADD COLUMN passkey uuid REFERENCES gov.passkeys(id);

ALTER TABLE gov.ceremonies DROP CONSTRAINT ceremonies_kind_check;
ALTER TABLE gov.ceremonies ADD CONSTRAINT ceremonies_kind_check
  CHECK (kind IN ('register', 'sign-in', 'touch', 'add-passkey'));

-- A new email, waiting for its link to be opened. The token is kept only as its SHA-256; a row
-- lasts 30 minutes, and rows older than a day go when the next one is made.
CREATE TABLE gov.email_changes (
 token_hash bytea PRIMARY KEY CHECK (octet_length(token_hash) = 32),
 account uuid NOT NULL REFERENCES gov.accounts(id),
 email text NOT NULL CHECK (length(email) BETWEEN 3 AND 320),
 made_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 used_at timestamptz
);
CREATE INDEX email_changes_by_account ON gov.email_changes (account, made_at);
REVOKE ALL ON gov.email_changes FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON gov.email_changes TO noi_gov_runtime;
DO $$ DECLARE r text; BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated','noi_mer_runtime'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
   EXECUTE format('REVOKE ALL ON gov.email_changes FROM %I', r);
  END IF;
 END LOOP;
END $$;
