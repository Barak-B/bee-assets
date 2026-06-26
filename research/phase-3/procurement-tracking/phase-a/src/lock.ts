// PROTOCOL §3.2 — distributed lock providers (re-export of bank-receipts/lock.ts shape)
//
// Why a copy: this directory is standalone for migration + tests. When porting
// into BEE app, point procurement at the SAME `bank-receipts/lock.ts` (single
// source of truth). Logic here is byte-identical to that file — review parity
// in code review.

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

let _provider: LockProvider | null = null;

export function getLockProvider(prisma: PrismaClient): LockProvider {
  if (_provider) return _provider;
  const url = process.env.REDIS_URL;
  _provider = url ? new RedisLockProvider(url) : new PgRowLockProvider(prisma);
  return _provider;
}

export async function acquireLock(prisma: PrismaClient, key: string, ttlSeconds: number) {
  return getLockProvider(prisma).acquire(key, ttlSeconds);
}
