"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const process_1 = __importDefault(require("process"));
const prisma = new client_1.PrismaClient();
async function main() {
    console.log('🔍 Fetching all Service Providers...\n');
    const sps = await prisma.user.findMany({
        where: {
            role: 'SP'
        },
        include: {
            profile: true,
            spProfile: true
        }
    });
    if (sps.length === 0) {
        console.log('No Service Providers found.');
        return;
    }
    const tableData = sps.map(sp => ({
        ID: sp.id.substring(0, 8),
        Name: sp.profile?.fullName || 'N/A',
        Mobile: sp.mobile,
        Category: sp.spProfile?.categoryName || 'N/A',
        Verified: sp.spProfile?.isVerified ? '✅' : '❌',
        Duty: sp.spProfile?.dutyStatus ? 'ONLINE' : 'OFFLINE'
    }));
    console.table(tableData);
    console.log(`\nTotal Service Providers: ${sps.length}`);
}
main()
    .catch((e) => {
    console.error('❌ Error fetching SPs:', e);
    process_1.default.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
