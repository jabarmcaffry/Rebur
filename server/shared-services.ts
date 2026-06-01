/**
 * shared-services.ts
 *
 * Platform-level services shared across all game instances.
 * Game scripts access these via Rebur.* APIs; the GameRoom calls them directly.
 *
 * Services:
 *  1. MatchmakingService  — find or create a session for a game
 *  2. PlatformChat        — cross-instance pub-sub chat (WebSocket fan-out)
 *  3. AvatarService       — per-user avatar customisation + inventory
 *  4. PhysicsPresets      — named physics configurations for common game types
 *  5. ServerMetrics       — lightweight runtime counters for all the above
 */

// ────────────────────────────────────────────────────────────────────────────
// 1. MatchmakingService
// ────────────────────────────────────────────────────────────────────────────

export interface MatchmakingTicket {
  ticketId: string;
  userId: string;
  gameId: string;
  requestedAt: number;
  status: "queued" | "matched" | "timeout";
  sessionId?: string;
}

export class MatchmakingService {
  private tickets = new Map<string, MatchmakingTicket>();
  // gameId → ordered queue of ticketIds
  private queues  = new Map<string, string[]>();
  private counter = 0;

  /** Add a player to the matchmaking queue for a game. */
  enqueue(userId: string, gameId: string): MatchmakingTicket {
    const ticketId = `mm-${gameId.slice(0, 4)}-${++this.counter}`;
    const ticket: MatchmakingTicket = {
      ticketId, userId, gameId,
      requestedAt: Date.now(),
      status: "queued",
    };
    this.tickets.set(ticketId, ticket);

    const q = this.queues.get(gameId) ?? [];
    q.push(ticketId);
    this.queues.set(gameId, q);

    return ticket;
  }

  /** Mark a ticket as matched to a session. */
  match(ticketId: string, sessionId: string): void {
    const t = this.tickets.get(ticketId);
    if (t) { t.status = "matched"; t.sessionId = sessionId; }
  }

  /** Return all queued tickets for a game (FIFO). */
  getQueue(gameId: string): MatchmakingTicket[] {
    const ids = this.queues.get(gameId) ?? [];
    return ids.map(id => this.tickets.get(id)!).filter(Boolean).filter(t => t.status === "queued");
  }

