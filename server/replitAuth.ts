import type { Express, Request, Response, NextFunction } from "express";

const FAKE_TOKEN = "testtoken";

export async function setupAuth(app: Express) {
  // Simple token-based auth for fake login
  app.post("/api/login", (req, res) => {
    const { username, password } = req.body;
    if (username === "test" && password === "pass123") {
      res.json({ success: true, user: { id: "test", username: "test" }, token: FAKE_TOKEN });
    } else {
      res.status(401).json({ message: "Invalid credentials" });
    }
  });

  app.post("/api/logout", (req, res) => {
    res.json({ success: true });
  });

  app.get("/api/logout", (req, res) => {
    res.json({ success: true });
  });

  // Simple endpoint to check auth status
  app.get("/api/auth/status", (req, res) => {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (token === FAKE_TOKEN) {
      res.json({ authenticated: true, user: { id: "test", username: "test" } });
    } else {
      res.json({ authenticated: false });
    }
  });
}

export function isAuthenticated(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (token === FAKE_TOKEN) {
    (req as any).user = { claims: { sub: "test" } };
    return next();
  }
  res.status(401).json({ message: "Not authenticated" });
}
