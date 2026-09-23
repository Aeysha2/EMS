import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { changePassword, login, me, register } from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';

const router = Router();

// Brute-force protection on credential endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.AUTH_RATE_LIMIT || 20),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Trop de tentatives, réessayez dans quelques minutes' },
});

router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.get('/me', protect, me);
router.put('/password', protect, changePassword);

export default router;
