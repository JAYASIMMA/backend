import { PrismaClient, Prisma } from '@prisma/client';
import * as dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function testBroadcastQuery() {
  const lat = 10.9335383;
  const lng = 78.3051583;
  const radius = 50000;
  const categoryName = 'Electrician';

  try {
    console.log('Running Raw Query test...');
    const requests = await prisma.$queryRaw(Prisma.sql`
        SELECT sr.*, a."addressLine", a.label, c."name" as "categoryName"
        FROM "ServiceRequest" sr
        JOIN "Address" a ON sr."locationId" = a.id
        JOIN "ServiceCategory" c ON sr."categoryId" = c.id
        WHERE sr.status = 'PENDING'
        AND ST_DWithin(
          a.coordinates,
          ST_SetSRID(ST_Point(${lng}, ${lat}), 4326)::geography,
          ${radius}
        )
        ${categoryName ? Prisma.sql`AND c.name ILIKE ${'%' + categoryName + '%'}` : Prisma.empty}
        ORDER BY sr."createdAt" DESC
    `);
    console.log('Query Succeeded:', requests);
  } catch (error) {
    console.error('Query Failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testBroadcastQuery();
