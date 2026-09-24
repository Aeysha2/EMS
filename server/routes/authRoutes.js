import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as c from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';

const router = Router();

// Anti force brute : seules les tentatives échouées sont comptées
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.AUTH_RATE_LIMIT || 20),
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Trop de tentatives échouées, réessayez dans quelques minutes' },
});

router.post('/login', limiter, c.login);
router.post('/mfa/verify', limiter, c.mfaVerify);
router.post('/activate', limiter, c.activate);
router.get('/me', protect, c.me);
router.put('/password', protect, c.changePassword);
router.post('/mfa/setup', protect, c.mfaSetup);
router.post('/mfa/enable', protect, c.mfaEnable);
router.post('/mfa/disable', protect, c.mfaDisable);

export default router;
