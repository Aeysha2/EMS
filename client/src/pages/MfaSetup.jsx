import { Navigate } from 'react-router-dom';
import { Emblem } from '../components/Layout';
import MfaEnroll from '../components/MfaEnroll';
import { Loader } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { ROLE_LABELS } from '../utils/format';

/** Page imposée aux profils sensibles tant que la 2FA n'est pas activée (section 9 du cahier des charges). */
export default function MfaSetup() {
  const { user, loading, logout } = useAuth();
  if (loading) return <div className="center-screen"><Loader /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.mfa_setup_required) return <Navigate to="/" replace />;
  return (
    <div className="auth-page single">
      <div className="auth-card wide stack">
        <div className="row gap"><Emblem size={40} /><h2>Sécurisez votre compte</h2></div>
        <p>Votre profil <b>{ROLE_LABELS[user.role]}</b> donne accès à des données sensibles. La réglementation impose
          une <b>double authentification</b> : à chaque connexion, un code temporaire vous sera demandé en plus du mot de passe.</p>
        <MfaEnroll />
        <button type="button" className="link" onClick={logout}>Se déconnecter</button>
      </div>
    </div>
  );
}
