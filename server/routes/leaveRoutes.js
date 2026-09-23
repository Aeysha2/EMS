import { Router } from 'express';
import * as c from '../controllers/leaveController.js';
import { protect } from '../middleware/auth.js';

const router = Router();
router.use(protect);

router.get('/', c.listLeaves);
router.get('/balance', c.getBalance);
router.post('/', c.applyLeave);
router.patch('/:id/review', c.reviewLeave); // HR/Admin or department manager (checked in controller)
router.patch('/:id/cancel', c.cancelLeave);

export default router;
