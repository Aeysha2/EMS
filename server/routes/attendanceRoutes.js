import { Router } from 'express';
import * as c from '../controllers/attendanceController.js';
import { authorize, protect } from '../middleware/auth.js';

const router = Router();
router.use(protect);

router.post('/check-in', c.checkIn);
router.post('/check-out', c.checkOut);
router.get('/today', c.today);
router.get('/report', c.monthlyReport);
router.get('/', c.listAttendance);
router.post('/', authorize('admin', 'hr'), c.upsertAttendance);
router.post('/mark-absent', authorize('admin', 'hr'), c.markAbsent);

export default router;
