-- 7 Nov: a session gets a public ID and the device it was made on, so a person's Profile can list
-- where they are signed in and end one, without showing anything that could sign anyone in.
ALTER TABLE gov.sessions ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE gov.sessions ADD CONSTRAINT sessions_id_unique UNIQUE (id);
ALTER TABLE gov.sessions ADD COLUMN device text CHECK (device IS NULL OR length(device) <= 80);
