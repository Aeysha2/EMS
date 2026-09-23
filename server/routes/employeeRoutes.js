import { Router } from 'express';
import * as c from '../controllers/employeeController.js';
import { authorize, protect } from '../middleware/auth.js';

const router = Router();
router.use(protect);

router.get('/', c.listEmployees);
router.get('/me', c.getMe);
router.put('/me', c.updateMe);
router.get('/:id', c.getEmployee);
router.post('/', authorize('admin', 'hr'), c.createEmployee);
router.put('/:id', authorize('admin', 'hr'), c.updateEmployee);
router.delete('/:id', authorize('admin'), c.deleteEmployee);

export default router;
