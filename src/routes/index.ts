import express from 'express';
import * as authController from '../controllers/auth.controller';
import * as locationController from '../controllers/location.controller';
import * as bookingController from '../controllers/booking.controller';
import * as profileController from '../controllers/profile.controller';
import * as categoryController from '../controllers/category.controller';
import * as spController from '../controllers/sp.controller';
import * as adminController from '../controllers/admin.controller';
import * as customerController from '../controllers/customer.controller';
import * as chatController from '../controllers/chat.controller';
import * as healthController from '../controllers/health.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { upload } from '../middleware/upload.middleware';

const router = express.Router();

// Auth Routes
// Firebase Auth
router.post('/auth/firebase-verify', authController.verifyFirebaseToken);
router.post('/auth/login', authController.loginPassword);
router.post('/auth/check-user', authController.checkUserRole);
router.post('/auth/sp/signup', spController.signup);

// Public Passport View (Global)
router.get('/public/passport/:id', spController.getPublicPassport);
router.get('/sp/:id/feedbacks', spController.getSPFeedbacks);

// Diagnostic Routes
router.get('/health', (req, res) => res.status(200).json({ status: 'OK' }));
router.get('/debug/connections', healthController.checkConnections);

// Location Routes (Customer only)
router.get('/customer/addresses', authenticate, authorize(['CUSTOMER']), locationController.getAddresses);
router.post('/customer/addresses', authenticate, authorize(['CUSTOMER']), locationController.createAddress);
router.put('/customer/addresses/:id/default', authenticate, authorize(['CUSTOMER']), locationController.setDefaultAddress);
router.delete('/customer/addresses/:id', authenticate, authorize(['CUSTOMER']), locationController.deleteAddress);

// Booking Routes
router.post('/bookings', authenticate, authorize(['CUSTOMER']), upload.single('audio'), bookingController.createBooking);
router.get('/bookings/active', authenticate, bookingController.getActiveBookings);
router.get('/bookings/history', authenticate, bookingController.getBookingHistory);
router.patch('/bookings/:id/status', authenticate, bookingController.updateBookingStatus);
router.post('/bookings/:id/cancel', authenticate, bookingController.cancelBooking);
router.post('/bookings/:requestId/feedback', authenticate, authorize(['CUSTOMER']), bookingController.submitFeedback);

// Chat Routes
router.get('/chat/:requestId', authenticate, chatController.getMessages);
router.post('/chat', authenticate, chatController.sendMessage);

// Profile Routes
router.get('/profile', authenticate, profileController.getProfile);
router.put('/profile', authenticate, upload.single('profilePicture'), profileController.updateProfile);
router.post('/profile/picture', authenticate, upload.single('profilePicture'), profileController.uploadProfilePicture);
router.post('/customer/setup-profile', authenticate, authorize(['CUSTOMER']), upload.single('profilePicture'), customerController.setupProfile);

// SP Routes
router.get('/sp/stats', authenticate, authorize(['SP']), spController.getDashboardStats);
router.get('/sp/history', authenticate, authorize(['SP']), spController.getServiceHistory);
router.get('/sp/broadcasts', authenticate, authorize(['SP']), spController.getBroadcasts);
router.patch('/sp/duty-status', authenticate, authorize(['SP']), spController.updateDutyStatus);
router.patch('/sp/live-location', authenticate, authorize(['SP']), spController.updateLiveLocation);
router.post('/sp/reject-broadcast', authenticate, authorize(['SP']), spController.rejectBroadcast);

// Auth Routes
// ...
// Category Routes
router.get('/categories', categoryController.getCategories);
router.get('/categories/:id', categoryController.getCategoryById);
router.get('/categories/:id/sps', categoryController.getNearbySPs);
router.post('/categories', authenticate, authorize(['ADMIN']), upload.single('icon'), categoryController.createCategory);
router.put('/categories/:id', authenticate, authorize(['ADMIN']), upload.single('icon'), categoryController.updateCategory);
router.delete('/categories/:id', authenticate, authorize(['ADMIN']), categoryController.deleteCategory);
router.get('/subcategories', categoryController.getSubcategories);
router.post('/subcategories', authenticate, authorize(['ADMIN']), upload.single('icon'), categoryController.createSubcategory);
router.put('/subcategories/:id', authenticate, authorize(['ADMIN']), upload.single('icon'), categoryController.updateSubcategory);
router.delete('/subcategories/:id', authenticate, authorize(['ADMIN']), categoryController.deleteSubcategory);

// Admin Specific Routes
router.get('/admin/stats', authenticate, authorize(['ADMIN']), adminController.getDashboardStats);
router.get('/admin/customers', authenticate, authorize(['ADMIN']), adminController.getCustomers);
router.get('/admin/sps', authenticate, authorize(['ADMIN']), adminController.getSPs);
router.get('/admin/requests', authenticate, authorize(['ADMIN']), adminController.getAllRequests);
router.patch('/admin/requests/:id/status', authenticate, authorize(['ADMIN']), adminController.updateRequestStatus);
router.get('/admin/audits', authenticate, authorize(['ADMIN']), adminController.getAudits);
router.post('/admin/sps', authenticate, authorize(['ADMIN']), upload.fields([{ name: 'profilePicture', maxCount: 1 }, { name: 'aadharCard', maxCount: 1 }]), adminController.createSP);
router.patch('/admin/sps/:id', authenticate, authorize(['ADMIN']), adminController.updateSPAccount);
router.patch('/admin/sps/:id/verify', authenticate, authorize(['ADMIN']), adminController.toggleSPVerification);
router.delete('/admin/sps/:id', authenticate, authorize(['ADMIN']), adminController.deletePartner);

// Admin Customer Control
router.post('/admin/customers/:id/reset-password', authenticate, authorize(['ADMIN']), adminController.resetCustomerPassword);
router.put('/admin/profile', authenticate, authorize(['ADMIN']), upload.single('profilePicture'), adminController.updateAdminProfile);

// Admin Management (Super Admin only or high-level admin)
router.get('/admin/list', authenticate, authorize(['ADMIN']), adminController.getAdmins);
router.post('/admin/add', authenticate, authorize(['ADMIN']), adminController.createAdmin);
router.patch('/admin/list/:id', authenticate, authorize(['ADMIN']), adminController.updateAdmin);
router.delete('/admin/list/:id', authenticate, authorize(['ADMIN']), adminController.deleteAdmin);
router.post('/admin/upload', authenticate, authorize(['ADMIN']), upload.single('file'), adminController.uploadAdminAsset);

export default router;
