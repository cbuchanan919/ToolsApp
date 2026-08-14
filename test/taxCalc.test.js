'use strict';

// Unit tests for the pure tax-calculation functions — no server involved.
const test = require('node:test');
const assert = require('node:assert/strict');
const { bracketTax, estimateTax } = require('../server/lib/taxCalc');

// Dollar comparisons tolerate a cent of floating-point slop rather than
// requiring exact equality.
function closeTo(actual, expected, tolerance = 0.01, message) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    message || `expected ${actual} to be within ${tolerance} of ${expected}`
  );
}

const FEDERAL_SINGLE = [[0, 10], [12400, 12], [50400, 22], [105700, 24], [201775, 32], [256225, 35], [640600, 37]];

test('bracketTax', async (t) => {
  await t.test('zero taxable income owes nothing, marginal rate is the first bracket', () => {
    const { tax, marginalRate } = bracketTax(0, FEDERAL_SINGLE);
    assert.equal(tax, 0);
    assert.equal(marginalRate, 10);
  });

  await t.test('negative taxable income is treated the same as zero', () => {
    const { tax } = bracketTax(-500, FEDERAL_SINGLE);
    assert.equal(tax, 0);
  });

  await t.test('missing brackets returns zero without throwing', () => {
    const { tax, marginalRate } = bracketTax(50000, null);
    assert.equal(tax, 0);
    assert.equal(marginalRate, 0);
  });

  await t.test('income exactly at a bracket threshold is taxed at the lower rate (boundary is exclusive)', () => {
    // At exactly $12,400 the 12% bracket hasn't started yet — only the
    // first $12,400 at 10% applies. One dollar more should tip into 12%.
    const atThreshold = bracketTax(12400, FEDERAL_SINGLE);
    closeTo(atThreshold.tax, 1240);
    assert.equal(atThreshold.marginalRate, 10);

    const justOver = bracketTax(12401, FEDERAL_SINGLE);
    closeTo(justOver.tax, 1240.12);
    assert.equal(justOver.marginalRate, 12);
  });

  await t.test('income above the top bracket keeps taxing the excess at the top rate', () => {
    const { marginalRate } = bracketTax(1000000, FEDERAL_SINGLE);
    assert.equal(marginalRate, 37);
  });
});

test('estimateTax', async (t) => {
  await t.test('matches hand-verified CA net pay at $65k with 401k + health deductions', () => {
    // Cross-checked against the live UI during the Node migration: the
    // breakdown table showed exactly $47,856 annual net pay for these
    // inputs (CA, single, 5% retirement + $2,400 health on $65k).
    const result = estimateTax({
      income: 65000,
      state: 'CA',
      filingStatus: 'single',
      pretaxRetirement: 3250,
      pretaxHealthHSA: 2400
    });
    closeTo(result.netAnnual, 47855.61);
    closeTo(result.federalTax, 4942, 1);
    closeTo(result.stateTax, 1763.49);
  });

  await t.test('matches hand-verified NJ total tax at the median household income', () => {
    const result = estimateTax({ income: 80610, state: 'NJ' });
    closeTo(result.federalTax, 8904.2);
    closeTo(result.stateTax, 2946.657);
    closeTo(result.ficaTax, 6166.665);
    closeTo(result.totalTax, 18017.522);
    assert.equal(result.stateName, 'New Jersey');
  });

  await t.test('an unrecognized state code falls back to no state tax, not a crash', () => {
    const result = estimateTax({ income: 80610, state: 'ZZ' });
    assert.equal(result.stateTax, 0);
    assert.equal(result.stateName, 'National average');
  });

  await t.test('"US" (national average) applies no state tax', () => {
    const result = estimateTax({ income: 80610, state: 'US' });
    assert.equal(result.stateTax, 0);
    closeTo(result.totalTax, 15070.865);
  });

  await t.test('a no-income-tax state (e.g. Texas) applies no state tax', () => {
    const result = estimateTax({ income: 100000, state: 'TX' });
    assert.equal(result.stateTax, 0);
  });

  await t.test('invalid filingStatus falls back to single rather than throwing', () => {
    const withInvalid = estimateTax({ income: 50000, state: 'US', filingStatus: 'nonsense' });
    const withSingle = estimateTax({ income: 50000, state: 'US', filingStatus: 'single' });
    assert.equal(withInvalid.federalTax, withSingle.federalTax);
  });

  await t.test('the additional Medicare surtax only applies above the filing-status threshold', () => {
    const belowThreshold = estimateTax({ income: 200000, state: 'US' });
    assert.equal(belowThreshold.addlMedicareTax, 0);

    const aboveThreshold = estimateTax({ income: 250000, state: 'US' });
    closeTo(aboveThreshold.addlMedicareTax, (250000 - 200000) * 0.009);
    closeTo(aboveThreshold.totalTax, 66818, 1);
  });

  await t.test('the Social Security wage base caps how much income is taxed for SS, not Medicare', () => {
    const result = estimateTax({ income: 300000, state: 'US', ssWageBase: 184500 });
    closeTo(result.socialSecurityTax, 184500 * 0.062);
    closeTo(result.medicareTax, 300000 * 0.0145);
  });

  await t.test('senior deduction reduces federal taxable income, so it never increases tax owed', () => {
    const withoutSenior = estimateTax({ income: 40000, state: 'US' });
    const withSenior = estimateTax({ income: 40000, state: 'US', seniorDeduction: true });
    assert.ok(withSenior.federalTax <= withoutSenior.federalTax);
  });

  await t.test('flat-rate overrides bypass bracket math entirely', () => {
    const result = estimateTax({ income: 100000, state: 'US', overrideFederalPct: 15, overrideStatePct: 5 });
    closeTo(result.federalTax, 15000);
    closeTo(result.stateTax, 5000);
  });

  await t.test('zero income owes zero of everything', () => {
    const result = estimateTax({ income: 0, state: 'CA' });
    assert.equal(result.totalTax, 0);
    assert.equal(result.netAnnual, 0);
  });

  await t.test('pretax deductions cannot push taxable income below zero', () => {
    const result = estimateTax({ income: 10000, state: 'US', pretaxRetirement: 50000 });
    assert.equal(result.federalTax, 0);
  });
});
