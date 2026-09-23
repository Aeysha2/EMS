import { businessDaysBetween, monthBounds } from './dates.js';

/**
 * Payroll rules. Values are configurable through environment variables so the
 * ministry can align them with the applicable civil-service pay grid.
 * `salary` on an employee is the MONTHLY base salary.
 */
export const PAYROLL_RULES = {
  housingAllowanceRate: Number(process.env.PAY_HOUSING_RATE ?? 0.15), // % of basic
  transportAllowance: Number(process.env.PAY_TRANSPORT ?? 25000), // flat amount
  overtimeMultiplier: Number(process.env.PAY_OVERTIME_MULT ?? 1.25),
  socialSecurityRate: Number(process.env.PAY_SOCIAL_RATE ?? 0.056), // pension / social contribution
  hoursPerDay: 8,
  // Progressive monthly income tax brackets applied to taxable income
  taxBrackets: [
    { upTo: 50000, rate: 0 },
    { upTo: 130000, rate: 0.1 },
    { upTo: 280000, rate: 0.15 },
    { upTo: 530000, rate: 0.2 },
    { upTo: Infinity, rate: 0.3 },
  ],
};

const round = (n) => Math.round(n * 100) / 100;

export const progressiveTax = (taxable, brackets = PAYROLL_RULES.taxBrackets) => {
  let tax = 0;
  let lower = 0;
  for (const { upTo, rate } of brackets) {
    if (taxable <= lower) break;
    const slice = Math.min(taxable, upTo) - lower;
    tax += slice * rate;
    lower = upTo;
  }
  return round(tax);
};

/**
 * Compute a salary slip.
 * @param {object} p
 * @param {number} p.basic            monthly base salary
 * @param {number} p.year, p.month    pay period
 * @param {number} [p.overtimeHours]  overtime hours worked during the period
 * @param {number} [p.unpaidLeaveDays] unpaid leave days during the period
 * @param {number} [p.bonus]          extra bonus / prime
 * @param {number} [p.otherDeductions] advances, loans, …
 */
export const computePayslip = ({
  basic,
  year,
  month,
  overtimeHours = 0,
  unpaidLeaveDays = 0,
  bonus = 0,
  otherDeductions = 0,
}) => {
  const r = PAYROLL_RULES;
  const { start, end } = monthBounds(year, month);
  const workingDays = businessDaysBetween(start, end);
  const dailyRate = workingDays ? basic / workingDays : 0;
  const hourlyRate = dailyRate / r.hoursPerDay;

  const housing = round(basic * r.housingAllowanceRate);
  const transport = round(r.transportAllowance);
  const allowances = round(housing + transport);
  const overtimePay = round(overtimeHours * hourlyRate * r.overtimeMultiplier);
  const bonuses = round(bonus);
  const gross = round(basic + allowances + overtimePay + bonuses);

  const unpaidLeave = round(unpaidLeaveDays * dailyRate);
  const socialSecurity = round((basic - unpaidLeave) * r.socialSecurityRate);
  const deductions = round(unpaidLeave + socialSecurity + otherDeductions);

  // Transport allowance is treated as non-taxable reimbursement
  const taxable = Math.max(0, gross - transport - unpaidLeave - socialSecurity);
  const tax = progressiveTax(taxable);
  const net = round(Math.max(0, gross - deductions - tax));

  return {
    basic: round(basic),
    allowances,
    bonuses,
    overtimePay,
    gross,
    deductions,
    tax,
    net,
    details: {
      workingDays,
      dailyRate: round(dailyRate),
      housing,
      transport,
      overtimeHours: round(overtimeHours),
      unpaidLeaveDays,
      unpaidLeave,
      socialSecurity,
      otherDeductions: round(otherDeductions),
      taxable: round(taxable),
    },
  };
};
