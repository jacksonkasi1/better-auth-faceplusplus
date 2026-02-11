import { Hono } from "hono";
import authRouter from "./auth";

const apiRouter = new Hono();

apiRouter.route("/auth", authRouter);

export default apiRouter;
