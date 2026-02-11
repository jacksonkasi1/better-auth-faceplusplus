# better-auth-faceplusplus

Minimal example monorepo for Face++ authentication with:

- `apps/web`: Vite + React face sign-up/sign-in UI
- `apps/server`: Hono server exposing Better Auth endpoints
- `packages/db`: Drizzle ORM schema/client
- `packages/auth`: minimal Better Auth config
- `packages/better-auth-face`: Face++ Better Auth plugin

## Run

1. Install dependencies

```bash
bun install
```

2. Configure env files

- `apps/server/.env`
- `apps/web/.env`

3. Start server and web

```bash
bun run dev:server
bun run dev:web
```

## Validate

```bash
bun run check-types
bun run build
```
