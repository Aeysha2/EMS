import { Router } from 'express';
import * as a from '../controllers/attendanceController.js';
import * as l from '../controllers/leaveController.js';
import { protect } from '../middleware/auth.js';

export const leaveRouter = Router();
leaveRouter.use(protect);
leaveRouter.get('/types', l.listLeaveTypes);
leaveRouter.get('/balance', l.getBalance);
leaveRouter.get('/', l.listLeaves);
leaveRouter.post('/', l.applyLeave);
leaveRouter.patch('/:id/cancel', l.cancelLeave);

export const attendanceRouter = Router();
attendanceRouter.use(protect);
attendanceRouter.post('/check-in', a.checkIn);
attendanceRouter.post('/check-out', a.checkOut);
attendanceRouter.get('/today', a.today);
attendanceRouter.get('/report', a.monthlyReport);
attendanceRouter.get('/', a.listAttendance);
attendanceRouter.post('/', a.upsertAttendance);
attendanceRouter.post('/close-day', a.closeDay);
