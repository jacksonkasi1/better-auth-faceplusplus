import { useNavigate } from "react-router-dom";
import { authClient } from "@/lib/auth-client";

export default function Dashboard() {
  const navigate = useNavigate();

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4 rounded-xl border border-white/15 bg-white/5 p-6">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-white/70">You are signed in with face auth.</p>
        <button
          className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-black"
          onClick={async () => {
            await authClient.signOut();
            navigate("/auth/face-sign-in");
          }}
          type="button"
        >
          Sign out
        </button>
      </div>
    </main>
  );
}
