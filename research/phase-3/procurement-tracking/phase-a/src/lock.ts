// PROTOCOL §3.2 — distributed lock providers (same DESIGN as bank-receipts/lock.ts).
//
// Why a copy: this directory is standalone for migration + tests. It is LOGIC-EQUIVALENT
// to bank-receipts/lock.ts but NOT byte-identical — it defines LockHandle/LockProvider
// inline (procurement's types.ts doesn't export them). When porting into BEE app, collapse
// both to ONE shared module (export the interfaces from a shared types.ts and import here).

import { PrismaClient } from "@prisma/client";
import Redis from "ioredis";
import { randomBytes } from "node:crypto";

const HOLDER = `${process.pid}-${randomBytes(4).toString("hex")}`;

export interface LockHandle {
  readonly key: string;
  release(): Promise<void>;
}

export interface LockProvider {
  acquire(key: string, ttlSeconds: number): Promise<LockHandle | null>;
}

class RedisLockProvider implements LockProvider {
  private r: Redis;
  constructor(url: string) {
    this.r = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 });
  }
  async acquire(key: string, ttlSeconds: number): Promise<LockHandle | null> {
    await this.r.connect().catch(() => undefined);
    const got = await this.r.set(key, HOLDER, "EX", ttlSeconds, "NX");
    if (got !== "OK") return null;
    const r = this.r;
    return {
      key,
      async release() {
        const lua = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`;
        await r.eval(lua, 1, key, HOLDER).catch(() => undefined);
      },
    };
  }
}

class PgRowLockProvider implements LockProvider {
  private prisma: PrismaClient;
  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }
  async acquire(key: string, ttlSeconds: number): Promise<LockHandle | null> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
    await this.prisma.ingestionLock.deleteMany({ where: { key, expiresAt: { lt: now } } });
    try {
      await this.prisma.ingestionLock.create({ data: { key, holderPid: HOLDER, expiresAt } });
    } catch {
      return null;
    }
    const prisma = this.prisma;
    return {
      key,
      async release() {
        await prisma.ingestionLock.deleteMany({ where: { key, holderPid: HOLDER } });
      },
    };
  }
}

// Redis errors fall back to PG so a set-but-unreachable REDIS_URL degrades gracefully;
// a clean `null` (lock genuinely held) does NOT fall back, to avoid double-acquire.
class FallbackLockProvider implements LockProvider {
  private redis: RedisLockProvider;
  private pg: PgRowLockProvider;
  constructor(redis: RedisLockProvider, pg: PgRowLockProvider) { this.redis = redis; this.pg = pg; }
  async acquire(key: string, ttlSeconds: number): Promise<LockHandle | null> {
    try {
      return await this.redis.acquire(key, ttlSeconds);
    } catch {
      return this.pg.acquire(key, ttlSeconds);
    }
  }
}

let _provider: LockProvider | null = null;

export function getLockProvider(prisma: PrismaClient): LockProvider {
  if (_provider) return _provider;
  const url = process.env.REDIS_URL;
  const pg = new PgRowLockProvider(prisma);
  _provider = url ? new FallbackLockProvider(new RedisLockProvider(url), pg) : pg;
  return _provider;
}

export async function acquireLock(prisma: PrismaClient, key: string, ttlSeconds: number) {
  return getLockProvider(prisma).acquire(key, ttlSeconds);
}
