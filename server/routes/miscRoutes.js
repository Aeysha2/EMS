import { Router } from 'express';
import { getDashboard } from '../controllers/dashboardController.js';
import * as n from '../controllers/notificationController.js';
import * as r from '../controllers/reportController.js';
import * as u from '../controllers/userController.js';
import { authorize, protect } from '../middleware/auth.js';

const router = Router();
router.use(protect);

router.get('/dashboard', getDashboard);

router.get('/notifications', n.listNotifications);
router.patch('/notifications/:id/read', n.markRead);
router.get('/announcements', n.listAnnouncements);
router.post('/announcements', authorize('admin', 'hr'), n.createAnnouncement);
router.delete('/announcements/:id', authorize('admin', 'hr'), n.deleteAnnouncement);
router.get('/calendar', n.calendar);

router.get('/reports/departments', authorize('admin', 'hr'), r.departmentReport);
router.get('/reports/payroll', authorize('admin', 'hr'), r.payrollReport);
router.get('/reports/leaves', authorize('admin', 'hr'), r.leaveReport);
router.get('/reports/projects', authorize('admin', 'hr'), r.projectReport);
router.get('/reports/analytics', authorize('admin', 'hr'), r.hrAnalytics);

router.get('/users', authorize('admin'), u.listUsers);
router.patch('/users/:id', authorize('admin'), u.updateUser);
router.get('/activity', authorize('admin', 'hr'), u.activityLog);

export default router;
