# Earlier-stack change record


Before the user's clarification to create this separate stack, the first implementation pass started the existing `supabase_db_no-origins` container and successfully applied the new `xec` schema, its SQLx migration record, backend role and seven proposed entities/ten relationships/17 events. Disposable integration test databases were created and removed there. No existing application tables were reset. The backend role membership was enabled for the migration owner to test runtime permissions.

After the clarification, the implementation moved to the dedicated stack. Earlier additions are retained, rather than deleting data from the existing stack without explicit approval. Any cleanup should first verify that the `xec` schema still contains only this reference seed, back it up, then remove only those additions and their matching migration/role metadata. Do not drop the original database or its volumes.

Official references: [Supabase local configuration](https://supabase.com/docs/guides/local-development/cli/config), [running multiple local projects](https://supabase.com/docs/guides/local-development/running-multiple-local-projects).
