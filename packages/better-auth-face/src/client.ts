import type { BetterAuthClientPlugin } from "better-auth/client";
import type { faceAuth } from "./index";

type FaceAuthPlugin = typeof faceAuth;

/**
 * Client plugin for better-auth-face.
 *
 * Automatically infers all server endpoints as client methods:
 *
 * - `authClient.faceAuth.register({ image })` — enroll face (session required)
 * - `authClient.faceAuth.verify({ email, image })` — login via face
 * - `authClient.faceAuth.remove()` — remove enrolled face (session required)
 * - `authClient.faceAuth.status()` — check enrollment (session required)
 *
 * @example
 * ```ts
 * import { createAuthClient } from "better-auth/react";
 * import { faceAuthClient } from "better-auth-face/client";
 *
 * export const authClient = createAuthClient({
 *   baseURL: "http://localhost:8080",
 *   plugins: [faceAuthClient()],
 * });
 *
 * // Register face (user must be signed in)
 * await authClient.faceAuth.register({ image: base64String });
 *
 * // Login with face
 * await authClient.faceAuth.verify({ email: "user@example.com", image: base64String });
 * ```
 */
export const faceAuthClient = () => {
  return {
    id: "face-auth",
    $InferServerPlugin: {} as ReturnType<FaceAuthPlugin>,
  } satisfies BetterAuthClientPlugin;
};