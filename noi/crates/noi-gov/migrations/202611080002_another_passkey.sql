-- 8 Nov: a link for another passkey, for an account that has one already. Made only from this Mac's
-- command line, and recorded: the way to a passkey on a new name (no-origins.localhost on this Mac,
-- later no-origins.com), since a passkey belongs to one name.
ALTER TABLE gov.links DROP CONSTRAINT links_purpose_check;
ALTER TABLE gov.links ADD CONSTRAINT links_purpose_check
  CHECK (purpose IN ('first-passkey', 'invitation', 'another-passkey'));
