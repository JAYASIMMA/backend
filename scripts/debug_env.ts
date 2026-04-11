import dotenv from 'dotenv';
dotenv.config();

const key = process.env.FIREBASE_PRIVATE_KEY;
console.log('--- Key Debug ---');
console.log('Key defined?', !!key);
if (key) {
  console.log('Key length:', key.length);
  console.log('Key starts with:', JSON.stringify(key.substring(0, 50)));
  console.log('Key ends with:', JSON.stringify(key.substring(key.length - 50)));
  console.log('Key contains \\\\n?', key.includes('\\n'));
  console.log('Key contains actual \\n?', key.includes('\n'));
  
  const processed = key.replace(/\\n/g, '\n').replace(/^"|"$/g, '').trim();
  console.log('Processed length:', processed.length);
  console.log('Processed starts with:', JSON.stringify(processed.substring(0, 50)));
  console.log('Processed ends with:', JSON.stringify(processed.substring(processed.length - 50)));
  console.log('Processed contains actual \\n?', processed.includes('\n'));
}
console.log('-----------------');
