import { Router } from 'express';
import * as c from '../controllers/interopController.js';
import { authorize, protect } from '../middleware/auth.js';

/** API partenaires (clé d'API), sous /api/interop/v1 */
export const partnerRouter = Router();
partnerRouter.get('/openapi.json', c.openapi);
partnerRouter.use(c.apiKeyAuth);
partnerRouter.get('/agents/:sigrhId', c.requireScope('agents:read'), c.getAgent);
partnerRouter.get('/structures', c.requireScope('structures:read'), c.getStructures);
partnerRouter.get('/statistiques/effectifs', c.requireScope('statistiques:read'), c.getStats);
partnerRouter.post('/biometrie/pointages', c.requireScope('biometrie:write'), c.postPunches);
partnerRouter.post('/solde/paiements', c.requireScope('solde:write'), c.postSolde);

/** Gestion des clés (DSI), sous /api/interop */
export const clientRouter = Router();
clientRouter.use(protect, authorize('admin_dsi'));
clientRouter.get('/clients', c.listClients);
clientRouter.post('/clients', c.createClient);
clientRouter.patch('/clients/:id', c.updateClient);
