-- 9 Nov (agreed, step 7; finding B): a sign-up's account is made when its passkey is, not when
-- "Add a passkey" is pressed. Until then its passkey prompt names nobody: it is a sign-up's, and
-- holds the account ID the passkey will carry.
ALTER TABLE gov.ceremonies DROP CONSTRAINT ceremonies_kind_check;
ALTER TABLE gov.ceremonies ADD CONSTRAINT ceremonies_kind_check
  CHECK (kind IN ('register', 'sign-in', 'touch', 'add-passkey', 'sign-up'));
ALTER TABLE gov.ceremonies DROP CONSTRAINT only_a_sign_in_names_nobody;
ALTER TABLE gov.ceremonies ADD CONSTRAINT only_a_sign_in_names_nobody
  CHECK (account IS NOT NULL OR kind IN ('sign-in', 'sign-up'));
