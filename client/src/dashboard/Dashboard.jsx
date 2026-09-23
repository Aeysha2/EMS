import { useAuth } from '../context/AuthContext';
import useFetch from '../utils/useFetch';
import { ErrorBox, Loader } from '../components/ui';
import AdminDashboard from './AdminDashboard';
import EmployeeDashboard from './EmployeeDashboard';

export default function Dashboard() {
  const { canManage } = useAuth();
  const { data, loading, error, reload } = useFetch('/dashboard');
  if (loading && !data) return <Loader />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  return canManage && data.org ? <AdminDashboard data={data} reload={reload} /> : <EmployeeDashboard data={data} reload={reload} />;
}
