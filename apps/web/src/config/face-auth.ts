export const FACE_AUTH_CONFIG = {
  // Default false for this minimal face-only example.
  requireEmail: import.meta.env.VITE_FACEPP_REQUIRE_EMAIL === "true",
} as const;
