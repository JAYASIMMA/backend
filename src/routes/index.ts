import express from 'express';
import * as authController from '../controllers/auth.controller';
import * as locationController from '../controllers/location.controller';
import * as bookingController from '../controllers/booking.controller';
import * as profileController from '../controllers/profile.controller';
import * as categoryController from '../controllers/category.controller';
import * as spController from '../controllers/sp.controller';
import * as adminController from '../controllers/admin.controller';
import * as customerController from '../controllers/customer.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { upload } from '../middleware/upload.middleware';

const router = express.Router();

// Auth Routes
// Firebase Auth
router.post('/auth/firebase-verify', authController.verifyFirebaseToken);
router.post('/auth/login', authController.loginPassword);
router.post('/auth/customer-direct-login', authController.customerDirectLogin);
router.post('/auth/sp/signup', spController.signup);

// Public Passport View (Global)
router.get('/public/passport/:id', spController.getPublicPassport);

// Location Routes (Customer only)
router.get('/customer/addresses', authenticate, authorize(['CUSTOMER']), locationController.getAddresses);
router.post('/customer/addresses', authenticate, authorize(['CUSTOMER']), locationController.createAddress);
router.put('/customer/addresses/:id/default', authenticate, authorize(['CUSTOMER']), locationController.setDefaultAddress);

// Booking Routes
router.post('/bookings', authenticate, authorize(['CUSTOMER']), bookingController.createBooking);
router.get('/bookings/active', authenticate, bookingController.getActiveBookings);
router.get('/bookings/history', authenticate, bookingController.getBookingHistory);
router.patch('/bookings/:id/status', authenticate, bookingController.updateBookingStatus);
router.post('/bookings/:id/cancel', authenticate, bookingController.cancelBooking);

// Profile Routes
router.get('/profile', authenticate, profileController.getProfile);
router.put('/profile', authenticate, upload.single('profilePicture'), profileController.updateProfile);
router.post('/profile/picture', authenticate, upload.single('profilePicture'), profileController.uploadProfilePicture);
router.post('/customer/setup-profile', authenticate, authorize(['CUSTOMER']), upload.single('profilePicture'), customerController.setupProfile);

// SP Routes
router.get('/sp/broadcasts', authenticate, authorize(['SP']), spController.getBroadcasts);

// Auth Routes
// ...
// Category Routes
router.get('/categories', categoryController.getCategories);
router.post('/categories', authenticate, authorize(['ADMIN']), upload.single('icon'), categoryController.createCategory);
router.put('/categories/:id', authenticate, authorize(['ADMIN']), upload.single('icon'), categoryController.updateCategory);
router.delete('/categories/:id', authenticate, authorize(['ADMIN']), categoryController.deleteCategory);
router.get('/subcategories', categoryController.getSubcategories);
router.post('/subcategories', authenticate, authorize(['ADMIN']), upload.single('icon'), categoryController.createSubcategory);

// Admin Specific Routes
router.get('/admin/stats', authenticate, authorize(['ADMIN']), adminController.getDashboardStats);
router.get('/admin/customers', authenticate, authorize(['ADMIN']), adminController.getCustomers);
router.get('/admin/sps', authenticate, authorize(['ADMIN']), adminController.getSPs);
router.get('/admin/requests', authenticate, authorize(['ADMIN']), adminController.getAllRequests);
router.get('/admin/audits', authenticate, authorize(['ADMIN']), adminController.getAudits);
router.post('/admin/sps', authenticate, authorize(['ADMIN']), upload.fields([{ name: 'profilePicture', maxCount: 1 }, { name: 'aadharCard', maxCount: 1 }]), adminController.createSP);
router.patch('/admin/sps/:id/verify', authenticate, authorize(['ADMIN']), adminController.toggleSPVerification);
router.delete('/admin/sps/:id', authenticate, authorize(['ADMIN']), adminController.deletePartner);

// Admin Customer Control
router.post('/admin/customers/:id/reset-password', authenticate, authorize(['ADMIN']), adminController.resetCustomerPassword);
router.put('/admin/profile', authenticate, authorize(['ADMIN']), upload.single('profilePicture'), adminController.updateAdminProfile);

export default router;
