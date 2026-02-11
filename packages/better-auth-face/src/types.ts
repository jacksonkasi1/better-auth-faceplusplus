/**
 * Configuration options for the face-auth Better Auth plugin.
 */
export interface FaceAuthOptions {
  /**
   * Face++ API Key.
   * Get it from https://console.faceplusplus.com
   */
  apiKey: string;

  /**
   * Face++ API Secret.
   * Get it from https://console.faceplusplus.com
   */
  apiSecret: string;

  /**
   * Face++ API base URL.
   * @default "https://api-us.faceplusplus.com"
   *
   * Use "https://api-cn.faceplusplus.com" for China region.
   */
  baseUrl?: string;

  /**
   * The outer_id for the FaceSet used to group all enrolled faces.
   * One FaceSet per application/environment is typical.
   * @default "better-auth-face-default"
   */
  faceSetId?: string;

  /**
   * Minimum Face++ confidence score (0-100) to accept a face match.
   * Higher = stricter. Face++ recommends using their threshold values,
   * but this provides an additional application-level gate.
   * @default 80
   */
  confidenceThreshold?: number;

  /**
   * Whether email is required for sign-up and verify.
   *
   * - `true` (default) — sign-up requires email, verify looks up user by email
   *   then compares face tokens.
   * - `false` — sign-up only needs name + image (a placeholder email is
   *   generated from the face_token, e.g. `face_a912b7c8@internal.face-auth`).
   *   Verify uses Face++ Search to find the matching face in the FaceSet
   *   without needing an email — just scan your face and you're in.
   *
   * Use `false` for internal kiosks, check-in systems, or anywhere
   * email isn't needed.
   *
   * @default true
   */
  requireEmail?: boolean;
}