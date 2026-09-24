import { Router } from 'express';
import * as c from '../controllers/soldeController.js';
import { protect } from '../middleware/auth.js';

const router = Router();
router.use(protect);
router.get('/payslips', c.listPayslips);
router.get('/payslips/:id/pdf', c.payslipPdf);
router.post('/simulation', c.simulate);
router.get('/imports', c.listImports);
router.post('/imports', c.uploadSoldeFile);
router.get('/imports/:id/reconciliation', c.reconciliation);

export default router;
