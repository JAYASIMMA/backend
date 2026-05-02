"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function main() {
    const userId = '3475577e-1284-44a8-b53f-3bc5815c5380'; // Carpenter
    const lat = 13.08668369466285;
    const lng = 80.23645889007746;
    const radius = 5000;
    const spProfile = await prisma.serviceProviderProfile.findUnique({
        where: { userId }
    });
    const categoryName = spProfile?.categoryName?.trim();
    console.log('Category Name:', categoryName);
    const query = client_1.Prisma.sql `
      SELECT sr.id, c.name as "categoryName"
      FROM "ServiceRequest" sr
      JOIN "Address" a ON sr."locationId" = a.id
      JOIN "ServiceCategory" c ON sr."categoryId" = c.id
      WHERE sr.status = 'PENDING'
      AND ST_DWithin(
        a.coordinates,
        ST_SetSRID(ST_Point(${lng}, ${lat}), 4326)::geography,
        ${radius}
      )
      ${categoryName ? client_1.Prisma.sql `AND (c.name ILIKE ${'%' + categoryName + '%'} OR ${categoryName} ILIKE CONCAT('%', c.name, '%'))` : client_1.Prisma.empty}
      ORDER BY sr."createdAt" DESC
    `;
    const requests = await prisma.$queryRaw(query);
    console.log('Found Requests:', requests);
}
main()
    .catch(e => console.error(e))
    .finally(async () => {
    await prisma.$disconnect();
});
