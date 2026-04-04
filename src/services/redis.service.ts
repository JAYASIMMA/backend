import Redis from 'ioredis';

const redisHost = process.env.REDIS_HOST || 'localhost';
const redisPort = parseInt(process.env.REDIS_PORT || '6379');

const redis = new Redis({
  host: redisHost,
  port: redisPort,
  maxRetriesPerRequest: null,
});

redis.on('connect', () => {
  console.log('Successfully connected to Redis');
});

redis.on('error', (err) => {
  console.error('Redis connection error:', err);
});

export const getCache = async (key: string): Promise<string | null> => {
  try {
    return await redis.get(key);
  } catch (error) {
    console.error(`Redis Get Error (Key: ${key}):`, error);
    return null;
  }
};

export const setCache = async (key: string, value: any, ttlInSeconds?: number): Promise<void> => {
  try {
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
    if (ttlInSeconds) {
      await redis.set(key, stringValue, 'EX', ttlInSeconds);
    } else {
      await redis.set(key, stringValue);
    }
  } catch (error) {
    console.error(`Redis Set Error (Key: ${key}):`, error);
  }
};

export const deleteCache = async (key: string): Promise<void> => {
  try {
    await redis.del(key);
  } catch (error) {
    console.error(`Redis Del Error (Key: ${key}):`, error);
  }
};

export default redis;
