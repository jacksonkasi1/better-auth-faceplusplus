export interface Env {
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
  FRONTEND_URL: string;
  DATABASE_URL: string;
  ALLOWED_ORIGINS?: string;
  FACEPP_API_KEY: string;
  FACEPP_API_SECRET: string;
  FACEPP_BASE_URL?: string;
  FACEPP_CONFIDENCE_THRESHOLD?: string;
  FACEPP_FACESET_ID?: string;
  FACEPP_REQUIRE_EMAIL?: string;
}

export function createEnvFromProcess(): Env {
  const required = [
    "BETTER_AUTH_URL",
    "BETTER_AUTH_SECRET",
    "FRONTEND_URL",
    "DATABASE_URL",
    "FACEPP_API_KEY",
    "FACEPP_API_SECRET",
  ];

  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }

  return {
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL!,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET!,
    FRONTEND_URL: process.env.FRONTEND_URL!,
    DATABASE_URL: process.env.DATABASE_URL!,
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
    FACEPP_API_KEY: process.env.FACEPP_API_KEY!,
    FACEPP_API_SECRET: process.env.FACEPP_API_SECRET!,
    FACEPP_BASE_URL: process.env.FACEPP_BASE_URL,
    FACEPP_CONFIDENCE_THRESHOLD: process.env.FACEPP_CONFIDENCE_THRESHOLD,
    FACEPP_FACESET_ID: process.env.FACEPP_FACESET_ID,
    FACEPP_REQUIRE_EMAIL: process.env.FACEPP_REQUIRE_EMAIL ?? "false",
  };
}
