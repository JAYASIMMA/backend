const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seed() {
  console.log('📨 Seeding Service Requests (JS Version) with correct casing...\n');

  try {
    // 1. Get Categories
    let category = await prisma.serviceCategory.findFirst({ include: { subCategories: true } });
    if (!category) {
      category = await prisma.serviceCategory.create({
        data: {
          name: 'Home Repair',
          iconUrl: 'https://cdn-icons-png.flaticon.com/512/3063/3063822.png',
          subCategories: { create: [{ name: 'Electrical' }, { name: 'Plumbing' }] }
        },
        include: { subCategories: true }
      });
    }

    // 2. Get Customers & SP
    const customers = await prisma.user.findMany({ where: { role: 'CUSTOMER' }, include: { addresses: true, profile: true } });
    const sp = await prisma.user.findFirst({ where: { role: 'SP' } });

    if (customers.length === 0) {
        console.log('⚠️ No customers found.');
        return;
    }

    const statuses = ['PENDING', 'WORK_STARTED', 'COMPLETED'];
    
    for (let i = 0; i < 3; i++) {
      const customer = customers[i % customers.length];
      if (!customer || customer.addresses.length === 0) continue;

      await prisma.serviceRequest.create({
        data: {
          customerId: customer.id,
          spId: sp ? sp.id : null,
          categoryId: category.id,
          subCategoryId: category.subCategories[0] ? category.subCategories[0].id : null,
          locationId: customer.addresses[0].id,
          status: statuses[i % statuses.length],
          messageText: `Urgent Request ${i+1}: Problem with the appliances.`,
          startOtp: '1234',
          completionOtp: '5678'
        }
      });
      console.log(`✅ Created Request ${i+1} for ${customer.profile ? customer.profile.fullName : 'Customer'}`);
    }

    console.log('\n🎉 Request seeding complete!');
  } catch (error) {
    console.error('Seeding error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

seed();
