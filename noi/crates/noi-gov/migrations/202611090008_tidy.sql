-- 9 Nov (agreed, step 7; finding C): Governance clears what has expired every hour, so a quiet site
-- is cleared too: prompts and touches a day after they ended, links a week after, sign-ins a month
-- after. Its own login may remove those rows; the record keeps what happened.
GRANT DELETE ON gov.ceremonies, gov.touches, gov.links, gov.sessions TO noi_gov_runtime;
