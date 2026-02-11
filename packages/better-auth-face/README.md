# better-auth-face 🧑‍💻🔐

A [Better Auth](https://www.better-auth.com) plugin for **face scan authentication** powered by [Face++ (Megvii)](https://www.faceplusplus.com).

Sign up and log in with just your face — no passwords needed. Works as a drop-in Better Auth plugin, just like `magicLink()`, `organization()`, or `admin()`.

---

## Table of Contents

- [How It Works](#how-it-works)
- [Architecture Overview](#architecture-overview)
- [Face++ APIs Used](#face-apis-used)
- [Database Schema](#database-schema)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Configuration Options](#configuration-options)
- [API Endpoints](#api-endpoints)
- [Client Usage](#client-usage)
- [Two Modes: Email vs Face-Only](#two-modes-email-vs-face-only)
- [Frontend Integration](#frontend-integration)
- [Security Considerations](#security-considerations)
- [Rate Limiting](#rate-limiting)
- [FAQ](#faq)

---

## How It Works

### Sign Up Flow

The user provides their face image (and optionally email/name). The plugin:

```
┌─────────┐      ┌──────────────┐      ┌─────────┐      ┌────────────┐
│  Client  │──1──▶│  Plugin API   │──2──▶│  Face++  │──3──▶│  Database   │
│ (Browser)│◀─6──│  (Better Auth)│◀─5──│  (Cloud) │      │ (Postgres) │
└─────────┘      └──────────────┘      └─────────┘      └────────────┘
```

1. **Client** captures a face image from the webcam and sends it as base64
2. **Plugin** sends the image to Face++ **Detect API** → gets a `face_token`
3. **Plugin** adds the `face_token` to a **FaceSet** on Face++ (like a folder of faces)
4. **Plugin** creates a `user` record and a `face_auth` record in the database
5. **Plugin** creates a session and sets the session cookie
6. **Client** receives the session and is logged in

### Login (Verify) Flow

```
┌─────────┐      ┌──────────────┐      ┌─────────┐      ┌────────────┐
│  Client  │──1──▶│  Plugin API   │──2──▶│  Face++  │      │  Database   │
│ (Browser)│◀─5──│  (Better Auth)│◀─4──│  (Cloud) │◀─3──│ (Postgres) │
└─────────┘      └──────────────┘      └─────────┘      └────────────┘
```

**With email (`requireEmail: true`):**
1. Client sends `{ email, image }`
2. Plugin detects the face → gets a fresh `face_token`
3. Plugin looks up the stored `face_token` from the database (by email → userId)
4. Plugin calls Face++ **Compare API** — compares stored vs fresh face tokens
5. If confidence ≥ threshold → session created, user logged in

**Without email (`requireEmail: false`):**
1. Client sends `{ image }` — that's it, just a face!
2. Plugin detects the face → gets a fresh `face_token`
3. Plugin calls Face++ **Search API** — searches the entire FaceSet for a match
4. If a match is found → looks up the user by `face_token` in the database
5. Session created, user logged in

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                     Frontend (Browser)                    │
│                                                          │
│  ┌──────────┐    ┌───────────────┐    ┌──────────────┐  │
│  │  Webcam   │───▶│  Base64 Image  │───▶│  Auth Client  │ │
│  │  Camera   │    │  (JPEG 0.9)   │    │  (fetch API)  │ │
│  └──────────┘    └───────────────┘    └──────┬───────┘  │
│                                               │          │
└───────────────────────────────────────────────┼──────────┘
                                                │
                                    POST /api/auth/face-auth/*
                                                │
┌───────────────────────────────────────────────┼──────────┐
│                  Backend Server                │          │
│                                               ▼          │
│  ┌──────────────────────────────────────────────────┐    │
│  │            better-auth-face Plugin                │    │
│  │                                                   │    │
│  │  ┌─────────────┐    ┌──────────────────────────┐ │    │
│  │  │  FacePPClient │───▶│  Face++ Cloud API         │ │   │
│  │  │  (HTTP)       │◀──│  (Megvii servers)         │ │   │
│  │  └─────────────┘    └──────────────────────────┘ │    │
│  │         │                                         │    │
│  │         ▼                                         │    │
│  │  ┌─────────────┐    ┌──────────────────────────┐ │    │
│  │  │  DB Adapter   │───▶│  PostgreSQL / SQLite      │ │   │
│  │  │  (Better Auth)│◀──│  (your database)          │ │   │
│  │  └─────────────┘    └──────────────────────────┘ │    │
│  └──────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
```

**Key points:**
- The **base64 image never touches the database** — it's only sent to Face++ for processing
- Only the **face_token** (a short hash) is stored in your database
- Face++ does all the heavy AI/ML work — no models to host or GPU needed
- The plugin serializes Face++ API calls (one at a time) to avoid free-tier concurrency limits

---

## Face++ APIs Used

The plugin uses **4 Face++ REST APIs**. All calls are made server-side — your API keys never reach the browser.

| Face++ API | Endpoint | When Used | What It Does |
|---|---|---|---|
| **Detect** | `POST /facepp/v3/detect` | Every sign-up & login | Takes an image, finds faces, returns a `face_token` (a unique hash for that face snapshot) |
| **Compare** | `POST /facepp/v3/compare` | Login (with email) | Compares two `face_token`s and returns a confidence score (0-100). Used when we already know which user to compare against. |
| **Search** | `POST /facepp/v3/search` | Login (without email) | Searches an entire FaceSet for the best matching face. Used when we don't know who the user is — just "find this face." |
| **FaceSet** | `POST /facepp/v3/faceset/*` | Sign-up & removal | Manages a collection of face_tokens. `create` makes the set, `addface` adds a token, `removeface` removes one. |

### What is a `face_token`?

When you send an image to Face++ Detect, it returns a `face_token` — a **unique identifier** for that particular face detection. Think of it like a fingerprint hash.

- It's a 32-character hex string (e.g., `a912b7c87d9285a70acf40b73ab5aeda`)
- It's **not** the image itself — it's a reference Face++ uses internally
- Face tokens expire after **72 hours** on Face++ servers, BUT tokens stored in a FaceSet are **permanent**
- That's why we add every enrolled face to a FaceSet — so it persists

### What is a FaceSet?

A FaceSet is like a **folder** on Face++ that holds face_tokens permanently. Each app typically uses one FaceSet.

- Free tier: up to 5 FaceSets, 1000 faces each
- The plugin creates one FaceSet automatically on first use (lazy initialization)
- FaceSet ID is configurable (default: `"better-auth-face-default"`)

### API Call Flow Per Endpoint

| Plugin Endpoint | Face++ Calls | Total Calls |
|---|---|---|
| **Sign Up** | `createFaceSet` (once) → `detect` → `search` (if no email) → `addface` | 2-4 |
| **Verify (email)** | `detect` → `compare` | 2 |
| **Verify (face-only)** | `detect` → `search` | 2 |
| **Register** | `detect` → `addface` | 2 |
| **Remove** | `removeface` | 1 |
| **Status** | none | 0 |

---

## Database Schema

The plugin adds a single `face_auth` table to your database:

```sql
CREATE TABLE face_auth (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL UNIQUE REFERENCES user(id) ON DELETE CASCADE,
  face_token  TEXT NOT NULL,
  enrolled_at TIMESTAMP NOT NULL,
  last_verified_at TIMESTAMP,
  confidence  REAL,
  is_active   BOOLEAN NOT NULL DEFAULT true
);
```

| Column | Type | Description |
|---|---|---|
| `id` | string | Unique record ID (auto-generated by Better Auth) |
| `user_id` | string | FK → `user.id`. One face per user (unique constraint). |
| `face_token` | string | The Face++ face_token stored in the FaceSet. 32-char hex. |
| `enrolled_at` | date | When the face was first registered |
| `last_verified_at` | date | Last successful face login timestamp |
| `confidence` | number | Last match confidence score (0-100) |
| `is_active` | boolean | Soft-delete flag. `false` = face disabled but record kept. |

**What's stored vs what's NOT stored:**

| ✅ Stored in your DB | ❌ NOT stored anywhere |
|---|---|
| `face_token` (32-char hash) | The original image |
| Enrollment timestamp | Raw biometric data |
| Confidence scores | Face embeddings/vectors |
| User association | Image pixels |

The actual biometric processing happens entirely on Face++ servers. Your database only holds a reference token.

---

## Installation

```bash
bun add better-auth-face
# or
npm install better-auth-face
# or
pnpm add better-auth-face
```

### Requirements

- Better Auth >= 1.4.0
- Face++ API account — [console.faceplusplus.com](https://console.faceplusplus.com)
- Node.js >= 18 (for native `fetch` and `FormData`)

---

## Quick Start

### 1. Get Face++ API Keys

1. Sign up at [console.faceplusplus.com](https://console.faceplusplus.com)
2. Create an app → get your **API Key** and **API Secret**
3. Add them to your `.env`:

```env
FACEPP_API_KEY=your_api_key_here
FACEPP_API_SECRET=your_api_secret_here
```

### 2. Server Setup

```typescript
import { betterAuth } from "better-auth";
import { faceAuth } from "better-auth-face";

export const auth = betterAuth({
  // ... your existing config
  plugins: [
    faceAuth({
      apiKey: process.env.FACEPP_API_KEY!,
      apiSecret: process.env.FACEPP_API_SECRET!,
    }),
  ],
});
```

### 3. Generate Database Migration

```bash
npx @better-auth/cli generate
```

This creates the `face_auth` table migration. Run your migration tool to apply it.

### 4. Client Setup

```typescript
import { createAuthClient } from "better-auth/react";
import { faceAuthClient } from "better-auth-face/client";

export const authClient = createAuthClient({
  baseURL: "http://localhost:8080",
  plugins: [faceAuthClient()],
});
```

### 5. Use It

```typescript
// Sign up with face (creates account + enrolls face)
await authClient.faceAuth.signUp({
  email: "user@example.com",
  name: "John Doe",
  image: base64Image, // from webcam capture
});

// Login with face
await authClient.faceAuth.verify({
  email: "user@example.com",
  image: base64Image,
});

// Check if face is enrolled (requires active session)
const { data } = await authClient.faceAuth.status();
// → { enrolled: true, enrolledAt: "2024-...", lastVerifiedAt: "2024-..." }

// Register face for existing user (requires active session)
await authClient.faceAuth.register({ image: base64Image });

// Remove enrolled face (requires active session)
await authClient.faceAuth.remove();
```

---

## Configuration Options

```typescript
faceAuth({
  // Required
  apiKey: string,          // Face++ API Key
  apiSecret: string,       // Face++ API Secret

  // Optional
  baseUrl?: string,        // Default: "https://api-us.faceplusplus.com"
                           // Use "https://api-cn.faceplusplus.com" for China
  faceSetId?: string,      // Default: "better-auth-face-default"
  confidenceThreshold?: number, // Default: 80 (0-100 scale)
  requireEmail?: boolean,  // Default: true
})
```

| Option | Default | Description |
|---|---|---|
| `apiKey` | — | **(Required)** Your Face++ API Key |
| `apiSecret` | — | **(Required)** Your Face++ API Secret |
| `baseUrl` | `"https://api-us.faceplusplus.com"` | Face++ region. US or China (`api-cn`). |
| `faceSetId` | `"better-auth-face-default"` | ID for the FaceSet grouping all enrolled faces. One per app/environment. |
| `confidenceThreshold` | `80` | Minimum confidence (0-100) to accept a face match. Higher = stricter. |
| `requireEmail` | `true` | If `false`, sign-up & login work with face only — no email needed. |

---

## API Endpoints

### `POST /api/auth/face-auth/sign-up`

Create a new account with face authentication.

**Auth:** Public (no session needed)

**Body:**
```json
{
  "email": "user@example.com",  // Required if requireEmail: true
  "name": "John Doe",           // Always required
  "image": "/9j/4AAQ..."        // Base64-encoded face image
}
```

**Response:**
```json
{
  "success": true,
  "message": "Account created with face authentication.",
  "token": "session-token-here",
  "user": {
    "id": "abc123",
    "email": "user@example.com",
    "name": "John Doe"
  }
}
```

**What happens:**
1. Validates input, checks for existing email
2. Calls Face++ Detect → gets `face_token`
3. (If `requireEmail: false`) Calls Face++ Search to check face isn't already registered
4. Calls Face++ FaceSet AddFace → stores `face_token` permanently
5. Creates `user` and `face_auth` records in database
6. Creates session + sets cookie → user is logged in

---

### `POST /api/auth/face-auth/verify`

Login using face scan.

**Auth:** Public (no session needed)

**Body (with email):**
```json
{
  "email": "user@example.com",
  "image": "/9j/4AAQ..."
}
```

**Body (face-only, when `requireEmail: false`):**
```json
{
  "image": "/9j/4AAQ..."
}
```

**Response:**
```json
{
  "success": true,
  "token": "session-token-here",
  "confidence": 96.745
}
```

**What happens (with email):**
1. Calls Face++ Detect → gets fresh `face_token`
2. Looks up user by email → gets stored `face_token` from database
3. Calls Face++ Compare → compares fresh vs stored tokens
4. If confidence ≥ threshold → creates session, sets cookie, user logged in

**What happens (face-only):**
1. Calls Face++ Detect → gets fresh `face_token`
2. Calls Face++ Search → searches entire FaceSet for best match
3. If match found with confidence ≥ threshold → looks up user by matched `face_token`
4. Creates session, sets cookie, user logged in

---

### `POST /api/auth/face-auth/register`

Enroll a face for an already signed-in user (e.g., they signed up with email/password and want to add face login).

**Auth:** Session required

**Body:**
```json
{
  "image": "/9j/4AAQ..."
}
```

**Response:**
```json
{
  "success": true,
  "message": "Face registered successfully."
}
```

---

### `POST /api/auth/face-auth/remove`

Remove the enrolled face for the signed-in user.

**Auth:** Session required

**Body:** None

**Response:**
```json
{
  "success": true,
  "message": "Face removed successfully."
}
```

---

### `GET /api/auth/face-auth/status`

Check whether the signed-in user has face authentication enrolled.

**Auth:** Session required

**Response:**
```json
{
  "enrolled": true,
  "enrolledAt": "2024-01-15T10:30:00.000Z",
  "lastVerifiedAt": "2024-01-16T08:15:00.000Z"
}
```

---

## Client Usage

The client plugin auto-infers all endpoints from the server plugin. All methods are available under `authClient.faceAuth.*`:

```typescript
import { createAuthClient } from "better-auth/react";
import { faceAuthClient } from "better-auth-face/client";

const authClient = createAuthClient({
  baseURL: "http://localhost:8080",
  plugins: [faceAuthClient()],
});

// All methods return { data, error }
const { data, error } = await authClient.faceAuth.verify({
  email: "user@example.com",
  image: base64Image,
});

if (error) {
  console.error(error.message);
} else {
  console.log("Logged in!", data.confidence);
}
```

| Method | Description |
|---|---|
| `authClient.faceAuth.signUp({ email?, name, image })` | Create account with face |
| `authClient.faceAuth.verify({ email?, image })` | Login with face |
| `authClient.faceAuth.register({ image })` | Enroll face (session required) |
| `authClient.faceAuth.remove()` | Remove face (session required) |
| `authClient.faceAuth.status()` | Check enrollment (session required) |

---

## Two Modes: Email vs Face-Only

### Email Mode (`requireEmail: true` — default)

Best for: public-facing apps where users have email accounts.

```typescript
faceAuth({
  apiKey: "...",
  apiSecret: "...",
  // requireEmail defaults to true
})
```

- **Sign-up** requires: `{ email, name, image }`
- **Login** requires: `{ email, image }` — email identifies the user, face verifies them
- Uses Face++ **Compare** API (1:1 matching)

### Face-Only Mode (`requireEmail: false`)

Best for: internal kiosks, check-in systems, attendance, access control — anywhere email isn't practical.

```typescript
faceAuth({
  apiKey: "...",
  apiSecret: "...",
  requireEmail: false,
})
```

- **Sign-up** requires: `{ name, image }` — a placeholder email is auto-generated (e.g., `face_a912b7c87d92@internal.face-auth`)
- **Login** requires: `{ image }` — just scan your face, the system finds you!
- Uses Face++ **Search** API (1:N matching — searches all enrolled faces)
- You can still optionally pass email in either mode (hybrid)

---

## Frontend Integration

### Capturing a Face Image

The plugin expects a **base64-encoded JPEG image** (without the `data:image/...;base64,` prefix). Here's a minimal webcam capture:

```tsx
// React example
function CaptureButton({ onCapture }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user" } })
      .then((stream) => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      });
  }, []);

  const capture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);

    const base64 = canvas.toDataURL("image/jpeg", 0.9)
      .replace(/^data:image\/\w+;base64,/, "");

    onCapture(base64);
  };

  return (
    <>
      <video ref={videoRef} autoPlay playsInline muted />
      <canvas ref={canvasRef} hidden />
      <button onClick={capture}>Capture</button>
    </>
  );
}
```

### Full Sign-Up Example

```tsx
function FaceSignUp() {
  const { authClient } = useAuthClient();

  const handleCapture = async (base64: string) => {
    const { data, error } = await authClient.faceAuth.signUp({
      name: "John Doe",
      email: "john@example.com", // optional if requireEmail: false
      image: base64,
    });

    if (error) {
      alert(error.message);
    } else {
      // User is now signed in — redirect to dashboard
      window.location.href = "/dashboard";
    }
  };

  return <CaptureButton onCapture={handleCapture} />;
}
```

### Full Login Example

```tsx
function FaceLogin() {
  const { authClient } = useAuthClient();

  const handleCapture = async (base64: string) => {
    const { data, error } = await authClient.faceAuth.verify({
      image: base64, // face-only mode — no email needed!
    });

    if (error) {
      alert(error.message);
    } else {
      console.log(`Match confidence: ${data.confidence}%`);
      window.location.href = "/dashboard";
    }
  };

  return <CaptureButton onCapture={handleCapture} />;
}
```

### Cross-Origin Cookie Setup (Development)

If your frontend and backend are on different ports (e.g., Vite on `:3000`, API on `:8080`), you need a proxy for session cookies to work:

```typescript
// vite.config.ts
export default defineConfig({
  server: {
    proxy: {
      "/api/auth": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
});
```

And set the auth client to use a relative URL in development:

```typescript
const baseURL = import.meta.env.PROD
  ? import.meta.env.VITE_API_BASE_URL
  : ""; // empty = same origin = goes through Vite proxy
```

---

## Security Considerations

| Concern | How It's Handled |
|---|---|
| **API keys in browser?** | No. All Face++ calls are server-side. Keys never reach the client. |
| **Images stored in DB?** | No. Only the `face_token` (32-char hash) is stored. Images are sent to Face++ and discarded. |
| **Biometric data?** | Face embeddings/vectors live only on Face++ servers. Your database has no biometric data. |
| **Brute force?** | Built-in rate limiting: 5 verify attempts/min, 3 sign-up attempts/min. |
| **Session management** | Uses Better Auth's cookie-based sessions. Same security as email/password login. |
| **HTTPS** | Face++ API calls use HTTPS. Your API should also use HTTPS in production. |
| **Face token expiry** | Tokens in a FaceSet are permanent. Standalone tokens expire after 72 hours (not an issue since we always use FaceSets). |

---

## Rate Limiting

The plugin includes built-in rate limits:

| Endpoint | Max Requests | Window |
|---|---|---|
| `/face-auth/verify` | 5 | 60 seconds |
| `/face-auth/register` | 3 | 60 seconds |
| `/face-auth/sign-up` | 3 | 60 seconds |

These are enforced by Better Auth's rate limiter and are on top of Face++ API's own rate limits.

### Face++ Free Tier Limits

- **1 concurrent request** (the plugin handles this with a request queue)
- **1000 faces per FaceSet**
- **3 QPS** (queries per second)

The plugin automatically serializes requests and retries on `CONCURRENCY_LIMIT_EXCEEDED` errors with exponential backoff.

---

## FAQ

### Q: Is Face++ free?

**Yes, for development and small-scale use.** The free tier includes:
- 1000 API calls/day
- 1 concurrent request (the plugin handles queuing)
- 5 FaceSets, 1000 faces each

For production, Face++ offers paid plans with higher limits. See [faceplusplus.com/pricing](https://www.faceplusplus.com/pricing).

### Q: Can I use this without email at all?

**Yes!** Set `requireEmail: false` and users can sign up and log in with just their face. The plugin generates a placeholder email internally (e.g., `face_a912b7c87d92@internal.face-auth`) because Better Auth requires the email field in the user table.

### Q: What happens if Face++ is down?

Sign-up and login will fail with an error message. Existing sessions are unaffected since session validation doesn't require Face++. Only enrollment and verification need Face++ to be available.

### Q: Can one person have multiple faces enrolled?

**Not currently.** The `face_auth` table has a unique constraint on `user_id` — one face per user. To re-enroll, the user must first remove their existing face via `/face-auth/remove`, then register a new one.

### Q: How accurate is the face matching?

Face++ reports **99.5%+ accuracy** on standard benchmarks. In practice:
- Same person, same lighting: **90-99%** confidence
- Same person, different conditions: **75-95%** confidence
- Different people: **0-30%** confidence

The default threshold is **80**. Increase it for stricter matching (fewer false positives) or decrease it for more lenient matching (fewer false negatives).

### Q: What image format should I send?

Base64-encoded **JPEG** is recommended (smaller than PNG). The plugin accepts any image format Face++ supports (JPEG, PNG, BMP). Max file size: **2MB**.

Send the base64 string **without** the `data:image/...;base64,` prefix.

### Q: Does this work on mobile?

**Yes.** The webcam API (`getUserMedia`) works on mobile browsers. Use `facingMode: "user"` for the front camera. The Face++ API doesn't care about the source — it just needs an image.

### Q: Can I use a different face recognition provider?

Not currently — the plugin is built specifically for Face++. However, the architecture is modular. The `FacePPClient` class is isolated in `src/facepp/client.ts`, so swapping providers would mainly involve replacing that client.

### Q: Is the face image sent to my server?

**Yes, temporarily.** The base64 image is sent from the browser to your server (in the request body), then your server forwards it to Face++ for processing. The image is **not stored** anywhere — it exists only in memory during the request.

### Q: What about privacy regulations (GDPR, etc.)?

- Your database stores only a `face_token` (a reference hash), not biometric data
- The actual biometric processing happens on Face++ servers (Megvii, based in China/US depending on region)
- You should review Face++ data processing terms and ensure compliance with your jurisdiction
- Consider using the US endpoint (`api-us.faceplusplus.com`) for data residency in the US
- Users should be informed that facial recognition is used and consent appropriately

### Q: Can I self-host the face recognition?

**Not with this plugin.** It relies on Face++ cloud API. For self-hosted face recognition, you'd need a different solution like InsightFace, DeepFace, or OpenCV, which would require significant changes to the plugin.

### Q: Why does the first request take so long?

The first request creates the FaceSet on Face++ (one-time setup). Also, Face++ free tier has high latency (~3-5 seconds per API call). Sign-up makes 2-4 API calls, so it can take **10-15 seconds**. Subsequent logins are faster (2 API calls, ~6-10 seconds).

The plugin is designed to avoid database connection timeouts during these long Face++ calls by separating DB operations from Face++ operations into distinct phases.

---

## Environment Variables

```env
# Required
FACEPP_API_KEY=your_api_key
FACEPP_API_SECRET=your_api_secret

# Optional
FACEPP_BASE_URL=https://api-us.faceplusplus.com  # or api-cn for China
FACEPP_CONFIDENCE_THRESHOLD=80                    # 0-100
FACEPP_FACESET_ID=my-app-production              # custom FaceSet name
FACEPP_REQUIRE_EMAIL=false                        # face-only mode
```

---

## License

MIT