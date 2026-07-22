import * as admin from 'firebase-admin';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config();

function getFirebaseCredential(): admin.credential.Credential {
  // 1. Check for full JSON string in ENV (FIREBASE_SERVICE_ACCOUNT_JSON)
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      console.log('Firebase: Initializing via FIREBASE_SERVICE_ACCOUNT_JSON environment variable.');
      return admin.credential.cert(serviceAccount);
    } catch (e) {
      console.error('Firebase: Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON', e);
    }
  }

  // 2. Check for any service account JSON file on disk dynamically
  const possibleDirs = [
    process.cwd(),
    path.join(process.cwd(), 'backend'),
    __dirname,
    path.join(__dirname, '../..'),
    path.join(__dirname, '../../..'),
  ];

  for (const dir of possibleDirs) {
    if (fs.existsSync(dir)) {
      try {
        const files = fs.readdirSync(dir);
        const jsonFile = files.find(
          (f) => f.includes('firebase-adminsdk') && f.endsWith('.json')
        );
        if (jsonFile) {
          const fullPath = path.join(dir, jsonFile);
          console.log(`Firebase: Initializing via service account JSON file: ${fullPath}`);
          return admin.credential.cert(fullPath);
        }
      } catch (e) {
        // Continue searching other dirs
      }
    }
  }

  // 3. Fallback to individual ENV variables
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (projectId && clientEmail && privateKey) {
    console.log('Firebase: Initializing via individual environment variables.');
    privateKey = privateKey.trim().replace(/^["']|["']$/g, '').replace(/\\n/g, '\n');
    return admin.credential.cert({
      projectId,
      clientEmail,
      privateKey,
    });
  }

  console.warn('Firebase Admin SDK: Incomplete configuration. Falling back to default credentials.');
  return admin.credential.applicationDefault();
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: getFirebaseCredential(),
  });
}

export const auth = admin.auth();
export default admin;
