import session from "express-session";
import type { Express, Request, Response, NextFunction } from "express";

export async function setupAuth(app: Express) {
  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || "pass123",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
  };

  app.use(session(sessionSettings));

  // Predefined login route
  app.post("/api/login", (req, res) => {
    const { username, password } = req.body;
    if (username === "test" && password === "pass123") {
      (req.session as any).user = { claims: { sub: "test" } };
      return res.json({ success: true, user: { id: "test", username: "test" } });
    }
    res.status(401).json({ message: "Invalid credentials" });
  });

  app.post("/api/logout", (req, res) => {
    req.session.destroy(() => {
      res.json({ success: true });
    });
  });

  // Simple endpoint to check auth status
  app.get("/api/auth/status", (req, res) => {
    if ((req.session as any).user) {
      return res.json({ authenticated: true, user: { id: "test", username: "test" } });
    }
    res.json({ authenticated: false });
  });
}

export function isAuthenticated(req: Request, res: Response, next: NextFunction) {
  if ((req.session as any).user) {
    (req as any).user = (req.session as any).user;
    return next();
  }
  res.status(401).json({ message: "Not authenticated" });
}
