import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import { Loader } from './components/ui';
import { useAuth } from './context/AuthContext';
import Dashboard from './dashboard/Dashboard';
import Absences from './pages/Absences';
import Activate from './pages/Activate';
import Admin from './pages/Admin';
import AgentDossier from './pages/AgentDossier';
import Agents from './pages/Agents';
import Announcements from './pages/Announcements';
import Interop from './pages/Interop';
import Login from './pages/Login';
import MfaSetup from './pages/MfaSetup';
import Parametrage from './pages/Parametrage';
import Performance from './pages/Performance';
import Pilotage from './pages/Pilotage';
import Profile from './pages/Profile';
import Reprise from './pages/Reprise';
import RequestDetail from './pages/RequestDetail';
import Requests from './pages/Requests';
import Solde from './pages/Solde';
import Structures from './pages/Structures';
import Trainings from './pages/Trainings';

function RequireAuth({ children, allow }) {
  const auth = useAuth();
  if (auth.loading) return <div className="center-screen"><Loader /></div>;
  if (!auth.user) return <Navigate to="/login" replace />;
  if (auth.user.mfa_setup_required) return <Navigate to="/mfa-setup" replace />;
  if (allow && !allow(auth)) return <Navigate to="/" replace />;
  return children;
}

function PublicOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="center-screen"><Loader /></div>;
  return user ? <Navigate to="/" replace /> : children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
      <Route path="/activate" element={<PublicOnly><Activate /></PublicOnly>} />
      <Route path="/mfa-setup" element={<MfaSetup />} />
      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<Dashboard />} />
        <Route path="me" element={<AgentDossier self />} />
        <Route path="agents" element={<Agents />} />
        <Route path="agents/:id" element={<AgentDossier />} />
        <Route path="structures" element={<Structures />} />
        <Route path="requests" element={<Requests />} />
        <Route path="requests/:id" element={<RequestDetail />} />
        <Route path="absences" element={<Absences />} />
        <Route path="attendance" element={<Navigate to="/absences?tab=pointage" replace />} />
        <Route path="trainings" element={<Trainings />} />
        <Route path="performance" element={<Performance />} />
        <Route path="solde" element={<Solde />} />
        <Route path="pilotage" element={<RequireAuth allow={(a) => a.isPilotage || a.isDRH}><Pilotage /></RequireAuth>} />
        <Route path="parametrage" element={<RequireAuth allow={(a) => a.isCentral}><Parametrage /></RequireAuth>} />
        <Route path="interop" element={<RequireAuth allow={(a) => a.isDSI}><Interop /></RequireAuth>} />
        <Route path="admin" element={<RequireAuth allow={(a) => a.isDSI}><Admin /></RequireAuth>} />
        <Route path="reprise" element={<RequireAuth allow={(a) => a.isDRH}><Reprise /></RequireAuth>} />
        <Route path="announcements" element={<Announcements />} />
        <Route path="profile" element={<Profile />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
