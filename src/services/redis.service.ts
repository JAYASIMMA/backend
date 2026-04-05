import Redis from 'ioredis';

const redisHost = process.env.REDIS_HOST || 'localhost';
const redisPort = parseInt(process.env.REDIS_PORT || '6379');

// Create Redis instance with shorter timeouts for local development fallback
const redis = new Redis({
  host: redisHost,
  port: redisPort,
  maxRetriesPerRequest: 0, // Fail fast if offline
  connectTimeout: 500,     // 0.5s timeout for initial connection
  commandTimeout: 1000,    // 1s timeout for commands
});

redis.on('connect', () => {
  console.log('[Redis] Attempting connection...');
});

redis.on('ready', () => {
  console.log('[Redis] Successfully connected and ready');
});

redis.on('error', (err: any) => {
  // Suppress spammy connection errors in logs since we fallback to DB gracefully
  if (err && err.code !== 'ECONNREFUSED' && err.code !== 'ETIMEDOUT') {
    console.error('[Redis] Unexpected error:', err.message);
  }
});

/**
 * Enhanced getCache with manual status check to avoid hanging requests when offline.
 */
export const getCache = async (key: string): Promise<string | null> => {
  if (redis.status !== 'ready') {
    return null; // Silent fallback to database
  }
  
  try {
    return await redis.get(key);
  } catch (error) {
    return null;
  }
};

/**
 * Robust setCache that serializes data and gracefully handles offline status.
 */
export const setCache = async (key: string, value: any, ttlInSeconds?: number): Promise<void> => {
  if (redis.status !== 'ready') return;

  try {
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
    if (ttlInSeconds) {
      await redis.set(key, stringValue, 'EX', ttlInSeconds);
    } else {
      await redis.set(key, stringValue);
    }
  } catch (error: any) {
    console.warn(`[Redis] Set failed for key ${key}: ${error.message}`);
  }
};

/**
 * Graceful cache invalidation.
 */
export const deleteCache = async (key: string): Promise<void> => {
  if (redis.status !== 'ready') return;
  
  try {
    await redis.del(key);
  } catch (error: any) {
    console.warn(`[Redis] Del failed for key ${key}: ${error.code}`);
  }
};

export default redis;
