import { useState, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { authClient } from "@/lib/auth-client";
import FaceCamera from "./FaceCamera";
import { AUTH_REDIRECTS } from "@/config/redirects";
import { FACE_AUTH_CONFIG } from "@/config/face-auth";

type SignUpStatus = "form" | "camera" | "creating";

export default function FaceSignUpComponent() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<SignUpStatus>("form");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleFormSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!name.trim()) {
        setError("Please enter your name.");
        return;
      }
      if (FACE_AUTH_CONFIG.requireEmail && !email.trim()) {
        setError("Please enter your email.");
        return;
      }
      setError(null);
      setStatus("camera");
    },
    [name, email],
  );

  const handleCapture = useCallback(
    async (base64: string) => {
      setStatus("creating");
      setError(null);

      try {
        const payload = {
          name,
          image: base64,
          ...(FACE_AUTH_CONFIG.requireEmail ? { email } : {}),
        };

        const { data, error: signUpError } = await authClient.faceAuth.signUp(payload);

        if (signUpError) {
          setError(signUpError.message || "Sign up failed.");
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
    [email, name, navigate],
  );

  return (
    <div className="w-full max-w-md space-y-5 rounded-xl border border-white/15 bg-white/5 p-6 backdrop-blur">
      <div className="text-center">
        <h2 className="text-2xl font-semibold">Sign up with Face</h2>
        <p className="mt-2 text-sm text-white/70">
          {FACE_AUTH_CONFIG.requireEmail
            ? "Create account with name, email, and face scan."
            : "Create account with your name and face scan only."}
        </p>
      </div>

      {error && <div className="rounded-md bg-red-500/15 px-4 py-3 text-sm text-red-300">{error}</div>}

      {status === "form" && (
        <form onSubmit={handleFormSubmit} className="space-y-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
            className="w-full rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm"
            required
            autoFocus
          />

          {FACE_AUTH_CONFIG.requireEmail && (
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="w-full rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm"
              required
            />
          )}

          <button className="w-full rounded-md bg-white px-4 py-2 text-sm font-semibold text-black" type="submit">
            Continue to Camera
          </button>
        </form>
      )}

      {status === "camera" && <FaceCamera onCapture={handleCapture} active />}

      {status === "creating" && <p className="text-center text-sm text-white/70">Creating account...</p>}

      <p className="text-center text-sm text-white/70">
        Already have an account? <Link to="/auth/face-sign-in" className="underline">Sign in</Link>
      </p>
    </div>
  );
}