  /** Remove resolved / timed-out tickets (call periodically). */
  gc(): void {
    const cutoff = Date.now() - 60_000; // 60 s
    for (const [id, t] of this.tickets) {
      if (t.status !== "queued" || t.requestedAt < cutoff) {
        if (t.status === "queued") t.status = "timeout";
        this.tickets.delete(id);
        const q = this.queues.get(t.gameId);
        if (q) {
          const idx = q.indexOf(id);
          if (idx !== -1) q.splice(idx, 1);
        }
      }
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 2. PlatformChat
// ────────────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  channel: string;        // "global" | gameId | `session:${sessionId}`
  userId: string;
  username: string;
  text: string;
  timestamp: number;
}

type ChatSubscriber = (msg: ChatMessage) => void;

export class PlatformChat {
  private subscribers = new Map<string, Set<ChatSubscriber>>();
  private history     = new Map<string, ChatMessage[]>();  // channel → last 50 msgs
  private msgCounter  = 0;

  /** Subscribe to a channel. Returns an unsubscribe function. */
  subscribe(channel: string, fn: ChatSubscriber): () => void {
    const set = this.subscribers.get(channel) ?? new Set();
    set.add(fn);
    this.subscribers.set(channel, set);
    return () => set.delete(fn);
  }

  /** Publish a message to a channel. */
  publish(channel: string, userId: string, username: string, text: string): ChatMessage {
    const msg: ChatMessage = {
      id: `chat-${++this.msgCounter}`,
      channel, userId, username,
      text: text.slice(0, 512),  // cap message length
      timestamp: Date.now(),
    };

    // Store history (cap at 50 per channel)
    const hist = this.history.get(channel) ?? [];
    hist.push(msg);
    if (hist.length > 50) hist.shift();
    this.history.set(channel, hist);

    // Fan out to subscribers
    const subs = this.subscribers.get(channel);
    if (subs) { for (const fn of subs) { try { fn(msg); } catch {} } }

    return msg;
  }

  /** Get recent message history for a channel. */
  getHistory(channel: string, limit = 20): ChatMessage[] {
    return (this.history.get(channel) ?? []).slice(-limit);
  }

  /** Number of active subscribers across all channels. */
  subscriberCount(): number {
    let n = 0;
    for (const s of this.subscribers.values()) n += s.size;
    return n;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 3. AvatarService
// ────────────────────────────────────────────────────────────────────────────

export interface AvatarConfig {
  userId: string;
  username: string;
  shirtColor:  string;
  skinColor:   string;
  pantsColor:  string;
  hairColor:   string;
  accessory:   string | null;
  updatedAt:   number;
}

export interface InventorySlot {
  itemId: string;
  name: string;
  quantity: number;
  data: Record<string, any>;
  acquiredAt: number;
}

export class AvatarService {
  private avatars    = new Map<string, AvatarConfig>();
  private inventories = new Map<string, InventorySlot[]>();

  defaultAvatar(userId: string, username = "Player"): AvatarConfig {
    return {
      userId, username,
      shirtColor:  "#3b82f6",
      skinColor:   "#d4a574",
      pantsColor:  "#374151",
      hairColor:   "#1f2937",
      accessory:   null,
      updatedAt:   Date.now(),
    };
  }

  getAvatar(userId: string): AvatarConfig | undefined {
    return this.avatars.get(userId);
  }

  setAvatar(config: AvatarConfig): void {
    this.avatars.set(config.userId, { ...config, updatedAt: Date.now() });
  }

  patchAvatar(userId: string, patch: Partial<Omit<AvatarConfig, "userId">>): AvatarConfig {
    const base = this.avatars.get(userId) ?? this.defaultAvatar(userId);
    const updated = { ...base, ...patch, userId, updatedAt: Date.now() };
    this.avatars.set(userId, updated);
    return updated;
  }

  // Inventory

  getInventory(userId: string): InventorySlot[] {
    return this.inventories.get(userId) ?? [];
  }

  addItem(userId: string, itemId: string, name: string, quantity = 1, data: Record<string, any> = {}): void {
    const inv = this.inventories.get(userId) ?? [];
    const existing = inv.find(s => s.itemId === itemId);
    if (existing) {
      existing.quantity += quantity;
    } else {
      inv.push({ itemId, name, quantity, data, acquiredAt: Date.now() });
    }
    this.inventories.set(userId, inv);
  }

  removeItem(userId: string, itemId: string, quantity = 1): boolean {
    const inv = this.inventories.get(userId);
    if (!inv) return false;
    const slot = inv.find(s => s.itemId === itemId);
    if (!slot || slot.quantity < quantity) return false;
    slot.quantity -= quantity;
    if (slot.quantity === 0) {
      const idx = inv.indexOf(slot);
      inv.splice(idx, 1);
    }
    return true;
  }

  hasItem(userId: string, itemId: string, quantity = 1): boolean {
    const inv = this.inventories.get(userId) ?? [];
    return (inv.find(s => s.itemId === itemId)?.quantity ?? 0) >= quantity;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 4. PhysicsPresets
// ────────────────────────────────────────────────────────────────────────────

export interface PhysicsPreset {
  name: string;
  description: string;
  gravity: number;
  airDrag: number;
  tickRateHz: number;
  interestRadius: number;
}

export const PHYSICS_PRESETS: Record<string, PhysicsPreset> = {
  default: {
    name: "Default",
    description: "Standard third-person game physics.",
    gravity: -28,
    airDrag: 0,
    tickRateHz: 20,
    interestRadius: 60,
  },
  platformer: {
    name: "Platformer",
    description: "Tighter gravity and faster response for precision platformers.",
    gravity: -40,
    airDrag: 0.05,
    tickRateHz: 30,
    interestRadius: 40,
  },
  space: {
    name: "Space / Zero-G",
    description: "No gravity. Objects drift until acted upon.",
    gravity: 0,
    airDrag: 0.01,
    tickRateHz: 20,
    interestRadius: 120,
  },
  underwater: {
    name: "Underwater",
    description: "Reduced gravity with heavy drag simulating water resistance.",
    gravity: -5,
    airDrag: 0.6,
    tickRateHz: 20,
    interestRadius: 40,
  },
  moon: {
    name: "Moon",
    description: "Low gravity, high jumps, slow movement.",
    gravity: -5,
    airDrag: 0,
    tickRateHz: 20,
    interestRadius: 80,
  },
  competitive: {
    name: "Competitive FPS",
    description: "High tick-rate, standard gravity, zero air drag.",
    gravity: -30,
    airDrag: 0,
    tickRateHz: 60,
    interestRadius: 50,
  },
};

// ────────────────────────────────────────────────────────────────────────────
// 5. ServerMetrics
// ────────────────────────────────────────────────────────────────────────────

export class ServerMetrics {
  private counters: Record<string, number> = {};
  private gauges:   Record<string, number> = {};
  private startTime = Date.now();

  inc(key: string, by = 1) { this.counters[key] = (this.counters[key] ?? 0) + by; }
  set(key: string, value: number) { this.gauges[key] = value; }
  get(key: string): number { return this.counters[key] ?? this.gauges[key] ?? 0; }

  snapshot() {
    return {
      uptimeMs: Date.now() - this.startTime,
      counters: { ...this.counters },
      gauges:   { ...this.gauges },
    };
  }
}

// ── Singleton exports ─────────────────────────────────────────────────────────

export const matchmaking  = new MatchmakingService();
export const platformChat = new PlatformChat();
export const avatarService = new AvatarService();
export const serverMetrics = new ServerMetrics();

// Periodic GC for matchmaking tickets (every 30 s)
setInterval(() => matchmaking.gc(), 30_000);
