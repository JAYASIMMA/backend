import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const dbHost = process.env.DATABASE_URL?.split('@')[1] || 'NOT_FOUND';
console.log(`[Database] Initializing Prisma with host: ${dbHost.split('/')[0]}`);

export const prisma = new PrismaClient();
