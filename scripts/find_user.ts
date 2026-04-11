import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function findUser() {
  const number = '9159384606';
  const subNumber = '59384606';
  
  console.log('Searching for users containing:', subNumber);
  
  const users = await prisma.user.findMany({
    where: {
      mobile: {
        contains: subNumber
      }
    }
  });

  if (users.length > 0) {
    console.log('Found users:', users);
  } else {
    console.log('No user found containing those digits.');
  }
}

findUser()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
