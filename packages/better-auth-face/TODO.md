# better-auth-face — Implementation TODO

## Phase 1: Package Scaffold
- [x] Create `package.json`
- [x] Create `tsconfig.json`
- [x] Create `README.md`

## Phase 2: Face++ API Client
- [x] Create `src/facepp/types.ts` — Face++ response types
- [x] Create `src/facepp/client.ts` — Face++ HTTP wrapper (detect, compare, faceset)

## Phase 3: Server Plugin
- [x] Create `src/constants.ts` — Default config values
- [x] Create `src/types.ts` — Plugin options interface
- [x] Create `src/index.ts` — Better Auth server plugin (schema + 4 endpoints + rate limiting)
  - [x] `POST /face-auth/register` — Enroll face (requires session)
  - [x] `POST /face-auth/verify` — Login via face (public)
  - [x] `POST /face-auth/remove` — Remove faceprint (requires session)
  - [x] `GET /face-auth/status` — Check enrollment (requires session)

## Phase 4: Client Plugin
- [x] Create `src/client.ts` — Better Auth client plugin with $InferServerPlugin

## Phase 5: Integration into FlowStack
- [x] Add `better-auth-face` dependency to `apps/server/package.json`
- [x] Add `better-auth-face` dependency to `apps/web/package.json`
- [x] Add `better-auth-face` dependency to `packages/auth/package.json`
- [x] Add `faceAuth()` plugin to `packages/auth/src/auth.ts`
- [x] Add `faceAuthClient()` plugin to `apps/web/src/lib/auth-client.ts`
- [x] Add `FACEPP_API_KEY` + `FACEPP_API_SECRET` to `packages/auth/src/types.ts` Env interface
- [x] Add `FACEPP_API_KEY` + `FACEPP_API_SECRET` to `apps/server/src/config/env.ts`
- [ ] Add `faceAuthClient` export to `packages/auth/src/client.ts` (NOT NEEDED — imported directly from better-auth-face/client)

## Phase 6: Frontend UI
- [x] Create `apps/web/src/components/face-auth/FaceCamera.tsx` — Webcam capture component
- [x] Create `apps/web/src/components/face-auth/FaceRegister.tsx` — Enrollment UI
- [x] Create `apps/web/src/components/face-auth/FaceLogin.tsx` — Verification/login UI
- [x] Create `apps/web/src/pages/auth/FaceSignIn.tsx` — Standalone face login page
- [x] Integrate FaceLogin into `apps/web/src/pages/auth/AuthPage.tsx` ("Sign in with Face" link)
- [x] Integrate FaceRegister into `apps/web/src/pages/Settings.tsx` (Security section)
- [x] Add face-auth route to `apps/web/src/App.tsx`

## Phase 7: Finalize
- [x] Run `bun install` to link workspace package
- [x] Type check all packages (better-auth-face, auth, server, web) — ALL PASS ✅
- [ ] Run DB migration (`npx @better-auth/cli generate`)
- [ ] Add FACEPP_API_KEY and FACEPP_API_SECRET to .env files
- [ ] Test end-to-end