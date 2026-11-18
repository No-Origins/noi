-- 8 Nov (agreed): anyone may sign up, as an Observer; every person has an email; a passkey is the
-- way in, and an emailed one-time link is the way back when a passkey is lost.

-- One account for each email, whatever its capitals.
CREATE UNIQUE INDEX one_email ON gov.accounts (lower(email)) WHERE email IS NOT NULL;
-- Every person has an email. NOT VALID: enforced for every new or changed account; the first
-- owner's account gets its email from this Mac's command line (`noi gov account email`).
ALTER TABLE gov.accounts ADD CONSTRAINT person_has_email CHECK (kind <> 'person' OR email IS NOT NULL) NOT VALID;

-- Links for a sign-up whose email was confirmed, and for a lost passkey.
ALTER TABLE gov.links DROP CONSTRAINT links_purpose_check;
ALTER TABLE gov.links ADD CONSTRAINT links_purpose_check
  CHECK (purpose IN ('first-passkey', 'invitation', 'another-passkey', 'sign-up', 'lost-passkey'));

-- A sign-up waiting for its email to be confirmed: no account exists until then. The token is kept
-- only as its SHA-256, the visitor's address only as its SHA-256 (for the hourly limit), and every
-- row ends after a day.
CREATE TABLE gov.sign_ups (
 token_hash bytea PRIMARY KEY CHECK (octet_length(token_hash) = 32),
 email text NOT NULL CHECK (length(email) BETWEEN 3 AND 320),
 handle text NOT NULL CHECK (handle ~ '^[a-z][a-z0-9-]{1,38}[a-z0-9]$' AND position('--' in handle) = 0),
 display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 80),
 address_hash bytea CHECK (address_hash IS NULL OR octet_length(address_hash) = 32),
 made_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 used_at timestamptz
);
CREATE INDEX sign_ups_by_email ON gov.sign_ups (lower(email), made_at);
CREATE INDEX sign_ups_by_address ON gov.sign_ups (address_hash, made_at);
