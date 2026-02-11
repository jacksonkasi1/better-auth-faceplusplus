/**
 * Default configuration values for the face-auth plugin.
 */
export const DEFAULTS = {
  /** Face++ US API endpoint */
  BASE_URL: "https://api-us.faceplusplus.com",
  /** Default FaceSet identifier */
  FACE_SET_ID: "better-auth-face-default",
  /** Minimum confidence score (0-100) to accept a face match */
  CONFIDENCE_THRESHOLD: 80,
} as const;