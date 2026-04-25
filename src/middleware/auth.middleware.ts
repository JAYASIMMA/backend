import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import * as admin from 'firebase-admin';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const authenticate = async (req: any, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    // 1. Try Firebase ID Token first (for Flutter apps directly sending FB tokens)
    try {
      const decodedFirebase = await admin.auth().verifyIdToken(token);
      
      // We must map Firebase user to our internal DB user
      const user = await prisma.user.findUnique({
        where: { mobile: decodedFirebase.phone_number },
      });

      if (!user) {
        console.warn(`[AUTH] Firebase sync failure: Phone ${decodedFirebase.phone_number} not in DB`);
        return res.status(401).json({ success: false, message: 'User not synchronized with backend' });
      }

      req.userId = user.id;
      req.role = user.role;
      req.firebaseUser = decodedFirebase;
      return next();
    } catch (fbError: any) {
      // 2. Fallback to our local JWT (signed by our backend)
      // Only try local JWT if it doesn't look like an expired Firebase token
      if (fbError.code === 'auth/id-token-expired') {
          throw fbError; // Re-throw to be caught by outer catch and returned as 401
      }

      try {
          const decoded: any = jwt.verify(token, process.env.JWT_SECRET || 'secret');
          req.userId = decoded.userId;
          req.role = decoded.role;
          return next();
      } catch (jwtError) {
          console.error('[AUTH] All verification methods failed');
          throw jwtError;
      }
    }
  } catch (error: any) {
    console.error('Auth Middleware Error:', error.message);
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

export const authorize = (roles: string[]) => {
  return (req: any, res: Response, next: NextFunction) => {
    if (!roles.includes(req.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden: Insufficient permissions' });
    }
    next();
  };
};
