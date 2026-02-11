import { Hono } from "hono";
import { cors } from "hono/cors";
import apiRouter from "./routes";
import { env } from "./config";

const app = new Hono();

app.use(
  "*",
  cors({
    origin: env.ALLOWED_ORIGINS
      ? env.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim())
      : [env.FRONTEND_URL],
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  }),
);

app.get("/", (c) => c.json({ name: "better-auth-faceplusplus-server", ok: true }));
app.get("/health", (c) => c.json({ ok: true, timestamp: new Date().toISOString() }));
app.route("/api", apiRouter);

app.notFound((c) => c.json({ error: "Not Found" }, 404));
app.onError((err, c) => c.json({ error: err.message || "Internal Server Error" }, 500));

const port = Number.parseInt(env.PORT, 10) || 8080;

console.log(`Server running on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
