import { Router } from 'express';
import * as p from '../controllers/performanceController.js';
import * as t from '../controllers/trainingController.js';
import { protect } from '../middleware/auth.js';

export const trainingRouter = Router();
trainingRouter.use(protect);
trainingRouter.get('/', t.listTrainings);
trainingRouter.post('/', t.createTraining);
trainingRouter.post('/:id/sessions', t.createSession);
trainingRouter.post('/sessions/:id/enroll', t.requestEnrollment);
trainingRouter.get('/sessions/:id/participants', t.listParticipants);
trainingRouter.post('/sessions/:id/participants', t.addParticipant);
trainingRouter.patch('/enrollments/:id', t.updateEnrollment);

export const performanceRouter = Router();
performanceRouter.use(protect);
performanceRouter.get('/', p.listReviews);
performanceRouter.post('/', p.createReview);
performanceRouter.put('/:id', p.updateReview);
performanceRouter.get('/insights/:employeeId', p.insights);
