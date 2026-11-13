import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private isConnected = false;

  // In-memory fallback for degradation when Redis is offline (Plan §12.1, §16)
  private readonly memoryStore = new Map<string, { value: string; expiresAt: number }>();

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const redisUrl = this.configService.get<string>('REDIS_URL', 'redis://localhost:6379');
    try {
      this.client = new Redis(redisUrl, {
        maxRetriesPerRequest: 1,
        retryStrategy: () => null, // Do not spam reconnects if offline
        enableOfflineQueue: false,
      });

      this.client.on('connect', () => {
        this.isConnected = true;
        this.logger.log(`Connected to Redis at ${redisUrl}`);
      });

      this.client.on('error', (err) => {
        this.isConnected = false;
        this.logger.warn(`Redis connection error: ${err.message}. Using in-memory fallback.`);
      });
    } catch (err) {
      this.isConnected = false;
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Redis initialization failed: ${message}. Using in-memory fallback.`);
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit().catch(() => {});
    }
  }

  async get(key: string): Promise<string | null> {
    if (this.isConnected && this.client) {
      try {
        return await this.client.get(key);
      } catch {
        // Fall back to memory
      }
    }

    const item = this.memoryStore.get(key);
    if (!item) return null;
    if (item.expiresAt < Date.now()) {
      this.memoryStore.delete(key);
      return null;
    }
    return item.value;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (this.isConnected && this.client) {
      try {
        if (ttlSeconds) {
          await this.client.set(key, value, 'EX', ttlSeconds);
        } else {
          await this.client.set(key, value);
        }
        return;
      } catch {
        // Fall through to memory
      }
    }

    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : Infinity;
    this.memoryStore.set(key, { value, expiresAt });
  }

  async del(key: string): Promise<void> {
    if (this.isConnected && this.client) {
      try {
        await this.client.del(key);
      } catch {}
    }
    this.memoryStore.delete(key);
  }

  // Token Denylist (Plan §11.1, §13.1)
  async denylistToken(jti: string, ttlSeconds: number): Promise<void> {
    await this.set(`token:denylist:${jti}`, '1', ttlSeconds);
  }

  async isTokenDenylisted(jti: string): Promise<boolean> {
    const val = await this.get(`token:denylist:${jti}`);
    return val === '1';
  }

  // Login Rate-Limiter & Lockout (Plan §11.1)
  async incrementFailedLogin(email: string, windowSeconds = 900): Promise<number> {
    const key = `auth:failed:${email.toLowerCase()}`;
    if (this.isConnected && this.client) {
      try {
        const count = await this.client.incr(key);
        if (count === 1) {
          await this.client.expire(key, windowSeconds);
        }
        return count;
      } catch {}
    }

    const current = (await this.get(key)) || '0';
    const next = parseInt(current, 10) + 1;
    await this.set(key, String(next), windowSeconds);
    return next;
  }

  async incrementFailedLoginIp(ip: string, windowSeconds = 900): Promise<number> {
    const key = `auth:failed-ip:${ip}`;
    if (this.isConnected && this.client) {
      try {
        const count = await this.client.incr(key);
        if (count === 1) await this.client.expire(key, windowSeconds);
        return count;
      } catch {}
    }
    const current = (await this.get(key)) || '0';
    const next = Number.parseInt(current, 10) + 1;
    await this.set(key, String(next), windowSeconds);
    return next;
  }

  async resetFailedLogin(email: string): Promise<void> {
    await this.del(`auth:failed:${email.toLowerCase()}`);
  }

  // Idempotency Fast-Path (Plan §13.1)
  async acquireIdempotencyLock(orgId: string, key: string, ttlSeconds = 60): Promise<boolean> {
    const lockKey = `idem:lock:${orgId}:${key}`;
    if (this.isConnected && this.client) {
      try {
        const acquired = await this.client.set(lockKey, '1', 'EX', ttlSeconds, 'NX');
        return acquired === 'OK';
      } catch {}
    }

    const existing = await this.get(lockKey);
    if (existing) return false;
    await this.set(lockKey, '1', ttlSeconds);
    return true;
  }

  async releaseIdempotencyLock(orgId: string, key: string): Promise<void> {
    await this.del(`idem:lock:${orgId}:${key}`);
  }
}
