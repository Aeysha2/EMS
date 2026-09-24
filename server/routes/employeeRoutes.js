import { Router } from 'express';
import * as c from '../controllers/employeeController.js';
import { authorize, protect } from '../middleware/auth.js';

const router = Router();
router.use(protect);

router.get('/', c.listEmployees);
router.get('/me', c.getMe);
router.put('/me', c.updateMe);
router.post('/', authorize('gestionnaire_rh'), c.createEmployee);
router.get('/:id', c.getEmployee);
router.get('/:id/dossier', c.getDossier);
router.get('/:id/nin', c.revealNin);
router.put('/:id', authorize('gestionnaire_rh'), c.updateEmployee);
router.post('/:id/verify-identity', authorize('gestionnaire_rh'), c.verifyEmployeeIdentity);
router.post('/:id/biometrie', authorize('gestionnaire_rh'), c.enrollBiometric);
router.post('/:id/diplomas', authorize('gestionnaire_rh'), c.addDiploma);
router.delete('/:id/diplomas/:diplomaId', authorize('gestionnaire_rh'), c.deleteDiploma);
router.post('/:id/career-events', authorize('gestionnaire_rh'), c.addCareerEvent);
router.post('/:id/documents', c.uploadDocument);
router.get('/:id/documents/:docId', c.downloadDocument);

export default router;
