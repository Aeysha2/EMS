import { QrCode, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../services/api';

/** Enrôlement de la double authentification (TOTP) : code QR puis confirmation par un premier code. */
export default function MfaEnroll({ onDone }) {
  const { setUser } = useAuth();
  const toast = useToast();
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState('');

  const start = async () => {
    try { setSetup(await api.post('/auth/mfa/setup')); } catch (err) { toast.error(err); }
  };
  const confirm = async (e) => {
    e.preventDefault();
    try {
      const { user } = await api.post('/auth/mfa/enable', { code });
      setUser(user);
      toast.success('Double authentification activée');
      onDone?.();
    } catch (err) { toast.error(err); }
  };

  if (!setup) {
    return <button type="button" className="btn btn-primary" onClick={start}><QrCode size={16} /> Générer mon code QR</button>;
  }
  return (
    <form className="mfa-enroll" onSubmit={confirm}>
      <ol>
        <li>Installez une application d’authentification (Google Authenticator, Microsoft Authenticator, FreeOTP…).</li>
        <li>Scannez ce code QR :
          <img src={setup.qr} alt="Code QR de double authentification" width={200} height={200} />
          <small className="block muted">Ou saisissez la clé : <code>{setup.secret}</code></small>
        </li>
        <li>Saisissez le code à 6 chiffres affiché par l’application :</li>
      </ol>
      <input className="otp" inputMode="numeric" maxLength={6} required value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} aria-label="Code à 6 chiffres" />
      <button className="btn btn-success" disabled={code.length !== 6}><ShieldCheck size={16} /> Activer</button>
    </form>
  );
}
