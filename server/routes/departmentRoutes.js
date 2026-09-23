import { Router } from 'express';
import * as c from '../controllers/departmentController.js';
import { authorize, protect } from '../middleware/auth.js';

const router = Router();
router.use(protect);

router.get('/', c.listDepartments);
router.get('/:id', c.getDepartment);
router.post('/', authorize('admin', 'hr'), c.createDepartment);
router.put('/:id', authorize('admin', 'hr'), c.updateDepartment);
router.delete('/:id', authorize('admin'), c.deleteDepartment);

export default router;
