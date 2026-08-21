# Gate 4 preview acceptance

Local database reset and RLS tests prove the migration files work in CI. They do not prove the hosted Sydney project is current.

Before handing a database-backed preview to human QA:

1. Apply all committed migrations to the linked hosted Supabase project.
2. Run `pnpm verify:hosted-schema` with the preview's public Supabase URL and publishable key.
3. Confirm application CI and the PostgreSQL/RLS job pass.
4. Confirm Vercel reports the exact branch commit as Ready.
5. Exercise Owner/Planner and Viewer/outsider access before acceptance.

The hosted-schema check only reports whether required public API resources exist. It does not print credentials or traveller data.
