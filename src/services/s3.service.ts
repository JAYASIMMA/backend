import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import dotenv from 'dotenv';

dotenv.config();

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'ap-south-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
  // Newer AWS SDK v3 versions append x-amz-checksum-mode=ENABLED to presigned
  // GET URLs by default. Objects uploaded without checksums return 403 when that
  // header is present. Setting both to WHEN_REQUIRED disables this behaviour.
  requestChecksumCalculation: 'WHEN_REQUIRED' as any,
  responseChecksumValidation: 'WHEN_REQUIRED' as any,
});

const bucketName = process.env.AWS_S3_BUCKET_NAME || 'fix-it-assets';

/**
 * Upload a file to S3
 */
export const uploadFile = async (
  file: Express.Multer.File,
  folder: string
): Promise<string> => {
  const fileName = `${folder}/${Date.now()}-${file.originalname}`;

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: fileName,
    Body: file.buffer,
    ContentType: file.mimetype,
  });

  await s3Client.send(command);
  
  // Return the KEY only, let controllers decide how to serve it (Public vs Signed)
  return fileName;
};

/**
 * Generate a pre-signed URL for an object
 */
export const getPresignedUrl = async (key: string, expiresIn: number = 3600): Promise<string> => {
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  return await getSignedUrl(s3Client, command, { expiresIn });
};

/**
 * Utility to process S3 keys and return valid URLs.
 * Leaves regular http URLs intact.
 */
export const getSignedAssetUrl = async (url: string | null): Promise<string | null> => {
  if (!url) return null;
  // If it's already a full URL (including presigned params), skip
  if (url.includes('X-Amz-Signature=')) return url;
  
  let key = url;
  if (url.includes('.amazonaws.com/')) {
    const parts = url.split('.amazonaws.com/');
    if (parts.length > 1) {
      key = parts[1];
    }
  }

  if (!key || key.startsWith('http')) return url; // Fallback if we can't extract key

  try {
    return await getPresignedUrl(key, 3600); // 1 hour expiry
  } catch (err) {
    console.error(`[S3] Failed to sign URL for key: ${key}`, err);
    return null;
  }
};
