import { createAuthEndpoint, sessionMiddleware, APIError } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { z } from "zod";
import type { BetterAuthPlugin } from "better-auth";
import { FacePPClient } from "./facepp/client";
import { DEFAULTS } from "./constants";
import type { FaceAuthOptions } from "./types";

/** Shape of a face_auth DB record returned by the adapter */
export interface FaceAuthRecord {
  id: string;
  userId: string;
  faceToken: string;
  enrolledAt: Date | string;
  lastVerifiedAt?: Date | string | null;
  confidence?: number | null;
  isActive: boolean;
}

/** Shape of a user DB record returned by the adapter */
export interface UserRecord {
  id: string;
  email: string;
  name?: string | null;
  [key: string]: unknown;
}

export type { FaceAuthOptions } from "./types";

/**
 * better-auth-face — Face scan authentication plugin for Better Auth.
 *
 * Powered by Face++ (Megvii). Provides face registration (faceprint enrollment)
 * and face login (verification/comparison) as a drop-in Better Auth plugin.
 *
 * @example
 * ```ts
 * import { betterAuth } from "better-auth";
 * import { faceAuth } from "better-auth-face";
 *
 * export const auth = betterAuth({
 *   plugins: [
 *     faceAuth({
 *       apiKey: process.env.FACEPP_API_KEY!,
 *       apiSecret: process.env.FACEPP_API_SECRET!,
 *     }),
 *   ],
 * });
 * ```
 */
