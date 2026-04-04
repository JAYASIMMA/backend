import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    console.log('Connecting to database...');
    await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS postgis;');
    console.log('PostGIS extension enabled successfully!');
  } catch (error) {
    console.error('Failed to enable PostGIS extension:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
