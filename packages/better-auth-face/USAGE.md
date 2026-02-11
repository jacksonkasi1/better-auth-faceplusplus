# better-auth-face

A [Better Auth](https://www.better-auth.com) plugin for face scan authentication powered by [Face++ (Megvii)](https://www.faceplusplus.com).

Provides face registration (faceprint enrollment) and face login (verification/comparison) as a drop-in Better Auth plugin — just like `magicLink()`, `organization()`, or `admin()`.

## Installation

```bash
# In a monorepo with workspace
bun add better-auth-face
```

## Quick Start

### Server

```typescript
import { betterAuth } from "better-auth";
import { faceAuth } from "better-auth-face";

export const auth = betterAuth({
  // ... your config
  plugins: [
    faceAuth({
      apiKey: process.env.FACEPP_API_KEY!,
      apiSecret: process.env.FACEPP_API_SECRET!,
      // Optional:
      // confidenceThreshold: 85,
      // faceSetId: "my-app-prod",
      // baseUrl: "https://api-cn.faceplusplus.com",
    }),
  ],
});
```

### Client

```typescript
import { createAuthClient } from "better-auth/react";
import { faceAuthClient } from "better-auth-face/client";

export const authClient = createAuthClient({
  baseURL: "http://localhost:8080",
  plugins: [faceAuthClient()],
});
```

### Usage

```typescript
// Register face (user must be signed in)
await authClient.faceAuth.register({ image: base64Image });

// Login with face
await authClient.faceAuth.verify({ email: "user@example.com", image: base64Image });

// Check enrollment status
const { data } = await authClient.faceAuth.status();

// Remove enrolled face
await authClient.faceAuth.remove();
```

## API Endpoints

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/api/auth/face-auth/register` | POST | Session required | Enroll faceprint |
| `/api/auth/face-auth/verify` | POST | Public | Login via face |
| `/api/auth/face-auth/remove` | POST | Session required | Remove faceprint |
| `/api/auth/face-auth/status` | GET | Session required | Check enrollment |

## Database

The plugin auto-defines a `face_auth` table schema. Run the Better Auth CLI to generate the migration:

```bash
npx @better-auth/cli generate
```

## Environment Variables

```env
FACEPP_API_KEY=your_api_key
FACEPP_API_SECRET=your_api_secret
```

## Requirements

- Better Auth >= 1.4.0
- Face++ API account ([console.faceplusplus.com](https://console.faceplusplus.com))