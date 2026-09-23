import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pool } from './config/db.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { sanitizeBody } from './middleware/sanitize.js';
import attendanceRoutes from './routes/attendanceRoutes.js';
import authRoutes from './routes/authRoutes.js';
import departmentRoutes from './routes/departmentRoutes.js';
import employeeRoutes from './routes/employeeRoutes.js';
import leaveRoutes from './routes/leaveRoutes.js';
import miscRoutes from './routes/miscRoutes.js';
import payrollRoutes from './routes/payrollRoutes.js';
import performanceRoutes from './routes/performanceRoutes.js';
import projectRoutes from './routes/projectRoutes.js';
import { migrate } from './utils/migrate.js';

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  console.error('❌ JWT_SECRET manquant ou trop court (16 caractères minimum)');
  process.exit(1);
}

export const app = express();
app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: (process.env.CLIENT_URL || 'http://localhost:5173').split(',').map((s) => s.trim()),
  exposedHeaders: ['Content-Disposition'],
}));
app.use(express.json({ limit: '5mb' }));
app.use(sanitizeBody);

app.get('/api/health', async (req, res) => {
  await pool.query('SELECT 1');
  res.json({ status: 'online', database: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/performance', performanceRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api', miscRoutes);

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5002;

if (process.env.NODE_ENV !== 'test') {
  migrate()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`🚀 EMS API démarrée sur http://localhost:${PORT}`);
        console.log(`📋 Santé : http://localhost:${PORT}/api/health`);
      });
    })
    .catch((err) => {
      console.error('❌ Impossible d’initialiser la base de données :', err.message);
      process.exit(1);
    });
}
