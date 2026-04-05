import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function checkPendingRequests() {
  try {
    const pending = await prisma.serviceRequest.findMany({
      where: { status: 'PENDING' },
      include: {
        category: true,
        location: true
      }
    });

    console.log('--- PENDING REQUESTS ---');
    if (pending.length === 0) {
      console.log('No pending requests found in the database.');
    } else {
      pending.forEach(r => {
        console.log(`ID: ${r.id}`);
        console.log(`Category: ${r.category.name}`);
        console.log(`Address: ${r.location.addressLine}`);
        console.log(`Label: ${r.location.label}`);
        console.log('------------------------');
      });
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkPendingRequests();
