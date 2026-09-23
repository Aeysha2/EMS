import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import { Loader } from './components/ui';
import { useAuth } from './context/AuthContext';
import Dashboard from './dashboard/Dashboard';
import Announcements from './pages/Announcements';
import Attendance from './pages/Attendance';
import Departments from './pages/Departments';
import EmployeeDetail from './pages/EmployeeDetail';
import Employees from './pages/Employees';
import Leaves from './pages/Leaves';
import Login from './pages/Login';
import Payroll from './pages/Payroll';
import Performance from './pages/Performance';
import Profile from './pages/Profile';
import ProjectDetail from './pages/ProjectDetail';
import Projects from './pages/Projects';
import ProjectSettings from './pages/ProjectSettings';
import Register from './pages/Register';
import Reports from './pages/Reports';
import Users from './pages/Users';

function RequireAuth({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="center-screen"><Loader /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
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
      <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />
      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<Dashboard />} />
        <Route path="employees" element={<Employees />} />
        <Route path="employees/:id" element={<EmployeeDetail />} />
        <Route path="departments" element={<Departments />} />
        <Route path="attendance" element={<Attendance />} />
        <Route path="leaves" element={<Leaves />} />
        <Route path="payroll" element={<Payroll />} />
        <Route path="performance" element={<Performance />} />
        <Route path="projects" element={<Projects />} />
        <Route path="projects/:id" element={<ProjectDetail />} />
        <Route path="projects-settings" element={<RequireAuth roles={['admin', 'hr']}><ProjectSettings /></RequireAuth>} />
        <Route path="reports" element={<RequireAuth roles={['admin', 'hr']}><Reports /></RequireAuth>} />
        <Route path="announcements" element={<Announcements />} />
        <Route path="users" element={<RequireAuth roles={['admin']}><Users /></RequireAuth>} />
        <Route path="profile" element={<Profile />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
