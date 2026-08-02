import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const feedbacks = await prisma.feedback.findMany({
    take: 5,
    include: {
      request: {
        include: {
          customer: { include: { profile: true } },
          sp: { include: { profile: true, spProfile: true } }
        }
      }
    }
  });

  console.log('--- EXACT FEEDBACK OBJECT 0 ---');
  console.log(JSON.stringify(feedbacks[0], null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
