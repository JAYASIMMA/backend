import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import * as admin from 'firebase-admin';

const prisma = new PrismaClient();

export const verifyFirebaseToken = async (req: Request, res: Response) => {
  const { idToken } = req.body;

  if (!idToken) {
    return res.status(400).json({ success: false, message: 'ID Token is required' });
  }

  try {
    // 1. Verify token with Firebase
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const { uid, phone_number } = decodedToken;

    if (!phone_number) {
      return res.status(401).json({ success: false, message: 'Invalid token: No phone number' });
    }

    // 2. Find or create user in our DB
    let user = await prisma.user.findUnique({
      where: { mobile: phone_number },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          mobile: phone_number,
          role: 'CUSTOMER',
        },
      });
    }

    // Check profile completeness
    const userWithDetails = await prisma.user.findUnique({
      where: { id: user.id },
      include: { profile: true, addresses: { take: 1 } },
    });
    
    const isProfileComplete = !!(userWithDetails?.profile?.fullName && userWithDetails.addresses.length > 0);

    // 3. Generate our OWN backend JWT
    const token = jwt.sign(
      { userId: user.id, mobile: user.mobile, role: user.role },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '30d' }
    );

    res.status(200).json({ 
      success: true, 
      token, 
      isProfileComplete,
      role: user.role 
    });
  } catch (error: any) {
    console.error('Firebase Auth Verification Error:', error);
    res.status(401).json({ success: false, message: 'Invalid or expired Firebase token' });
  }
};

/**
 * Simplified Direct Login for Customers (Skips OTP for testing/onboarding)
 */
export const customerDirectLogin = async (req: Request, res: Response) => {
  const { mobile } = req.body;

  if (!mobile) {
    return res.status(400).json({ success: false, message: 'Mobile number is required' });
  }

  try {
    const mobileStr = mobile.toString();

    // Find or create customer
    let user = await prisma.user.findUnique({
      where: { mobile: mobileStr },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          mobile: mobileStr,
          role: 'CUSTOMER',
        },
      });
    }

    // Check if profile and address exist
    const userWithDetails = await prisma.user.findUnique({
      where: { id: user.id },
      include: { profile: true, addresses: { take: 1 } },
    });
    
    const isProfileComplete = !!(userWithDetails?.profile?.fullName && userWithDetails.addresses.length > 0);

    // Generate JWT
    const token = jwt.sign(
      { userId: user.id, mobile: user.mobile, role: user.role },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '30d' }
    );

    res.status(200).json({ 
      success: true, 
      token, 
      isProfileComplete,
      role: user.role 
    });
  } catch (error: any) {
    console.error('Direct Login Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error', debug: error.message });
  }
};

export const loginPassword = async (req: Request, res: Response) => {
  const { mobile, password } = req.body;

  if (!mobile || !password) {
    return res.status(400).json({ success: false, message: 'Mobile and password are required' });
  }

  try {
    const mobileStr = mobile.toString();
    const user = await prisma.user.findUnique({
      where: { mobile: mobileStr },
      include: { spProfile: true },
    });

    if (!user || !user.passwordHash) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Role-specific check: Service Providers must be verified by admin
    if (user.role === 'SP' && !user.spProfile?.isVerified) {
      return res.status(403).json({ 
        success: false, 
        message: 'Your account is pending admin verification. Please try again later.' 
      });
    }

    // Generate JWT
    const token = jwt.sign(
      { userId: user.id, mobile: user.mobile, role: user.role },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '7d' }
    );

    res.status(200).json({ success: true, token, role: user.role });
  } catch (error) {
    console.error('Password Login Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
