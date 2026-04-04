import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import * as admin from 'firebase-admin';

export const authenticate = async (req: any, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'No token provided' });
  }

  try {
    // 1. Try Firebase ID Token first (for Flutter apps)
    try {
      const decodedFirebase = await admin.auth().verifyIdToken(token);
      req.userId = decodedFirebase.uid;
      // We'll need a way to map Firebase UID to our DB userId in controllers
      // or we can attach the whole decoded token.
      req.firebaseUser = decodedFirebase;
      return next();
    } catch (fbError) {
      // Not a firebase token, try fallback to local JWT (for Admin Web or legacy)
      const decoded: any = jwt.verify(token, process.env.JWT_SECRET || 'secret');
      req.userId = decoded.userId;
      req.role = decoded.role;
      next();
    }
  } catch (error) {
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
