-- Governance's own schema: who (accounts, handles, passkeys, links), proof (sessions, touches, run
-- tokens), access (grants, and its own copy of the roles and rules approved in Mero) and the record.
-- Only Governance reads or writes it. Nothing stored here can sign anyone in: passkeys are public
-- halves, and sessions, links and run tokens are kept only as SHA-256 hashes.
CREATE SCHEMA gov;
REVOKE ALL ON SCHEMA gov FROM PUBLIC;

CREATE TABLE gov.accounts (
 id uuid PRIMARY KEY,
 handle text NOT NULL UNIQUE CHECK (handle ~ '^[a-z][a-z0-9-]{1,38}[a-z0-9]$' AND position('--' in handle) = 0),
 display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 80),
 -- visitors stands for everyone signed out: an owner may grant it reading, and nothing more.
 kind text NOT NULL CHECK (kind IN ('person','agent','visitors')),
 state text NOT NULL CHECK (state IN ('invited','active','suspended','closed')),
 made_by uuid REFERENCES gov.accounts(id),
 made_at timestamptz NOT NULL DEFAULT now(),
 email text CHECK (email IS NULL OR (kind = 'person' AND length(email) <= 320)),
 sponsor uuid REFERENCES gov.accounts(id),
 purpose text CHECK (purpose IS NULL OR length(btrim(purpose)) BETWEEN 1 AND 400),
 vouched_by text,
 CHECK ((kind = 'agent') = (sponsor IS NOT NULL AND purpose IS NOT NULL AND vouched_by IS NOT NULL))
);
CREATE UNIQUE INDEX one_visitors ON gov.accounts(kind) WHERE kind = 'visitors';
-- Every handle ever used. A handle is never given to anyone else, even after its account closes.
CREATE TABLE gov.handles (
 handle text PRIMARY KEY,
 account uuid NOT NULL REFERENCES gov.accounts(id),
 since timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE gov.passkeys (
 id uuid PRIMARY KEY,
 account uuid NOT NULL REFERENCES gov.accounts(id),
 name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
 credential_id bytea NOT NULL UNIQUE,
 -- The public half and its counter, as webauthn-rs keeps them.
 passkey jsonb NOT NULL,
 added_at timestamptz NOT NULL DEFAULT now(),
 last_used_at timestamptz,
 removed_at timestamptz
);
-- One-time links: the first passkey, and invitations.
CREATE TABLE gov.links (
 token_hash bytea PRIMARY KEY CHECK (octet_length(token_hash) = 32),
 purpose text NOT NULL CHECK (purpose IN ('first-passkey','invitation')),
 account uuid NOT NULL REFERENCES gov.accounts(id),
 made_by uuid REFERENCES gov.accounts(id),
 made_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 used_at timestamptz
);
-- A passkey ceremony in progress: its challenge state stays here, never in the browser.
CREATE TABLE gov.ceremonies (
 id uuid PRIMARY KEY,
 kind text NOT NULL CHECK (kind IN ('register','sign-in','touch')),
 account uuid NOT NULL REFERENCES gov.accounts(id),
 state jsonb NOT NULL,
 link bytea REFERENCES gov.links(token_hash),
 session bytea,
 intent jsonb,
 expires_at timestamptz NOT NULL,
 finished_at timestamptz
);
CREATE TABLE gov.sessions (
 token_hash bytea PRIMARY KEY CHECK (octet_length(token_hash) = 32),
 account uuid NOT NULL REFERENCES gov.accounts(id),
 started_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 ended_at timestamptz,
 ended_by uuid REFERENCES gov.accounts(id)
);
-- A fresh touch: a passkey signature over exactly one action on exactly these resources, usable once.
CREATE TABLE gov.touches (
 id uuid PRIMARY KEY,
 session bytea NOT NULL REFERENCES gov.sessions(token_hash),
 account uuid NOT NULL REFERENCES gov.accounts(id),
 intent jsonb NOT NULL,
 touched_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 used_at timestamptz
);
CREATE TABLE gov.run_tokens (
 token_hash bytea PRIMARY KEY CHECK (octet_length(token_hash) = 32),
 agent uuid NOT NULL REFERENCES gov.accounts(id),
 run text NOT NULL CHECK (length(run) BETWEEN 1 AND 200),
 started_by uuid REFERENCES gov.accounts(id),
 vouched_by text NOT NULL,
 issued_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 ended_at timestamptz,
 ended_by uuid REFERENCES gov.accounts(id)
);
-- Who may vouch for agents: one row per platform block, holding only a public key.
CREATE TABLE gov.vouchers (
 name text PRIMARY KEY CHECK (name ~ '^[a-z][a-z0-9:-]{1,79}$'),
 algorithm text NOT NULL CHECK (algorithm = 'EdDSA'),
 public_key text NOT NULL,
 added_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE gov.grants (
 id uuid PRIMARY KEY,
 account uuid NOT NULL REFERENCES gov.accounts(id),
 role text NOT NULL,
 scope text NOT NULL CHECK (scope ~ '^noi(\.[a-z][a-z0-9-]{0,62})*$'),
 granted_by uuid REFERENCES gov.accounts(id),
 granted_at timestamptz NOT NULL DEFAULT now(),
 ended_at timestamptz,
 ended_by uuid REFERENCES gov.accounts(id),
 end_reason text
);
CREATE UNIQUE INDEX one_live_grant ON gov.grants(account, role, scope) WHERE ended_at IS NULL;
-- Governance's own copy of the roles and rules approved in Mero under noi.gov.
CREATE TABLE gov.copies (
 id bigserial PRIMARY KEY,
 at timestamptz NOT NULL DEFAULT now(),
 source text NOT NULL,
 roles int NOT NULL,
 rules int NOT NULL
);
CREATE TABLE gov.policies (
 path text PRIMARY KEY,
 kind text NOT NULL CHECK (kind IN ('role','rule')),
 system text,
 cedar text NOT NULL,
 state text NOT NULL CHECK (state IN ('active','deprecated')),
 revision bigint NOT NULL,
 copy bigint NOT NULL REFERENCES gov.copies(id)
);
-- Every answer and every sign-in. Nothing in it is ever changed or removed.
CREATE TABLE gov.record (
 seq bigserial PRIMARY KEY,
 at timestamptz NOT NULL DEFAULT now(),
 kind text NOT NULL,
 account uuid,
 action text,
 resources jsonb NOT NULL DEFAULT '[]',
 allowed boolean NOT NULL,
 reason text NOT NULL,
 detail jsonb NOT NULL DEFAULT '{}'
);
CREATE FUNCTION gov.append_only() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
 RAISE EXCEPTION 'the Governance record is append-only';
END $$;
CREATE TRIGGER record_append_only BEFORE UPDATE OR DELETE ON gov.record FOR EACH ROW EXECUTE FUNCTION gov.append_only();
CREATE TRIGGER record_no_truncate BEFORE TRUNCATE ON gov.record FOR EACH STATEMENT EXECUTE FUNCTION gov.append_only();
CREATE TRIGGER handles_append_only BEFORE UPDATE OR DELETE ON gov.handles FOR EACH ROW EXECUTE FUNCTION gov.append_only();

-- Everyone signed out.
INSERT INTO gov.accounts(id, handle, display_name, kind, state)
 VALUES ('00000000-0000-4000-8000-000000000001', 'visitors', 'Visitors', 'visitors', 'active');
INSERT INTO gov.handles(handle, account) VALUES ('visitors', '00000000-0000-4000-8000-000000000001');

-- The runtime role Governance's server acts as. Mero's role gets nothing here.
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='noi_gov_runtime') THEN CREATE ROLE noi_gov_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE; END IF; END $$;
GRANT USAGE ON SCHEMA gov TO noi_gov_runtime;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA gov TO noi_gov_runtime;
REVOKE UPDATE ON gov.record, gov.handles FROM noi_gov_runtime;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA gov TO noi_gov_runtime;
GRANT DELETE ON gov.policies TO noi_gov_runtime;
REVOKE ALL ON FUNCTION gov.append_only() FROM PUBLIC;
DO $$ DECLARE r text; BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated','noi_mer_runtime'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
   EXECUTE format('REVOKE ALL ON SCHEMA gov FROM %I', r);
   EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA gov FROM %I', r);
  END IF;
 END LOOP;
END $$;
