import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    PORT: z.string().default("8080"),
    BETTER_AUTH_URL: z.string().url(),
    BETTER_AUTH_SECRET: z.string().min(32),
    FRONTEND_URL: z.string().url(),
    DATABASE_URL: z.string().url(),
    ALLOWED_ORIGINS: z.string().optional(),
    FACEPP_API_KEY: z.string().min(1),
    FACEPP_API_SECRET: z.string().min(1),
    FACEPP_BASE_URL: z.string().url().optional(),
    FACEPP_CONFIDENCE_THRESHOLD: z.string().optional(),
    FACEPP_FACESET_ID: z.string().optional(),
    FACEPP_REQUIRE_EMAIL: z.string().optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});

export type Env = typeof env;
