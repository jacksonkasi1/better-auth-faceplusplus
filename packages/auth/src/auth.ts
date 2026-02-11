import { db } from "@repo/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { faceAuth } from "better-auth-face";
import type { Env } from "./types";

export function configureAuth(env: Env): ReturnType<typeof betterAuth> {
  const trustedOrigins = env.ALLOWED_ORIGINS
    ? env.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim())
    : [];

  if (!trustedOrigins.includes(env.FRONTEND_URL)) {
    trustedOrigins.push(env.FRONTEND_URL);
  }

  const isSecure = env.BETTER_AUTH_URL.startsWith("https://");

  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins,
    database: drizzleAdapter(db, {
      provider: "pg",
    }),
    emailAndPassword: {
      enabled: false,
    },
    advanced: {
      useSecureCookies: isSecure,
      defaultCookieAttributes: {
        sameSite: "lax",
        secure: isSecure,
        httpOnly: true,
        path: "/",
      },
    },
    plugins: [
      faceAuth({
        apiKey: env.FACEPP_API_KEY,
        apiSecret: env.FACEPP_API_SECRET,
        baseUrl: env.FACEPP_BASE_URL,
        confidenceThreshold: env.FACEPP_CONFIDENCE_THRESHOLD
          ? Number(env.FACEPP_CONFIDENCE_THRESHOLD)
          : undefined,
        faceSetId: env.FACEPP_FACESET_ID,
        requireEmail: env.FACEPP_REQUIRE_EMAIL === "true",
      }),
    ],
  });
}

export type { Session as AuthSession, User as AuthUser } from "better-auth";
