-- 9 Nov (agreed): signing in without typing. The browser offers this site's passkeys and the one
-- picked says whose it is, so that sign-in prompt is made for nobody yet. Only a sign-in may be.
ALTER TABLE gov.ceremonies ALTER COLUMN account DROP NOT NULL;
ALTER TABLE gov.ceremonies ADD CONSTRAINT only_a_sign_in_names_nobody CHECK (account IS NOT NULL OR kind = 'sign-in');
