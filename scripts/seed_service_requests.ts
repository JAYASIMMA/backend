import { PrismaClient, RequestStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function seedRequests() {
  console.log('📨 Seeding Service Requests...\n');

  // 1. Get Categories
  let category = await prisma.serviceCategory.findFirst({ include: { subcategories: true } });
  if (!category) {
    category = await prisma.serviceCategory.create({
      data: {
        name: 'Home Repair',
        iconUrl: 'https://cdn-icons-png.flaticon.com/512/3063/3063822.png',
        subcategories: { create: [{ name: 'Electrical' }, { name: 'Plumbing' }] }
      },
      include: { subcategories: true }
    });
  }

  // 2. Get Customers & SP
  const customers = await prisma.user.findMany({ where: { role: 'CUSTOMER' }, include: { addresses: true, profile: true } });
  const sp = await prisma.user.findFirst({ where: { role: 'SP' } });

  if (customers.length === 0) {
      console.log('⚠️ No customers found. Seeding requires users with CUSTOMER role.');
      return;
  }

  // Exact statuses from schema.prisma
  // PENDING, ACCEPTED, TEMP_WORK_STARTED, WORK_STARTED, TEMP_COMPLETED, COMPLETED, CANCELLED
  const statuses: RequestStatus[] = [RequestStatus.PENDING, RequestStatus.WORK_STARTED, RequestStatus.COMPLETED];
  
  for (let i = 0; i < 3; i++) {
    const customer = customers[i % customers.length];
    if (!customer || customer.addresses.length === 0) {
        console.log(`Skipping index ${i} - no customer/address.`);
        continue;
    }

    await prisma.serviceRequest.create({
      data: {
        customerId: customer.id,
        spId: (sp && sp.id) || null,
        categoryId: category.id,
        subCategoryId: (category.subcategories[0] && category.subcategories[0].id) || null,
        locationId: customer.addresses[0].id,
        status: statuses[i % statuses.length],
        messageText: `Urgent Request ${i+1}: Issue with ${category.name} for ${customer.profile?.fullName || 'John Doe'}.`,
        startOtp: '1234',
        completionOtp: '5678'
      }
    });
    console.log(`✅ Created Request ${i+1} for ${customer.profile?.fullName || 'Customer'}`);
  }

  console.log('\n🎉 Request seeding complete!');
  await prisma.$disconnect();
}

seedRequests().catch((e) => {
  console.error('Seeding failed:', e);
  process.exit(1);
});
