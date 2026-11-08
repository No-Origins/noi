-- 8 Nov: Governance's problems (agreed: a Problems page in the one app, for owners). Every answer
-- of 500 or more, with the request it was: never a header, a body, a query or a token. The runtime
-- login may add and read them, never change them.
CREATE TABLE gov.problems (
 seq bigserial PRIMARY KEY,
 at timestamptz NOT NULL DEFAULT now(),
 request_id text NOT NULL CHECK (length(request_id) <= 64),
 method text NOT NULL CHECK (length(method) <= 16),
 path text NOT NULL CHECK (length(path) <= 300),
 status int NOT NULL CHECK (status BETWEEN 500 AND 599),
 what text NOT NULL CHECK (length(what) <= 1000)
);
CREATE INDEX problems_newest ON gov.problems(at DESC);
REVOKE ALL ON gov.problems FROM PUBLIC;
GRANT SELECT, INSERT ON gov.problems TO noi_gov_runtime;
GRANT USAGE ON SEQUENCE gov.problems_seq_seq TO noi_gov_runtime;
DO $$ DECLARE r text; BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated','noi_mer_runtime'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
   EXECUTE format('REVOKE ALL ON gov.problems FROM %I', r);
  END IF;
 END LOOP;
END $$;
