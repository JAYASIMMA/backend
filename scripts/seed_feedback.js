const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seedFeedback() {
  console.log('🌟 Seeding Service Feedback...\n');

  try {
    // 1. Get Completed Requests
    const completedRequests = await prisma.serviceRequest.findMany({
      where: { status: 'COMPLETED' },
      include: { customer: true, sp: true }
    });

    if (completedRequests.length === 0) {
      console.log('⚠️ No completed requests found. Feedback requires COMPLETED status.');
      return;
    }

    const comments = [
      "Excellent service! The repair was done very professionally and on time.",
      "The service provider was very polite. Highly recommended for electrical work.",
      "Good job but could have been a bit faster. Overall satisfied."
    ];

    for (let i = 0; i < completedRequests.length; i++) {
        const req = completedRequests[i];
        
        // Use upsert to avoid unique constraint if we run multiple times
        await prisma.feedback.upsert({
            where: { requestId: req.id },
            update: {
                rating: 5,
                comment: comments[i % comments.length]
            },
            create: {
                requestId: req.id,
                rating: 5,
                comment: comments[i % comments.length]
            }
        });
        console.log(`✅ Feedback generated for Audit ID: ${req.id.slice(0, 8)}`);
    }

    console.log('\n🎉 Feedback seeding complete!');
  } catch (error) {
    console.error('Seeding error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

seedFeedback();
