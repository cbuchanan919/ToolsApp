'use strict';

const FEDERAL = require('../data/federal');
const STATES = require('../data/states');

// Same progressive-bracket walk used client-side in both Finance tools.
function bracketTax(taxableIncome, brackets) {
  if (!brackets || taxableIncome <= 0) return { tax: 0, marginalRate: brackets ? brackets[0][1] : 0 };
  let tax = 0;
  let marginalRate = brackets[0][1];
  for (let i = 0; i < brackets.length; i++) {
    const [threshold, rate] = brackets[i];
    const nextThreshold = i + 1 < brackets.length ? brackets[i + 1][0] : Infinity;
    if (taxableIncome > threshold) {
      tax += (Math.min(taxableIncome, nextThreshold) - threshold) * (rate / 100);
      marginalRate = rate;
    } else {
      break;
    }
  }
  return { tax, marginalRate };
}

// General-purpose estimate: federal + state + FICA on gross income.
// filingStatus: 'single' | 'mfj' | 'hoh' (default 'single', hoh's state tax
// approximated via single brackets — same simplification the client-side
// version has always used, since most states don't publish a separate HoH
// table). All deduction/override params are optional and default to 0/off.
function estimateTax(params) {
  const income = Math.max(0, Number(params.income) || 0);
  const filingStatus = ['single', 'mfj', 'hoh'].includes(params.filingStatus) ? params.filingStatus : 'single';
  const stateCode = params.state || 'US';
  const seniorDeduction = !!params.seniorDeduction;
  const pretaxRetirement = Math.max(0, Number(params.pretaxRetirement) || 0);
  const pretaxHealthHSA = Math.max(0, Number(params.pretaxHealthHSA) || 0);
  const ssWageBase = Number(params.ssWageBase) > 0 ? Number(params.ssWageBase) : 184500;
  const overrideFederalPct = params.overrideFederalPct != null ? Number(params.overrideFederalPct) : null;
  const overrideStatePct = params.overrideStatePct != null ? Number(params.overrideStatePct) : null;

  const state = STATES[stateCode];
  const stateKey = filingStatus === 'mfj' ? 'mfj' : 'single'; // hoh approximated via single, same as federal-less state tables

  let federalTax, federalMarginal, stateTax = 0, stateMarginal = 0;

  if (overrideFederalPct != null || overrideStatePct != null) {
    const fedPct = (overrideFederalPct || 0) / 100;
    const statePct = (overrideStatePct || 0) / 100;
    federalTax = income * Math.min(Math.max(fedPct, 0), 1);
    federalMarginal = (overrideFederalPct || 0);
    stateTax = income * Math.min(Math.max(statePct, 0), 1);
    stateMarginal = (overrideStatePct || 0);
  } else {
    const stdDed = FEDERAL.stdDed[filingStatus] + (seniorDeduction ? FEDERAL.seniorDed[filingStatus] : 0);
    const fedTaxable = Math.max(0, income - pretaxRetirement - pretaxHealthHSA - stdDed);
    const fedResult = bracketTax(fedTaxable, FEDERAL.brackets[filingStatus]);
    federalTax = fedResult.tax;
    federalMarginal = fedResult.marginalRate;

    if (state && state.type === 'brackets') {
      const stateStdDed = (state.stdDed && state.stdDed[stateKey]) || 0;
      const stateTaxable = Math.max(0, income - pretaxRetirement - pretaxHealthHSA - stateStdDed);
      const stateResult = bracketTax(stateTaxable, state.brackets[stateKey]);
      stateTax = stateResult.tax;
      stateMarginal = stateResult.marginalRate;
    }
  }

  const ficaBase = Math.max(0, income - pretaxHealthHSA); // pretax retirement (401k) doesn't reduce FICA wages
  const ssTaxable = Math.min(ficaBase, ssWageBase);
  const socialSecurityTax = ssTaxable * FEDERAL.fica.ssRate;
  const medicareTax = ficaBase * FEDERAL.fica.medicareRate;
  const addlThreshold = FEDERAL.fica.addlMedicareThreshold[filingStatus];
  const addlMedicareTax = Math.max(0, ficaBase - addlThreshold) * FEDERAL.fica.addlMedicareRate;
  const ficaTax = socialSecurityTax + medicareTax + addlMedicareTax;

  const totalTax = federalTax + stateTax + ficaTax;
  const netAnnual = income - totalTax - pretaxRetirement - pretaxHealthHSA;
  const effectiveRate = income > 0 ? (totalTax / income) * 100 : 0;

  return {
    federalTax, federalMarginal, stateTax, stateMarginal,
    stateName: state ? state.name : 'National average',
    socialSecurityTax, medicareTax, addlMedicareTax, ficaTax,
    totalTax, netAnnual, effectiveRate
  };
}

module.exports = { bracketTax, estimateTax };
