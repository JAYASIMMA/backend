"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function checkCat() {
    const cat = await prisma.serviceCategory.findUnique({
        where: { id: '9189bb35-5f87-4556-97e2-9cc39f1fe65f' }
    });
    console.log('Category:', JSON.stringify(cat, null, 2));
}
checkCat()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
