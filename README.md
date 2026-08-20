# SUN Trip

A mobile-first collaborative trip-planning workspace built around trustworthy data,
deterministic checks and protected What If scenarios.

## Gate 1 scope

This repository currently contains foundation work only:

- Next.js App Router with strict TypeScript
- environment validation and Supabase SSR clients
- profiles, trips, members and invitations schema
- trip-membership Row Level Security
- atomic trip creation with owner membership
- database security tests
- Vercel-ready application and CI checks

Gate 2 adds email/password sign-up, sign-in, sign-out, persisted SSR sessions, safe auth
callbacks, protected `/app` routes and tested redirect rules. Planning features, Thailand
data, Trip Check and scenario UI are intentionally not implemented yet.

## Local setup

1. Install Node.js 22 and pnpm 10.
2. Copy `.env.example` to `.env.local` and set your Supabase project values.
3. Run `pnpm install`.
4. Run `pnpm dev`.

The public landing page and `/api/health` work without calling Supabase. Authenticated
features introduced in later gates will require the environment values.

## Database

Install the Supabase CLI, then run:

```sh
supabase start
supabase db reset
supabase test db
```

Never expose a Supabase service-role key to the browser or commit environment files.

## Deployment

Connect this repository to Vercel. Add `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` separately for Preview and Production. Configure
the matching callback URLs in Supabase Auth before authentication is enabled.

For local development, allow `http://localhost:3000/auth/callback`. For Vercel, add the
Preview and Production `/auth/callback` URLs. Email/password authentication must be enabled
in Supabase; choose whether email confirmation is required before private-alpha testing.
