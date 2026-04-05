import multer from 'multer';

const storage = multer.memoryStorage();

export const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (_req, file, cb) => {
    console.log(`Incoming file: ${file.originalname}, MIME: ${file.mimetype}`);
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
      'audio/mpeg', 'audio/wav', 'audio/m4a', 'audio/x-m4a', 'audio/mp3', 'audio/aac',
      'application/octet-stream' // Dio default fallback
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      console.error(`File rejected. MIME type ${file.mimetype} is not allowed.`);
      cb(new Error(`File type ${file.mimetype} not allowed`));
    }
  },
});
