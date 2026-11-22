# Local database setup

The project ships with a portable PostgreSQL 16 installation so no administrator rights are required.

## Start

```powershell
$bin = "$env:LOCALAPPDATA\Temp\opencode\pg16\pgsql\bin"
$data = "$env:LOCALAPPDATA\Temp\opencode\pg16\data"
& "$bin\pg_ctl.exe" -D $data -o "-p 55432" -l "$env:LOCALAPPDATA\Temp\opencode\pg16\postgres.log" start
```

## Stop

```powershell
$bin = "$env:LOCALAPPDATA\Temp\opencode\pg16\pgsql\bin"
$data = "$env:LOCALAPPDATA\Temp\opencode\pg16\data"
& "$bin\pg_ctl.exe" -D $data stop
```

## Connection

`.env` already points at:

```text
postgresql://postgres@localhost:55432/zen_invoice?schema=public
```

## Reset and seed

```powershell
npx prisma migrate reset --force
npm run db:seed
```

## Useful checks

```powershell
$bin = "$env:LOCALAPPDATA\Temp\opencode\pg16\pgsql\bin"
& "$bin\psql.exe" -h localhost -p 55432 -U postgres -d zen_invoice -c '\dt'
```

## Hosted database for deployment

Vercel cannot reach `localhost`. For production, create a managed PostgreSQL database (Neon, Supabase, Vercel Postgres, or RDS) and set `DATABASE_URL` as a Vercel environment variable before deploying. Run `npx prisma migrate deploy` against that database, then `npm run db:seed` once to create the demo organization.
