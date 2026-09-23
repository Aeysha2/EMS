import { Router } from 'express';
import * as c from '../controllers/projectController.js';
import { authorize, protect } from '../middleware/auth.js';

const router = Router();
router.use(protect);

// Configuration: types de demande, types de dépôt, circuit
router.get('/config', c.getConfig);
router.post('/request-types', authorize('admin', 'hr'), c.saveRequestType);
router.put('/request-types/:id', authorize('admin', 'hr'), c.saveRequestType);
router.post('/deposit-types', authorize('admin', 'hr'), c.saveDepositType);
router.put('/deposit-types/:id', authorize('admin', 'hr'), c.saveDepositType);
router.put('/circuit', authorize('admin', 'hr'), c.saveCircuit);

// Dossiers
router.get('/', c.listProjects);
router.post('/', c.createProject);
router.get('/:id', c.getProject);
router.put('/:id', c.updateProject);
router.post('/:id/actions', c.projectAction);
router.get('/:id/receipt', c.depositReceipt);
router.post('/:id/documents', c.uploadProjectDocument);
router.get('/:id/documents/:docId', c.downloadProjectDocument);

export default router;
