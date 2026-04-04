import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function seedCustomers() {
  console.log('🌱 Seeding 3 customers...\n');

  const customers = [
    {
      mobile: '+919876543210',
      password: 'customer123',
      fullName: 'Priya Sharma',
      addresses: [
        { label: 'Home', addressLine: '42 MG Road, Koramangala', city: 'Bangalore', pincode: '560034' },
        { label: 'Office', addressLine: '15 Brigade Road, Indiranagar', city: 'Bangalore', pincode: '560038' }
      ]
    },
    {
      mobile: '+919123456789',
      password: 'customer123',
      fullName: 'Rahul Verma',
      addresses: [
        { label: 'Home', addressLine: '78 Anna Nagar East, Block C', city: 'Chennai', pincode: '600040' }
      ]
    },
    {
      mobile: '+918765432100',
      password: 'customer123',
      fullName: 'Ananya Reddy',
      addresses: [
        { label: 'Home', addressLine: '23 Jubilee Hills, Road No. 36', city: 'Hyderabad', pincode: '500033' },
        { label: 'Parents', addressLine: '9 Banjara Hills', city: 'Hyderabad', pincode: '500034' },
        { label: 'Gym', addressLine: '101 Madhapur IT Park', city: 'Hyderabad', pincode: '500081' }
      ]
    }
  ];

  for (const c of customers) {
    // Check if user already exists
    const existing = await prisma.user.findUnique({ where: { mobile: c.mobile } });
    if (existing) {
      console.log(`⏭️  Skipping ${c.fullName} (${c.mobile}) — already exists`);
      continue;
    }

    const passwordHash = await bcrypt.hash(c.password, 10);

    const user = await prisma.user.create({
      data: {
        mobile: c.mobile,
        role: 'CUSTOMER',
        passwordHash,
        profile: {
          create: { fullName: c.fullName }
        }
      }
    });

    // Create addresses (without coordinates since PostGIS may not be set up)
    for (const addr of c.addresses) {
      try {
        await prisma.$executeRaw`
          INSERT INTO "Address" ("id", "customerId", "label", "addressLine", "city", "pincode", "coordinates", "isDefault", "createdAt", "updatedAt")
          VALUES (
            gen_random_uuid(),
            ${user.id}::uuid,
            ${addr.label},
            ${addr.addressLine},
            ${addr.city},
            ${addr.pincode},
            ST_GeographyFromText('POINT(77.5946 12.9716)'),
            ${addr === c.addresses[0]},
            NOW(),
            NOW()
          )
        `;
      } catch (e) {
        console.log(`   ⚠️  Address "${addr.label}" skipped (PostGIS may not be configured): ${(e as any).message?.slice(0,80)}`);
      }
    }

    console.log(`✅ Created: ${c.fullName} (${c.mobile}) — ${c.addresses.length} address(es)`);
  }

  console.log('\n🎉 Customer seeding complete!');
  
  // Verify
  const count = await prisma.user.count({ where: { role: 'CUSTOMER' } });
  console.log(`📊 Total customers in DB: ${count}`);
  
  await prisma.$disconnect();
}

seedCustomers().catch((e) => {
  console.error('Seeding failed:', e);
  process.exit(1);
});
