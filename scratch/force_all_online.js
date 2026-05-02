"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const process_1 = __importDefault(require("process"));
const prisma = new client_1.PrismaClient();
async function main() {
    console.log('🚀 Starting to force all workers to online duty status...');
    const result = await prisma.serviceProviderProfile.updateMany({
        data: {
            dutyStatus: true
        }
    });
    console.log(`✅ Success! Updated ${result.count} worker profiles to dutyStatus: true`);
}
main()
    .catch((e) => {
    console.error('❌ Error updating duty status:', e);
    process_1.default.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
