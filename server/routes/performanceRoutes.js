import { Router } from 'express';
import * as c from '../controllers/performanceController.js';
import { authorize, protect } from '../middleware/auth.js';

const router = Router();
router.use(protect);

router.get('/', c.listReviews);
router.get('/insights/:employeeId', c.insights);
router.post('/', c.createReview); // HR/Admin or department manager (checked in controller)
router.put('/:id', c.updateReview);
router.delete('/:id', authorize('admin', 'hr'), c.deleteReview);

export default router;
