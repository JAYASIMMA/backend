import * as admin from 'firebase-admin';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config();

const serviceAccountPaths = [
  path.join(process.cwd(), 'inevit-c9786-firebase-adminsdk-fbsvc-083e168598.json'),
  path.join(process.cwd(), 'backend', 'inevit-c9786-firebase-adminsdk-fbsvc-083e168598.json'),
  path.join(__dirname, '../../inevit-c9786-firebase-adminsdk-fbsvc-083e168598.json'),
  path.join(__dirname, '../../../inevit-c9786-firebase-adminsdk-fbsvc-083e168598.json')
];

let serviceAccountPath = '';
for (const p of serviceAccountPaths) {
  if (fs.existsSync(p)) {
    serviceAccountPath = p;
    break;
  }
}

let credential;

if (serviceAccountPath) {
  console.log(`Firebase: Using service account JSON file at: ${serviceAccountPath}`);
  credential = admin.credential.cert(serviceAccountPath);
} else {
  console.log('Firebase: Using environment variables.');
  const firebaseConfig = {
    project_id: process.env.FIREBASE_PROJECT_ID,
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    private_key: process.env.FIREBASE_PRIVATE_KEY
      ? process.env.FIREBASE_PRIVATE_KEY.trim().replace(/^["']|["']$/g, '').replace(/\\n/g, '\n')
      : undefined,
  };

  if (!firebaseConfig.project_id || !firebaseConfig.client_email || !firebaseConfig.private_key) {
    console.warn('Firebase Admin SDK: Incomplete configuration. Firebase Auth verification may fail.');
    credential = admin.credential.applicationDefault(); // Fallback
  } else {
    credential = admin.credential.cert(firebaseConfig as admin.ServiceAccount);
  }
}

admin.initializeApp({
  credential,
});

export const auth = admin.auth();
export default admin;
