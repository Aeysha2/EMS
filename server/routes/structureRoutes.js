import { Router } from 'express';
import * as c from '../controllers/structureController.js';
import { protect } from '../middleware/auth.js';

const router = Router();
router.use(protect);

router.get('/', c.listStructures);
router.get('/requests', c.listChangeRequests);
router.post('/requests', c.proposeChange);
router.patch('/requests/:id', c.reviewChangeRequest);
router.post('/', c.createStructure);
router.get('/:id', c.getStructure);
router.put('/:id', c.updateStructure);
router.post('/:id/positions', c.createPosition);

export default router;
