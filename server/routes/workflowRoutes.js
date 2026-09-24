import { Router } from 'express';
import * as c from '../controllers/workflowController.js';
import { protect } from '../middleware/auth.js';

export const typesRouter = Router();
typesRouter.use(protect);
typesRouter.get('/types', c.listTypes);
typesRouter.put('/types/:id', c.saveType);

const router = Router();
router.use(protect);
router.get('/', c.listRequests);
router.post('/', c.createNewRequest);
router.get('/:id', c.getRequest);
router.post('/:id/actions', c.requestAction);
router.get('/:id/receipt', c.requestReceipt);
router.post('/:id/documents', c.uploadRequestDocument);
router.get('/:id/documents/:docId', c.downloadRequestDocument);

export default router;
