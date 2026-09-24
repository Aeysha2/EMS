import PDFDocument from 'pdfkit';

const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre',
  'Novembre', 'Décembre'];
const fmt = (n) => `${Math.round(Number(n || 0)).toLocaleString('fr-FR').replace(/ | /g, ' ')} FCFA`;

/** Bulletin de paie dématérialisé (données transmises par la Solde). */
export const streamPayslip = (res, slip) => {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition',
    `attachment; filename="bulletin-${slip.sigrh_id}-${slip.period_year}-${String(slip.period_month).padStart(2, '0')}.pdf"`);
  doc.pipe(res);
  doc.rect(50, 40, 165, 4).fill('#00853F').rect(215, 40, 165, 4).fill('#FDEF42').rect(380, 40, 165, 4).fill('#E31B23');
  doc.fillColor('#000').moveDown(0.5);
  doc.fontSize(12).text('RÉPUBLIQUE DU SÉNÉGAL', 50, 55, { align: 'center' });
  doc.fontSize(8).fillColor('#555').text('Un Peuple – Un But – Une Foi', { align: 'center' });
  doc.moveDown(0.8).fontSize(14).fillColor('#00602d')
    .text(`BULLETIN DE SOLDE — ${MONTHS[slip.period_month - 1].toUpperCase()} ${slip.period_year}`, { align: 'center' });
  doc.fontSize(8).fillColor('#777')
    .text(slip.source === 'simulation' ? 'Simulation SIGRH — document non contractuel'
      : 'Données transmises par la Direction de la Solde — document dématérialisé SIGRH', { align: 'center' });
  doc.moveDown();
  const top = doc.y;
  doc.fontSize(10).fillColor('#000');
  [['Agent', slip.full_name], ['Identifiant SIGRH', slip.sigrh_id], ['Matricule de solde', slip.matricule_solde || '—'],
    ['Fonction', slip.fonction || '—']].forEach(([k, v], i) => doc.text(`${k} : ${v}`, 50, top + i * 15));
  [['Institution', slip.institution_name || '—'], ['Structure', slip.structure_name || '—'],
    ['Corps / hiérarchie', `${slip.corps_name || '—'} / ${slip.hierarchie || '—'}`],
    ['Grade / échelon', `${slip.grade || '—'} / ${slip.echelon || '—'}`]].forEach(([k, v], i) => doc.text(`${k} : ${v}`, 300, top + i * 15, { width: 245 }));
  doc.y = top + 75;
  const row = (label, amount, opts = {}) => {
    const y = doc.y;
    if (opts.fill) doc.rect(50, y - 3, 495, 18).fill(opts.fill).fillColor('#000');
    doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10).text(label, 60, y, { width: 300 })
      .text(amount, 360, y, { width: 175, align: 'right' });
    doc.y = y + 18;
  };
  const d = slip.details || {};
  doc.font('Helvetica-Bold').fillColor('#00602d').text('Éléments de rémunération', 50).fillColor('#000').moveDown(0.3);
  row('Salaire de base', fmt(slip.basic));
  if (d.housing !== undefined) row('Indemnité de logement', fmt(d.housing));
  if (d.transport !== undefined) row('Indemnité de transport', fmt(d.transport));
  if (d.housing === undefined) row('Primes et indemnités', fmt(slip.allowances));
  if (Number(slip.bonuses)) row('Primes exceptionnelles', fmt(slip.bonuses));
  row('BRUT', fmt(slip.gross), { bold: true, fill: '#e8f5ee' });
  doc.moveDown(0.5);
  doc.font('Helvetica-Bold').fillColor('#00602d').text('Retenues', 50).fillColor('#000').moveDown(0.3);
  row('Retenues (pension, cotisations, autres)', fmt(slip.deductions));
  row('Impôt sur le revenu', fmt(slip.tax));
  doc.moveDown();
  row('NET À PAYER', fmt(slip.net), { bold: true, fill: '#FDEF42' });
  doc.moveDown(3).font('Helvetica').fontSize(8).fillColor('#777')
    .text(`Édité le ${new Date().toLocaleString('fr-FR')} — Réf. BUL-${slip.id}`, 50, doc.y, { align: 'center' });
  doc.end();
};
