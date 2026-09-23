import PDFDocument from 'pdfkit';

const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août',
  'Septembre', 'Octobre', 'Novembre', 'Décembre'];

const fmt = (n) =>
  `${Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).replace(/ | /g, ' ')} ${process.env.CURRENCY || 'FCFA'}`;

/** Stream a salary slip PDF to `res`. */
export const streamPayslip = (res, slip) => {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const period = `${MONTHS[slip.period_month - 1]} ${slip.period_year}`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition',
    `attachment; filename="bulletin-${slip.employee_code}-${slip.period_year}-${String(slip.period_month).padStart(2, '0')}.pdf"`);
  doc.pipe(res);

  const org = process.env.ORG_NAME || 'Ministère de la Fonction Publique';
  doc.fontSize(16).fillColor('#1e3a8a').text(org, { align: 'center' });
  doc.fontSize(10).fillColor('#555').text('Direction des Ressources Humaines', { align: 'center' });
  doc.moveDown();
  doc.fontSize(14).fillColor('#000').text(`BULLETIN DE PAIE — ${period.toUpperCase()}`, { align: 'center' });
  doc.moveDown();

  const d = slip.details || {};
  const infoTop = doc.y;
  doc.fontSize(10);
  [
    ['Agent', slip.full_name],
    ['Identifiant', slip.employee_code],
    ['Matricule', slip.matricule || '—'],
    ['Fonction', slip.designation || '—'],
  ].forEach(([k, v], i) => doc.text(`${k} : ${v}`, 50, infoTop + i * 15));
  [
    ['Département', slip.department_name || '—'],
    ['Grade', slip.grade || '—'],
    ['Jours ouvrés', d.workingDays ?? '—'],
    ['Statut', slip.status === 'paid' ? 'Payé' : 'Traité'],
  ].forEach(([k, v], i) => doc.text(`${k} : ${v}`, 320, infoTop + i * 15));
  doc.y = infoTop + 75;

  const row = (label, amount, opts = {}) => {
    const y = doc.y;
    if (opts.fill) doc.rect(50, y - 3, 495, 18).fill(opts.fill).fillColor('#000');
    doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10)
      .text(label, 60, y, { width: 300 })
      .text(amount, 360, y, { width: 175, align: 'right' });
    doc.y = y + 18;
  };

  const section = (title) => {
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#1e3a8a').text(title, 50);
    doc.fillColor('#000').moveDown(0.3);
  };

  section('Gains');
  row('Salaire de base', fmt(slip.basic));
  row('Indemnité de logement', fmt(d.housing));
  row('Indemnité de transport', fmt(d.transport));
  row(`Heures supplémentaires (${d.overtimeHours ?? 0} h)`, fmt(slip.overtime_pay));
  row('Primes / bonus', fmt(slip.bonuses));
  row('SALAIRE BRUT', fmt(slip.gross), { bold: true, fill: '#eef2ff' });

  section('Retenues');
  row(`Retenue congé sans solde (${d.unpaidLeaveDays ?? 0} j)`, fmt(d.unpaidLeave));
  row('Cotisation sociale / retraite', fmt(d.socialSecurity));
  row('Autres retenues', fmt(d.otherDeductions));
  row(`Impôt sur le revenu (base imposable ${fmt(d.taxable)})`, fmt(slip.tax));
  row('TOTAL RETENUES', fmt(Number(slip.deductions) + Number(slip.tax)), { bold: true, fill: '#fef2f2' });

  doc.moveDown();
  row('NET À PAYER', fmt(slip.net), { bold: true, fill: '#dcfce7' });

  doc.moveDown(3);
  doc.font('Helvetica').fontSize(8).fillColor('#777')
    .text(`Document généré le ${new Date().toLocaleString('fr-FR')} — Réf. PAY-${slip.id}`, 50, doc.y, { align: 'center' })
    .text('Bulletin à conserver sans limitation de durée.', { align: 'center' });
  doc.end();
};
