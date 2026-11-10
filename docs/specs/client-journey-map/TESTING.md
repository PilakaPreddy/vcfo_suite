# Client journey map: local testing

This is how the journey map was checked on 2026-11-09 in a container without Docker. On a laptop
with Docker, `npm run infra:up` and `npm run dev` replace the Postgres and server steps below.

## The local stack

Postgres 16 runs from `/usr/lib/postgresql/16/bin` with its data in `/tmp/pgdata`, as the
`postgres` system user, on port 5432, logging to `/tmp/pg.log`. The database is `vcfo`, owned by
the role `vcfo` with the password `vcfo_local_dev`, which is the `DATABASE_URL` in `.env.example`.
The pgvector package (`postgresql-16-pgvector`) is installed because migration 0047 needs it.
MinIO is not running, so uploads and document previews fail; the journey map does not need them.

`.env.local` is a copy of `.env.example` with a fresh `AUTH_SECRET`, `AUTH_URL` and `NEXTAUTH_URL`
set to `http://localhost:3000`, and `NEXT_PUBLIC_DEMO_LOGINS="on"`. It is ignored by git.

## Restart commands

Start Postgres if it has stopped:

```bash
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D /tmp/pgdata -l /tmp/pg.log -o '-p 5432 -k /tmp' start"
```

Start the dev server in the background (plain `npm run dev` runs `docker compose` first, which fails
here):

```bash
cd /home/user/vcfo_suite && npm run css:portal && (NODE_OPTIONS=--max-old-space-size=6144 nohup npx next dev -p 3000 > /tmp/next-dev.log 2>&1 &)
```

Stop them with `pkill -f "next dev"` and
`su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D /tmp/pgdata stop"`.

Rebuild the data with `npm run db:migrate`, `npm run db:seed` and `npm run db:seed-demo`.

## Demo client login

Open http://localhost:3000/login and sign in as `client-kestrel@demo.vcfo.local` with the password
`demo1234`. Kestrel is mid incorporation (9 of 14, step KYC Review and DSC), so the map opens on
Incorporation with a "Your next step" banner. `client-northwind@demo.vcfo.local` (same password)
is earlier in Part A. The home page is `/app/client/overview`. The portal intro plays once per
browser; Skip closes it.

## Browser test

```bash
npx playwright install chromium     # once, for the repository's Playwright version
npx playwright test e2e/client-journey.spec.ts --project=chromium --trace off --reporter=list
```

The spec signs in as the client, checks the stage tracker, opens a branch of the tree, opens a
group's panel, counts its checklist rows and follows "Open step", then opens the panel from the
next-step banner.

## What was checked by hand

At 1280 px (light and dark) and 390 px: the map is the first card, the tracker shows the current
stage, clicking a stage opens its tree, dragging the background or a card pans in Move map,
Arrange cards moves a card and Reset layout puts it back, Metro shows the train on the current
station, the banner and a card both open the panel with its checklist, "Open step" goes to the step
page, the panel is a bottom sheet on the phone, there is no sideways page scroll, and the console
has no errors. Screenshots are in `screens/` (`desktop-light.png`, `desktop-dark.png`, `phone.png`,
`panel.png`).