export const faceAuth = (options: FaceAuthOptions) => {
  const fpp = new FacePPClient({
    apiKey: options.apiKey,
    apiSecret: options.apiSecret,
    baseUrl: options.baseUrl ?? DEFAULTS.BASE_URL,
  });

  const faceSetId = options.faceSetId ?? DEFAULTS.FACE_SET_ID;
  const threshold = options.confidenceThreshold ?? DEFAULTS.CONFIDENCE_THRESHOLD;
  const requireEmail = options.requireEmail !== false; // default true

  // Lazy initialization flag for the FaceSet
  let faceSetReady = false;

  /**
   * Ensures the FaceSet exists on Face++. Called lazily on first use.
   * If the FaceSet already exists, Face++ returns an error which we catch.
   */
  async function ensureFaceSet(): Promise<void> {
    if (faceSetReady) return;
    try {
      await fpp.createFaceSet(faceSetId);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      // Face++ returns this error if the FaceSet already exists — safe to ignore
      if (!message.includes("FACESET_EXIST")) {
        throw error;
      }
    }
    faceSetReady = true;
  }

  return {
    id: "face-auth",

    /**
     * Database schema — creates a `face_auth` table.
     *
     * Run `npx @better-auth/cli generate` after adding this plugin
     * to generate the database migration.
     */
    schema: {
      faceAuth: {
        modelName: "faceAuth",
        fields: {
          userId: {
            type: "string",
            required: true,
            unique: true,
            references: {
              model: "user",
              field: "id",
              onDelete: "cascade",
            },
          },
          faceToken: {
            type: "string",
            required: true,
          },
          enrolledAt: {
            type: "date",
            required: true,
          },
          lastVerifiedAt: {
            type: "date",
            required: false,
          },
          confidence: {
            type: "number",
            required: false,
          },
          isActive: {
            type: "boolean",
            required: true,
          },
        },
      },
    },

    endpoints: {
      // ─── Sign Up ─────────────────────────────────────────────

      /**
       * POST /api/auth/face-auth/sign-up
       *
       * Create a new user account with face as the auth method.
       * Public endpoint (no session needed).
       *
       * Body: { email: string, name: string, image: string }
       *
       * Flow:
       * 1. Check if email already exists
       * 2. Detect face in image → get face_token
       * 3. Create user account
       * 4. Add face_token to FaceSet
       * 5. Store face_token in face_auth table
       * 6. Create session (auto sign-in)
       */
      faceAuthSignUp: createAuthEndpoint(
        "/face-auth/sign-up",
        {
          method: "POST",
          body: requireEmail
            ? z.object({
                email: z.string().email("Valid email is required"),
                name: z.string().min(1, "Name is required"),
                image: z.string().min(1, "Base64 image is required"),
              })
            : z.object({
                email: z.string().email().optional(),
                name: z.string().min(1, "Name is required"),
                image: z.string().min(1, "Base64 image is required"),
              }),
        },
        async (ctx) => {
          const { name, image } = ctx.body;
          const email = (ctx.body as { email?: string }).email;

          // ── Phase 1: Quick DB check (fast, connection released quickly) ──
          if (email) {
            const existingUser = (await ctx.context.adapter.findOne({
              model: "user",
              where: [{ field: "email", value: email }],
            })) as UserRecord | null;

            if (existingUser) {
              throw new APIError("BAD_REQUEST", {
                message: "An account with this email already exists.",
              });
            }
          }

          // ── Phase 2: All Face++ calls (slow, ~10-15s on free tier) ──
          // No DB connection is held open during these calls, avoiding
          // Neon serverless idle connection timeouts.
          await ensureFaceSet();

          let detectResult;
          try {
            detectResult = await fpp.detect(image);
          } catch (error: unknown) {
            const message =
              error instanceof Error ? error.message : String(error);
            throw new APIError("BAD_REQUEST", {
              message: `Face detection failed: ${message}`,
            });
          }

          if (detectResult.face_num === 0) {
            throw new APIError("BAD_REQUEST", {
              message: "No face detected in the image. Please try again.",
            });
          }

          if (detectResult.face_num > 1) {
            throw new APIError("BAD_REQUEST", {
              message:
                "Multiple faces detected. Please provide an image with a single face.",
            });
          }

          const faceToken = detectResult.faces[0].face_token;

          // When email is not required, check if this face is already registered
          // by searching the FaceSet for a match.
          if (!requireEmail) {
            try {
              const searchResult = await fpp.search(faceSetId, faceToken);
              if (
                searchResult.results?.length > 0 &&
                searchResult.results[0].confidence >= threshold
              ) {
                throw new APIError("BAD_REQUEST", {
                  message:
                    "This face is already registered. Please use verify to log in.",
                });
              }
            } catch (error: unknown) {
              // Re-throw APIError (our own "already registered" error)
              if (error instanceof APIError) throw error;
              // Ignore search errors (e.g., empty FaceSet) — continue with registration
            }
          }

          try {
            await fpp.addToFaceSet(faceSetId, faceToken);
          } catch (error: unknown) {
            const message =
              error instanceof Error ? error.message : String(error);
            throw new APIError("INTERNAL_SERVER_ERROR", {
              message: `Failed to store face: ${message}`,
            });
          }

          // ── Phase 3: All DB writes (fast, fresh connection) ──
          // Generate placeholder email from face_token if not provided
          // e.g. face_a912b7c87d92@internal.face-auth
          const userEmail =
            email || `face_${faceToken.slice(0, 12)}@internal.face-auth`;

          const newUser = (await ctx.context.adapter.create({
            model: "user",
            data: {
              email: userEmail,
              name,
              emailVerified: !requireEmail, // auto-verify for face-only accounts
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          })) as UserRecord | null;

          if (!newUser) {
            throw new APIError("INTERNAL_SERVER_ERROR", {
              message: "Failed to create user account.",
            });
          }

          const userId = newUser.id;

          await ctx.context.adapter.create({
            model: "faceAuth",
            data: {
              userId,
              faceToken,
              enrolledAt: new Date(),
              isActive: true,
            },
          });

          const session = await ctx.context.internalAdapter.createSession(
            userId,
          );

          if (!session) {
            throw new APIError("INTERNAL_SERVER_ERROR", {
              message: "Failed to create session.",
            });
          }

          await setSessionCookie(ctx, {
            session,
            user: newUser as any,
          });

          return ctx.json({
            success: true,
            message: "Account created with face authentication.",
            token: session.token,
            user: newUser,
          });
        },
      ),

      // ─── Register ────────────────────────────────────────────

      /**
       * POST /api/auth/face-auth/register
       *
       * Enroll a faceprint for the currently signed-in user.
       * Requires an active session.
       *
       * Body: { image: string } — base64-encoded face image
       *
       * Flow:
       * 1. Verify user doesn't already have a face enrolled
       * 2. Send image to Face++ Detect → get face_token
       * 3. Add face_token to the FaceSet
       * 4. Store face_token in the face_auth table
       */
      faceAuthRegister: createAuthEndpoint(
        "/face-auth/register",
        {
          method: "POST",
          body: z.object({
            image: z.string().min(1, "Base64 image is required"),
          }),
          use: [sessionMiddleware],
        },
        async (ctx) => {
          const userId = ctx.context.session.user.id;
          const { image } = ctx.body;

          // ── Phase 1: Quick DB check ──
          const existing = (await ctx.context.adapter.findOne({
            model: "faceAuth",
            where: [{ field: "userId", value: userId }],
          })) as FaceAuthRecord | null;

          if (existing) {
            throw new APIError("BAD_REQUEST", {
              message:
                "Face already registered. Remove your existing face first.",
            });
          }

          // ── Phase 2: All Face++ calls (slow, no DB connection held) ──
          await ensureFaceSet();

          let detectResult;
          try {
            detectResult = await fpp.detect(image);
          } catch (error: unknown) {
            const message =
              error instanceof Error ? error.message : String(error);
            throw new APIError("BAD_REQUEST", {
              message: `Face detection failed: ${message}`,
            });
          }

          if (detectResult.face_num === 0) {
            throw new APIError("BAD_REQUEST", {
              message: "No face detected in the image. Please try again.",
            });
          }

          if (detectResult.face_num > 1) {
            throw new APIError("BAD_REQUEST", {
              message:
                "Multiple faces detected. Please provide an image with a single face.",
            });
          }

          const faceToken = detectResult.faces[0].face_token;

          try {
            await fpp.addToFaceSet(faceSetId, faceToken);
          } catch (error: unknown) {
            const message =
              error instanceof Error ? error.message : String(error);
            throw new APIError("INTERNAL_SERVER_ERROR", {
              message: `Failed to store face: ${message}`,
            });
          }

          // ── Phase 3: DB write (fast, fresh connection) ──
          await ctx.context.adapter.create({
            model: "faceAuth",
            data: {
              id: crypto.randomUUID(),
              userId,
              faceToken,
              enrolledAt: new Date(),
              isActive: true,
            },
          });

          return ctx.json({
            success: true,
            message: "Face registered successfully.",
          });
        },
      ),

      // ─── Verify (Login) ──────────────────────────────────────

      /**
       * POST /api/auth/face-auth/verify
       *
       * Log in using face scan. Public endpoint (no session needed).
       *
       * Body: { email: string, image: string }
       *
       * Flow:
       * 1. Find user by email
       * 2. Find their stored face_token
       * 3. Detect face in the provided image → fresh face_token
       * 4. Compare stored vs fresh via Face++ Compare
       * 5. If confidence >= threshold → create session (login)
       * 6. If confidence < threshold → reject
       */
      faceAuthVerify: createAuthEndpoint(
        "/face-auth/verify",
        {
          method: "POST",
          body: requireEmail
            ? z.object({
                email: z.string().email("Valid email is required"),
                image: z.string().min(1, "Base64 image is required"),
              })
            : z.object({
                email: z.string().email().optional(),
                image: z.string().min(1, "Base64 image is required"),
              }),
        },
        async (ctx) => {
          const { image } = ctx.body;
          const email = (ctx.body as { email?: string }).email;

          // ── Phase 1: Detect face (needed for both modes) ──
          await ensureFaceSet();

          let detectResult;
          try {
            detectResult = await fpp.detect(image);
          } catch (error: unknown) {
            const message =
              error instanceof Error ? error.message : String(error);
            throw new APIError("BAD_REQUEST", {
              message: `Face detection failed: ${message}`,
            });
          }

          if (detectResult.face_num === 0) {
            throw new APIError("BAD_REQUEST", {
              message: "No face detected in the image.",
            });
          }

          const freshFaceToken = detectResult.faces[0].face_token;

          let userId: string;
          let matchedUser: UserRecord;
          let confidence: number;

          if (email) {
            // ── Email mode: look up by email, then compare ──
            const user = (await ctx.context.adapter.findOne({
              model: "user",
              where: [{ field: "email", value: email }],
            })) as UserRecord | null;

            if (!user) {
              throw new APIError("UNAUTHORIZED", {
                message: "Invalid credentials.",
              });
            }

            const faceRecord = (await ctx.context.adapter.findOne({
              model: "faceAuth",
              where: [
                { field: "userId", value: user.id },
                { field: "isActive", value: true },
              ],
            })) as FaceAuthRecord | null;

            if (!faceRecord) {
              throw new APIError("UNAUTHORIZED", {
                message: "Face authentication is not set up for this account.",
              });
            }

            let compareResult;
            try {
              compareResult = await fpp.compare(
                faceRecord.faceToken,
                freshFaceToken,
              );
            } catch (error: unknown) {
              const message =
                error instanceof Error ? error.message : String(error);
              throw new APIError("INTERNAL_SERVER_ERROR", {
                message: `Face comparison failed: ${message}`,
              });
            }

            if (compareResult.confidence < threshold) {
              throw new APIError("UNAUTHORIZED", {
                message: "Face does not match.",
              });
            }

            userId = user.id;
            matchedUser = user;
            confidence = compareResult.confidence;
          } else {
            // ── Face-only mode: search FaceSet for the best match ──
            let searchResult;
            try {
              searchResult = await fpp.search(faceSetId, freshFaceToken);
            } catch (error: unknown) {
              const message =
                error instanceof Error ? error.message : String(error);
              throw new APIError("INTERNAL_SERVER_ERROR", {
                message: `Face search failed: ${message}`,
              });
            }

            if (
              !searchResult.results?.length ||
              searchResult.results[0].confidence < threshold
            ) {
              throw new APIError("UNAUTHORIZED", {
                message: "Face not recognized. Please register first.",
              });
            }

            const bestMatch = searchResult.results[0];
            confidence = bestMatch.confidence;

            // Look up user by the matched face_token
            const faceRecord = (await ctx.context.adapter.findOne({
              model: "faceAuth",
              where: [
                { field: "faceToken", value: bestMatch.face_token },
                { field: "isActive", value: true },
              ],
            })) as FaceAuthRecord | null;

            if (!faceRecord) {
              throw new APIError("UNAUTHORIZED", {
                message: "Face not recognized.",
              });
            }

            const user = (await ctx.context.adapter.findOne({
              model: "user",
              where: [{ field: "id", value: faceRecord.userId }],
            })) as UserRecord | null;

            if (!user) {
              throw new APIError("UNAUTHORIZED", {
                message: "User account not found.",
              });
            }

            userId = user.id;
            matchedUser = user;
          }

          // ── Phase 3: DB writes + session (fast, fresh connection) ──
          await ctx.context.adapter.update({
            model: "faceAuth",
            where: [{ field: "userId", value: userId }],
            update: {
              lastVerifiedAt: new Date(),
              confidence,
            },
          });

          const session = await ctx.context.internalAdapter.createSession(
            userId,
          );

          if (!session) {
            throw new APIError("INTERNAL_SERVER_ERROR", {
              message: "Failed to create session.",
            });
          }

          await setSessionCookie(ctx, {
            session,
            user: matchedUser as any,
          });

          return ctx.json({
            success: true,
            token: session.token,
            confidence,
          });
        },
      ),

      // ─── Remove ──────────────────────────────────────────────

      /**
       * POST /api/auth/face-auth/remove
       *
       * Remove the enrolled faceprint for the currently signed-in user.
       * Requires an active session.
       *
       * Flow:
       * 1. Find stored face_token
       * 2. Remove from Face++ FaceSet
       * 3. Delete from database
       */
      faceAuthRemove: createAuthEndpoint(
        "/face-auth/remove",
        {
          method: "POST",
          use: [sessionMiddleware],
        },
        async (ctx) => {
          const userId = ctx.context.session.user.id;

          const faceRecord = (await ctx.context.adapter.findOne({
            model: "faceAuth",
            where: [{ field: "userId", value: userId }],
          })) as FaceAuthRecord | null;

          if (!faceRecord) {
            throw new APIError("NOT_FOUND", {
              message: "No face registered for this account.",
            });
          }

          // Remove from Face++ (non-critical if this fails)
          try {
            await fpp.removeFromFaceSet(
              faceSetId,
              faceRecord.faceToken,
            );
          } catch {
            // Face++ cleanup failure is non-critical — we still remove from DB
          }

          // Delete from database
          await ctx.context.adapter.delete({
            model: "faceAuth",
            where: [{ field: "userId", value: userId }],
          });

          return ctx.json({
            success: true,
            message: "Face removed successfully.",
          });
        },
      ),

      // ─── Status ──────────────────────────────────────────────

      /**
       * GET /api/auth/face-auth/status
       *
       * Check whether the currently signed-in user has face auth enrolled.
       * Requires an active session.
       */
      faceAuthStatus: createAuthEndpoint(
        "/face-auth/status",
        {
          method: "GET",
          use: [sessionMiddleware],
        },
        async (ctx) => {
          const userId = ctx.context.session.user.id;

          const faceRecord = (await ctx.context.adapter.findOne({
            model: "faceAuth",
            where: [{ field: "userId", value: userId }],
          })) as FaceAuthRecord | null;

          return ctx.json({
            enrolled: !!faceRecord,
            enrolledAt: faceRecord?.enrolledAt ?? null,
            lastVerifiedAt: faceRecord?.lastVerifiedAt ?? null,
          });
        },
      ),
    },

    /**
     * Rate limiting to prevent brute-force face verification attempts.
     */
    rateLimit: [
      {
        pathMatcher: (path: string) => path === "/face-auth/verify",
        max: 5,
        window: 60, // 5 attempts per minute
      },
      {
        pathMatcher: (path: string) => path === "/face-auth/register",
        max: 3,
        window: 60, // 3 attempts per minute
      },
      {
        pathMatcher: (path: string) => path === "/face-auth/sign-up",
        max: 3,
        window: 60, // 3 attempts per minute
      },
    ],
  } satisfies BetterAuthPlugin;
};
