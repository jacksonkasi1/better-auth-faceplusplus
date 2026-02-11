import { createAuthClient } from "better-auth/react";
import { faceAuthClient } from "better-auth-face/client";

const baseURL = import.meta.env.PROD
  ? import.meta.env.VITE_API_BASE_URL || "http://localhost:8080"
  : "";

export const authClient = createAuthClient({
  baseURL,
  plugins: [faceAuthClient()],
});
