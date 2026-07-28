const nodemailer = require('nodemailer');
require('dotenv').config();

const user = (process.env.SMTP_USER || '').trim();
const pass = (process.env.SMTP_PASS || '').replace(/\s+/g, '').trim();

console.log('--- GMAIL SMTP CREDENTIAL DIAGNOSTIC ---');
console.log('SMTP_USER:', user);
console.log('SMTP_PASS length:', pass.length, '(spaces removed)');

if (!user || !pass) {
  console.error('❌ Error: Missing SMTP_USER or SMTP_PASS in backend/.env');
  process.exit(1);
}

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user, pass },
  tls: { rejectUnauthorized: false }
});

transporter.verify((error, success) => {
  if (error) {
    console.error('❌ SMTP Connection Failed (Invalid Google App Password):');
    console.error(error.message);
    console.log('\n📌 FIX INSTRUCTIONS:');
    console.log('1. Go to https://myaccount.google.com/apppasswords');
    console.log('2. Make sure 2-Step Verification is ON for', user);
    console.log('3. Generate a new App Password for "Mail".');
    console.log('4. Replace SMTP_PASS in backend/.env with the new 16-character code.');
  } else {
    console.log('✅ SUCCESS! Gmail SMTP credentials are valid and ready to send emails.');
  }
});
