import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pool } from './config/db.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { sanitizeBody } from './middleware/sanitize.js';
import adminRoutes from './routes/adminRoutes.js';
import authRoutes from './routes/authRoutes.js';
import { performanceRouter, trainingRouter } from './routes/careerRoutes.js';
import employeeRoutes from './routes/employeeRoutes.js';
import { clientRouter, partnerRouter } from './routes/interopRoutes.js';
import soldeRoutes from './routes/soldeRoutes.js';
import structureRoutes from './routes/structureRoutes.js';
import { attendanceRouter, leaveRouter } from './routes/timeRoutes.js';
import workflowRoutes, { typesRouter } from './routes/workflowRoutes.js';
import { scheduleAlerts } from './utils/alerts.js';
import { isSimulated } from './utils/etatCivil.js';
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
app.use(express.json({ limit: '8mb' }));
app.use(sanitizeBody);

app.get('/api/health', async (req, res) => {
  await pool.query('SELECT 1');
  res.json({ status: 'online', database: 'ok', etat_civil: isSimulated() ? 'simulation' : 'connecté',
    timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/interop/v1', partnerRouter);
app.use('/api/interop', clientRouter);
app.use('/api/employees', employeeRoutes);
app.use('/api/structures', structureRoutes);
app.use('/api/workflows', typesRouter);
app.use('/api/requests', workflowRoutes);
app.use('/api/leaves', leaveRouter);
app.use('/api/attendance', attendanceRouter);
app.use('/api/trainings', trainingRouter);
app.use('/api/performance', performanceRouter);
app.use('/api/solde', soldeRoutes);
app.use('/api', adminRoutes);

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5002;

if (process.env.NODE_ENV !== 'test') {
  migrate()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`🇸🇳 SIGRH — API démarrée sur http://localhost:${PORT}`);
        if (isSimulated()) console.log('ℹ️  Connecteur état civil en mode simulation (ETAT_CIVIL_URL non défini)');
      });
      scheduleAlerts();
    })
    .catch((err) => {
      console.error('❌ Impossible d’initialiser la base de données :', err.message);
      process.exit(1);
    });
}
