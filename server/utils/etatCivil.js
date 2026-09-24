/**
 * Connecteur vers le registre d'état civil / identité nationale (section 6.4).
 *
 * En production, ETAT_CIVIL_URL et ETAT_CIVIL_TOKEN pointent vers le service de l'État
 * (appel HTTPS sur le bus d'échange). Sans configuration, le connecteur fonctionne en mode
 * SIMULATION : il ne contacte aucun système externe et répond de façon déterministe,
 * ce qui permet de tester le processus de fiabilisation de l'identité.
 */
export const isSimulated = () => !process.env.ETAT_CIVIL_URL;

export const verifyIdentity = async ({ nin, first_name: firstName, last_name: lastName, date_of_birth: dob }) => {
  if (!isSimulated()) {
    const res = await fetch(`${process.env.ETAT_CIVIL_URL.replace(/\/$/, '')}/identites/verification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.ETAT_CIVIL_TOKEN || ''}` },
      body: JSON.stringify({ nin, prenom: firstName, nom: lastName, date_naissance: dob }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`Service d'état civil indisponible (${res.status})`);
    const body = await res.json();
    return { match: !!body.conforme, source: 'etat_civil', details: body.motif || null };
  }
  // Simulation : un NIN valide (13 ou 14 chiffres) ne commençant pas par 9 est « conforme »
  const valid = /^\d{13,14}$/.test(nin) && !nin.startsWith('9');
  return {
    match: valid,
    source: 'simulation',
    details: valid ? 'Identité conforme (mode simulation)' : 'NIN inconnu du registre (mode simulation)',
  };
};
