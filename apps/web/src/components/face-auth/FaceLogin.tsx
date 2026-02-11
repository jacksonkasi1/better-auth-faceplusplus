import { useState, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { authClient } from "@/lib/auth-client";
import FaceCamera from "./FaceCamera";
import { AUTH_REDIRECTS } from "@/config/redirects";
import { FACE_AUTH_CONFIG } from "@/config/face-auth";

type LoginStatus = "email" | "camera" | "verifying";

export default function FaceLogin() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<LoginStatus>(
    FACE_AUTH_CONFIG.requireEmail ? "email" : "camera",
  );
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleEmailSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!email.trim()) {
        setError("Please enter your email.");
        return;
      }
      setError(null);
      setStatus("camera");
    },
    [email],
  );

  const handleCapture = useCallback(
    async (base64: string) => {
      setStatus("verifying");
      setError(null);

      try {
        const payload = {
          image: base64,
          ...(FACE_AUTH_CONFIG.requireEmail ? { email } : {}),
        };

        const { data, error: verifyError } = await authClient.faceAuth.verify(payload);

        if (verifyError) {
          setError(verifyError.message || "Face verification failed.");
          setStatus("camera");
          return;
        }

        if (data?.success) {
          navigate(AUTH_REDIRECTS.afterLogin);
        }
      } catch {
        setError("Unexpected error. Please try again.");
        setStatus("camera");
      }
    },
    [email, navigate],
  );

  return (
    <div className="w-full max-w-md space-y-5 rounded-xl border border-white/15 bg-white/5 p-6 backdrop-blur">
      <div className="text-center">
        <h2 className="text-2xl font-semibold">Sign in with Face</h2>
        <p className="mt-2 text-sm text-white/70">
          {FACE_AUTH_CONFIG.requireEmail
            ? "Enter email, then scan your face."
            : "Scan your face to sign in."}
        </p>
      </div>

      {error && <div className="rounded-md bg-red-500/15 px-4 py-3 text-sm text-red-300">{error}</div>}

      {status === "email" && (
        <form onSubmit={handleEmailSubmit} className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            className="w-full rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm"
            required
            autoFocus
          />
          <button className="w-full rounded-md bg-white px-4 py-2 text-sm font-semibold text-black" type="submit">
            Continue to Camera
          </button>
        </form>
      )}

      {status === "camera" && <FaceCamera onCapture={handleCapture} active />}

      {status === "verifying" && <p className="text-center text-sm text-white/70">Verifying...</p>}

      <p className="text-center text-sm text-white/70">
        New here? <Link to="/auth/face-sign-up" className="underline">Create account</Link>
      </p>
    </div>
  );
}
