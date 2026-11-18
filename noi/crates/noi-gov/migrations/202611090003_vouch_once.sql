-- 9 Nov (review): a vouch buys one run token. Its SHA-256 is kept with the token it bought, so the
-- same vouch is refused the second time.
ALTER TABLE gov.run_tokens ADD COLUMN vouch_hash bytea UNIQUE CHECK (vouch_hash IS NULL OR octet_length(vouch_hash) = 32);
