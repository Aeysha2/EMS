import { Router } from 'express';
import * as c from '../controllers/payrollController.js';
import { authorize, protect } from '../middleware/auth.js';

const router = Router();
router.use(protect);

router.get('/', c.listPayrolls);
router.get('/rules', c.getRules);
router.post('/preview', authorize('admin', 'hr'), c.previewPayslip);
router.post('/generate', authorize('admin', 'hr'), c.generatePayroll);
router.get('/:id', c.getPayroll);
router.get('/:id/pdf', c.downloadPayslip);
router.patch('/:id/pay', authorize('admin', 'hr'), c.markPaid);
router.delete('/:id', authorize('admin', 'hr'), c.deletePayroll);

export default router;
