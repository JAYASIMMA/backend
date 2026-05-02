"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function main() {
    const categories = await prisma.serviceCategory.findMany({
        include: {
            subCategories: true
        }
    });
    console.log(JSON.stringify(categories, null, 2));
}
main()
    .catch(e => console.error(e))
    .finally(async () => {
    await prisma.$disconnect();
});
