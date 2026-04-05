import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function checkWorkerProfile() {
  const userId = '6fe85bca-80a4-4a18-9dcd-e660dc6d6444';
  try {
    const profile = await prisma.serviceProviderProfile.findUnique({
      where: { userId }
    });

    console.log('--- WORKER PROFILE ---');
    console.log(profile);
    console.log('----------------------');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkWorkerProfile();
