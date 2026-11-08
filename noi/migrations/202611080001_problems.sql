-- 8 Nov: Mero's problems (agreed: a Problems page in the one app, for owners). Every answer of 500
-- or more, with the request it was: never a header, a body, a query or a token. The runtime login
-- may add and read them, never change them.
CREATE TABLE mer.problems (
 seq bigserial PRIMARY KEY,
 at timestamptz NOT NULL DEFAULT now(),
 request_id text NOT NULL CHECK (length(request_id) <= 64),
 method text NOT NULL CHECK (length(method) <= 16),
 path text NOT NULL CHECK (length(path) <= 300),
 status int NOT NULL CHECK (status BETWEEN 500 AND 599),
 what text NOT NULL CHECK (length(what) <= 1000)
);
CREATE INDEX problems_newest ON mer.problems(at DESC);
REVOKE ALL ON mer.problems FROM PUBLIC;
GRANT SELECT, INSERT ON mer.problems TO noi_mer_runtime;
GRANT USAGE ON SEQUENCE mer.problems_seq_seq TO noi_mer_runtime;
ALTER TABLE mer.problems ENABLE ROW LEVEL SECURITY;
CREATE POLICY backend_only ON mer.problems TO noi_mer_runtime USING (true) WITH CHECK (true);
DO $$ DECLARE r text; BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated','noi_gov_runtime'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
   EXECUTE format('REVOKE ALL ON mer.problems FROM %I', r);
  END IF;
 END LOOP;
END $$;
