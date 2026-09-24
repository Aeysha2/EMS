import { Router } from 'express';
import * as a from '../controllers/adminController.js';
import * as i from '../controllers/importController.js';
import * as p from '../controllers/pilotageController.js';
import * as s from '../controllers/structureController.js';
import { authorize, protect } from '../middleware/auth.js';

const router = Router();
router.use(protect);

router.get('/dashboard', p.dashboard);
router.get('/pilotage/indicators', p.indicators);
router.get('/pilotage/export.xlsx', p.exportXlsx);
router.get('/pilotage/export.pdf', p.exportPdf);

router.get('/corps', s.listCorps);
router.post('/corps', s.createCorps);
router.put('/positions/:id', s.updatePosition);

router.get('/imports/template', i.template);
router.get('/imports', i.listBatches);
router.post('/imports', i.analyze);
router.get('/imports/:id', i.getBatch);
router.post('/imports/:id/decision', i.decide);

router.get('/notifications', a.listNotifications);
router.patch('/notifications/:id/read', a.markRead);
router.get('/announcements', a.listAnnouncements);
router.post('/announcements', a.createAnnouncement);
router.delete('/announcements/:id', a.deleteAnnouncement);
router.get('/calendar', a.calendar);

router.get('/admin/users', authorize('admin_dsi'), a.listUsers);
router.post('/admin/users', authorize('admin_dsi'), a.createUser);
router.patch('/admin/users/:id', authorize('admin_dsi'), a.updateUser);
router.post('/admin/users/:id/review', authorize('admin_dsi'), a.reviewUser);
router.get('/admin/audit', authorize('admin_dsi'), a.auditLog);
router.get('/admin/audit/verify', authorize('admin_dsi'), a.auditVerify);

export default router;
