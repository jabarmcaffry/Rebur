import type { Express, Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { db } from "./db";
import { users, sessions } from "@shared/schema";
import { eq } from "drizzle-orm";

// Session token storage (in production, use Redis or database sessions)
const activeSessions = new Map<string, { userId: string; expiresAt: Date }>();

export async function setupAuth(app: Express) {
  // Register endpoint
  app.post("/api/register", async (req, res) => {
    try {
      const { email, password, firstName, lastName } = req.body;
      console.log("[v0] Registration attempt for:", email);

      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }

      // Check if user already exists
      console.log("[v0] Checking for existing user...");
      const existingUser = await db.select().from(users).where(eq(users.email, email)).limit(1);
      console.log("[v0] Existing user check result:", existingUser.length > 0 ? "found" : "not found");
      if (existingUser.length > 0) {
        return res.status(400).json({ message: "User with this email already exists" });
      }

      // Hash password
      console.log("[v0] Hashing password...");
      const hashedPassword = await bcrypt.hash(password, 10);
      console.log("[v0] Password hashed successfully");

      // Create user
      const userId = randomUUID();
      console.log("[v0] Creating user with ID:", userId);
      const [newUser] = await db.insert(users).values({
        id: userId,
        email,
        firstName: firstName || null,
        lastName: lastName || null,
        profileImageUrl: null,
      }).returning();
      console.log("[v0] User created:", newUser?.id);

      // Store password in a separate way (we'll add a password field or use a linked table)
      // For now, storing in sessions table as a workaround
      // In production, add a password_hash column to users table
      console.log("[v0] Storing password hash...");
      await db.insert(sessions).values({
        sid: `pwd_${userId}`,
        sess: { passwordHash: hashedPassword },
        expire: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
      }).onConflictDoUpdate({
        target: sessions.sid,
        set: { sess: { passwordHash: hashedPassword } },
      });
      console.log("[v0] Password hash stored");

      // Create session token
      const token = randomUUID();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
      activeSessions.set(token, { userId, expiresAt });
      console.log("[v0] Session token created:", token.substring(0, 8) + "...");

      // Also store in database for persistence
      await db.insert(sessions).values({
        sid: token,
        sess: { userId, type: 'session' },
        expire: expiresAt,
      }).onConflictDoNothing();
      console.log("[v0] Registration complete, returning response");

      res.json({
        success: true,
        user: {
          id: newUser.id,
          email: newUser.email,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
        },
        token,
      });
    } catch (error: any) {
      console.error("Registration error:", error);
      res.status(500).json({ message: error.message || "Registration failed" });
    }
  });

  // Login endpoint
  app.post("/api/login", async (req, res) => {
    try {
      const { username, password, email } = req.body;
      const loginEmail = email || username; // Support both username and email fields
      console.log("[v0] Login attempt for:", loginEmail);

      if (!loginEmail || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }

      // Find user by email
      console.log("[v0] Looking up user...");
      const [user] = await db.select().from(users).where(eq(users.email, loginEmail)).limit(1);
      console.log("[v0] User lookup result:", user ? user.id : "not found");
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Get stored password hash
      console.log("[v0] Looking up password hash for user:", user.id);
      const [pwdRecord] = await db.select().from(sessions).where(eq(sessions.sid, `pwd_${user.id}`)).limit(1);
      console.log("[v0] Password record found:", !!pwdRecord, "has hash:", !!(pwdRecord?.sess as any)?.passwordHash);
      if (!pwdRecord || !(pwdRecord.sess as any)?.passwordHash) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Verify password
      const isValid = await bcrypt.compare(password, (pwdRecord.sess as any).passwordHash);
      if (!isValid) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Create session token
      const token = randomUUID();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
      activeSessions.set(token, { userId: user.id, expiresAt });

      // Store session in database
      await db.insert(sessions).values({
        sid: token,
        sess: { userId: user.id, type: 'session' },
        expire: expiresAt,
      }).onConflictDoNothing();

      res.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
        },
        token,
      });
    } catch (error: any) {
      console.error("Login error:", error);
      res.status(500).json({ message: error.message || "Login failed" });
    }
  });

  // Logout endpoint
  app.post("/api/logout", async (req, res) => {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (token) {
        activeSessions.delete(token);
        await db.delete(sessions).where(eq(sessions.sid, token));
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Logout error:", error);
      res.json({ success: true }); // Still return success even if cleanup fails
    }
  });

  app.get("/api/logout", async (req, res) => {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (token) {
        activeSessions.delete(token);
        await db.delete(sessions).where(eq(sessions.sid, token));
      }
      res.json({ success: true });
    } catch (error) {
      res.json({ success: true });
    }
  });

  // Auth status check
  app.get("/api/auth/status", async (req, res) => {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (!token) {
        return res.json({ authenticated: false });
      }

      const session = await getSessionFromToken(token);
      if (!session) {
        return res.json({ authenticated: false });
      }

      const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
      if (!user) {
        return res.json({ authenticated: false });
      }

      res.json({
        authenticated: true,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
        },
      });
    } catch (error) {
      console.error("Auth status error:", error);
      res.json({ authenticated: false });
    }
  });
}

async function getSessionFromToken(token: string): Promise<{ userId: string } | null> {
  // Check memory cache first
  const cached = activeSessions.get(token);
  if (cached) {
    if (cached.expiresAt > new Date()) {
      return { userId: cached.userId };
    }
    activeSessions.delete(token);
  }

  // Check database — let DB errors propagate so callers get a real 500
  const [dbSession] = await db.select().from(sessions).where(eq(sessions.sid, token)).limit(1);
  if (dbSession && dbSession.expire > new Date()) {
    const sess = dbSession.sess as any;
    if (sess?.userId && sess?.type === 'session') {
      activeSessions.set(token, { userId: sess.userId, expiresAt: dbSession.expire });
      return { userId: sess.userId };
    }
  }

  return null;
}

export async function isAuthenticated(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  try {
    const session = await getSessionFromToken(token);
    if (!session) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    // Verify the user record actually exists — catches deleted accounts
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, session.userId)).limit(1);
    if (!user) {
      activeSessions.delete(token);
      return res.status(401).json({ message: "Not authenticated" });
    }

    (req as any).user = { claims: { sub: session.userId } };
    (req as any).userId = session.userId;
    return next();
  } catch (err) {
    console.error("[auth] isAuthenticated error:", err);
    return res.status(500).json({ message: "Authentication check failed" });
  }
}

// Helper to get userId from authenticated request
export function getUserId(req: Request): string {
  return (req as any).userId || (req as any).user?.claims?.sub || "test";
}
