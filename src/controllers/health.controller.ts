import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import redis from '../services/redis.service';
import { S3Client, ListBucketsCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'ap-south-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

export const checkConnections = async (req: Request, res: Response) => {
  const status: any = {
    timestamp: new Date().toISOString(),
    services: {
      database: { status: 'unknown', latency: null },
      redis: { status: 'unknown', latency: null },
      s3: { status: 'unknown', latency: null },
    }
  };

  // 1. Check Database (Prisma)
  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    status.services.database.status = 'connected';
    status.services.database.latency = `${Date.now() - start}ms`;
  } catch (err: any) {
    status.services.database.status = 'disconnected';
    status.services.database.error = err.message;
  }

  // 2. Check Redis
  try {
    const start = Date.now();
    if (redis.status === 'ready') {
      await redis.ping();
      status.services.redis.status = 'connected';
      status.services.redis.latency = `${Date.now() - start}ms`;
    } else {
      status.services.redis.status = redis.status;
    }
  } catch (err: any) {
    status.services.redis.status = 'disconnected';
    status.services.redis.error = err.message;
  }

  // 3. Check S3
  try {
    const start = Date.now();
    await s3Client.send(new ListBucketsCommand({}));
    status.services.s3.status = 'connected';
    status.services.s3.latency = `${Date.now() - start}ms`;
  } catch (err: any) {
    status.services.s3.status = 'error';
    status.services.s3.error = err.message;
  }

  const allHealthy = Object.values(status.services).every((s: any) => s.status === 'connected');
  
  res.status(allHealthy ? 200 : 207).json({
    success: allHealthy,
    ...status
  });
};
