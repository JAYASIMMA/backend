import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const feedbacks = await prisma.feedback.findMany({
    include: {
      request: {
        include: {
          customer: { include: { profile: true } },
          sp: { include: { profile: true, spProfile: true } },
          category: true
        }
      }
    }
  });

  console.log(`TOTAL FEEDBACKS: ${feedbacks.length}`);
  feedbacks.forEach((f, idx) => {
    console.log(`[FB ${idx + 1}] ID: ${f.id}`);
    console.log(`   Customer ID: ${f.request?.customerId} | Mobile: ${f.request?.customer?.mobile} | Profile FullName: "${f.request?.customer?.profile?.fullName}"`);
    console.log(`   SP ID: ${f.request?.spId} | Mobile: ${f.request?.sp?.mobile} | Profile FullName: "${f.request?.sp?.profile?.fullName}"`);
  });

  const cancellations = await prisma.requestCancellationReason.findMany({
    include: {
      request: {
        include: {
          customer: { include: { profile: true } },
          sp: { include: { profile: true, spProfile: true } },
          category: true
        }
      },
      customer: { include: { profile: true } },
      sp: { include: { profile: true, spProfile: true } }
    }
  });

  console.log(`TOTAL CANCELLATIONS: ${cancellations.length}`);
  cancellations.forEach((c, idx) => {
    const cust = c.customer || c.request?.customer;
    const sp = c.sp || c.request?.sp;
    console.log(`[CAN ${idx + 1}] ID: ${c.id}`);
    console.log(`   Customer Mobile: ${cust?.mobile} | Profile FullName: "${cust?.profile?.fullName}"`);
    console.log(`   SP Mobile: ${sp?.mobile} | Profile FullName: "${sp?.profile?.fullName}"`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
