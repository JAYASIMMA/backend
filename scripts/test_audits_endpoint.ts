import { getAudits } from '../src/controllers/admin.controller';

async function main() {
  const req: any = {};
  const res: any = {
    status: function(code: number) {
      console.log(`STATUS CODE: ${code}`);
      return this;
    },
    json: function(payload: any) {
      console.log('--- PAYLOAD RETURNED BY GETAUDITS ---');
      console.log('Success:', payload.success);
      console.log('Feedbacks Count:', payload.data?.feedbacks?.length);
      console.log('Cancellations Count:', payload.data?.cancellations?.length);

      console.log('\n--- SAMPLE FEEDBACK 0 ---');
      console.log(JSON.stringify(payload.data?.feedbacks?.[0], null, 2));

      console.log('\n--- SAMPLE CANCELLATION 0 ---');
      console.log(JSON.stringify(payload.data?.cancellations?.[0], null, 2));
    }
  };

  await getAudits(req, res);
}

main().catch(console.error);
