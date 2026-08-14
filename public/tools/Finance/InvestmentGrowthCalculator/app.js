(function(){
  "use strict";
  const $ = id => document.getElementById(id);

  // Projects compound growth of a starting balance + recurring
  // contributions, with an optional income-based suggestion for both.

  // ---------- formatting ----------
  const fmt = (n, decimals=0) => {
    if (!isFinite(n)) n = 0;
    const neg = n < 0;
    const out = Math.abs(n).toLocaleString('en-US', {minimumFractionDigits:decimals, maximumFractionDigits:decimals});
    return (neg ? '-' : '') + out;
  };
  const fmtMoney = (n, decimals=0) => {
    if (!isFinite(n)) n = 0;
    return n < 0 ? '-$' + fmt(Math.abs(n), decimals) : '$' + fmt(n, decimals);
  };
  const fmtShort = (n) => {
    if (!isFinite(n)) n = 0;
    const abs = Math.abs(n);
    if (abs >= 1e6) return (n/1e6).toFixed(1).replace(/\.0$/,'') + 'M';
    if (abs >= 1e3) return (n/1e3).toFixed(0) + 'K';
    return n.toFixed(0);
  };
  const parseNum = (str) => {
    if (typeof str !== 'string') return Number(str) || 0;
    const v = parseFloat(str);
    return isFinite(v) ? v : 0;
  };

  // ---------- elements ----------
  const startingBalanceEl = $('startingBalance'), contributionEl = $('contribution'), contributionLabelEl = $('contributionLabel');
  const freqSelectEl = $('freqSelect'), contribIncreaseEl = $('contribIncrease'), returnRateEl = $('returnRate'), yearsEl = $('years');
  const inflationSwitch = $('inflationSwitch'), inflationLabel = $('inflationLabel'), inflationFields = $('inflationFields'), inflationRateEl = $('inflationRate');
  const realValueCard = $('realValueCard');
  const incomeSliderEl = $('incomeSlider'), incomeValueEl = $('incomeValue'), incomeSuggestionEl = $('incomeSuggestion');
  const incomeStateEl = $('incomeState'), incomeLeftoverEl = $('incomeLeftover');
  const householdSizeEl = $('householdSize'), householdMinusBtn = $('householdMinus'), householdPlusBtn = $('householdPlus');
  const apyNoteEl = $('apyNote');

  const FREQ_UNIT = { '12': 'month', '4': 'quarter', '1': 'year' };
  let inflationOn = false;

  // 2023 Census median household income ($80,610) as the slider's default —
  // "median" rather than "mean" since mean is pulled well above what a
  // typical household actually earns. Starting balance/contribution defaults
  // below are deliberately the output of recommendedContribution(80610) at
  // the default Monthly frequency, so the page loads in a self-consistent
  // state rather than showing stale numbers next to the slider.
  const DEFAULTS = {
    startingBalance: 6000, contribution: 1010, freq: '12', contribIncrease: 0,
    returnRate: 7, years: 20, inflationOn: false, inflationRate: 3, income: 80610, incomeState: 'US',
    householdSize: 1
  };

  // ---------- state + cost-of-living data ----------
  // Fetched once from GET /api/states (server/data/states.js) — no longer
  // hardcoded here or in IncomeCalculatorSimple/app.js, which fetches the
  // same endpoint. `col` (100 = national average) drives the savings-rate
  // curve below, entirely client-side/instant. The actual tax computation
  // (federal + state brackets, FICA) now happens server-side via POST
  // /api/tax-estimate — see updateLeftover() — since it only feeds the
  // secondary "money left over" line, a debounced network call there costs
  // nothing the user would notice, unlike the live rate curve.
  let STATES = {};

  async function loadStates(){
    const res = await fetch('/api/states');
    if (!res.ok) throw new Error('states request failed');
    STATES = await res.json();
  }

  function populateStateSelect(){
    const sel = $('incomeState');
    const options = ['<option value="US" selected>National average</option>'];
    Object.keys(STATES).sort((a, b) => STATES[a].name.localeCompare(STATES[b].name)).forEach(code => {
      options.push('<option value="' + code + '">' + STATES[code].name + '</option>');
    });
    sel.innerHTML = options.join('');
  }

  // Debounced POST /api/tax-estimate for the "money left over" line — the
  // one place in this tool that calls the API live rather than fetching
  // data once. AbortController cancels a stale in-flight request if the
  // user changes the slider/state/household again before it resolves, so a
  // slow earlier response can't overwrite a newer one.
  let leftoverAbort = null;
  let leftoverDebounce = null;

  function updateLeftover(income, stateCode, annualContribution, householdSize){
    clearTimeout(leftoverDebounce);
    leftoverDebounce = setTimeout(() => {
      if (leftoverAbort) leftoverAbort.abort();
      leftoverAbort = new AbortController();
      fetch('/api/tax-estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ income, state: stateCode }),
        signal: leftoverAbort.signal
      })
        .then((res) => { if (!res.ok) throw new Error('tax-estimate failed'); return res.json(); })
        .then((result) => {
          const leftoverAnnual = income - result.totalTax - annualContribution;
          const stateLabel = stateCode === 'US' ? 'national average' : result.stateName;
          incomeLeftoverEl.textContent = fmtMoney(leftoverAnnual) + '/yr (' + fmtMoney(leftoverAnnual / 12) + '/mo) left over after an estimated ' +
            fmtMoney(result.totalTax) + '/yr in taxes and the contribution above — ' + stateLabel + ', household of ' + householdSize + ', single-filer tax estimate.';
        })
        .catch((e) => {
          if (e.name === 'AbortError') return; // superseded by a newer request
          incomeLeftoverEl.textContent = 'Could not estimate taxes right now — check your connection.';
        });
    }, 300);
  }

  // ---------- income-based suggestion ----------
  // Tiered savings-rate rule of thumb: below $30k, essentials eat most of
  // the budget, so the rate stays low; it ramps up to 15% right at the
  // median ($80,610) and up to 20% by $150k. The dollar contribution is
  // then capped near the 2026 401(k) employee contribution limit (~$24k/yr)
  // so it doesn't keep scaling unrealistically for very high incomes.
  const INCOME_LOW = 30000, INCOME_MED = 80610, INCOME_HIGH = 150000;
  const CONTRIB_CAP_MONTHLY = 2000;
  const HOUSEHOLD_MIN = 1, HOUSEHOLD_MAX = 8;
  const roundTo = (n, step) => Math.round(n / step) * step;
  const clampHousehold = (n) => Math.max(HOUSEHOLD_MIN, Math.min(HOUSEHOLD_MAX, Math.round(n) || HOUSEHOLD_MIN));

  // colIndex (100 = national average) and householdSize both shift the same
  // breakpoints, in the same direction: a higher cost of living or a bigger
  // household both mean it takes more raw income to reach the same
  // "essentials are covered" milestone, so the rate ramp starts later.
  // householdSize uses the square-root equivalence scale (see the Household
  // size tooltip) rather than scaling 1:1 per person. The dollar cap stays
  // fixed regardless of either — the 401(k) limit doesn't vary by state or
  // family size.
  function recommendedRatePct(income, colIndex, householdSize){
    const scale = (colIndex / 100) * Math.sqrt(householdSize);
    const low = INCOME_LOW * scale, med = INCOME_MED * scale, high = INCOME_HIGH * scale;
    if (income <= low) return 5;
    if (income <= med) return 5 + (income - low) / (med - low) * (15 - 5);
    if (income <= high) return 15 + (income - med) / (high - med) * (20 - 15);
    return 20;
  }

  function recommendedMonthly(income, colIndex, householdSize){
    const ratePct = recommendedRatePct(income, colIndex, householdSize);
    const uncapped = income * (ratePct / 100) / 12;
    const monthly = Math.min(uncapped, CONTRIB_CAP_MONTHLY);
    return { monthly, ratePct, capped: uncapped > CONTRIB_CAP_MONTHLY };
  }

  const FREQ_ROUND_STEP = { '12': 10, '4': 25, '1': 100 };
  const FREQ_MULTIPLIER = { '12': 1, '4': 3, '1': 12 };

  // Updates the slider's own readout/suggestion/leftover text only — never
  // writes to Starting balance/Contribution. Called on every input change,
  // including ones that don't come from the slider itself (e.g. changing
  // frequency), so the suggestion text never goes stale.
  function formatIncomeDisplay(){
    const income = parseNum(incomeSliderEl.value);
    incomeValueEl.textContent = fmtMoney(income);
    const stateCode = incomeStateEl.value;
    const colIndex = stateCode === 'US' ? 100 : (STATES[stateCode] ? STATES[stateCode].col : 100);
    const householdSize = clampHousehold(parseNum(householdSizeEl.value));
    const { monthly, ratePct, capped } = recommendedMonthly(income, colIndex, householdSize);
    const rateText = (Math.round(ratePct * 10) / 10) + '%' + (capped ? ' (capped)' : '');
    const periodsPerYear = freqSelectEl.value;
    const perPeriod = roundTo(monthly * FREQ_MULTIPLIER[periodsPerYear], FREQ_ROUND_STEP[periodsPerYear]);
    const startingSuggestion = roundTo(monthly * 6, 100);
    incomeSuggestionEl.textContent = rateText + ' savings rate → ' + fmtMoney(perPeriod) + '/' + FREQ_UNIT[periodsPerYear] +
      ' contribution · ' + fmtMoney(startingSuggestion) + ' starting';

    incomeLeftoverEl.textContent = 'Estimating taxes…';
    updateLeftover(income, stateCode, perPeriod * periodsPerYear, householdSize);
  }

  // Unlike formatIncomeDisplay(), this actually overwrites Starting
  // balance/Contribution — only called from the slider/state/household
  // controls themselves, never from editing those two fields directly.
  function applyIncome(){
    formatIncomeDisplay();
    const income = parseNum(incomeSliderEl.value);
    const stateCode = incomeStateEl.value;
    const colIndex = stateCode === 'US' ? 100 : (STATES[stateCode] ? STATES[stateCode].col : 100);
    const householdSize = clampHousehold(parseNum(householdSizeEl.value));
    const { monthly } = recommendedMonthly(income, colIndex, householdSize);
    const periodsPerYear = freqSelectEl.value;
    const perPeriod = monthly * FREQ_MULTIPLIER[periodsPerYear];
    contributionEl.value = roundTo(perPeriod, FREQ_ROUND_STEP[periodsPerYear]);
    startingBalanceEl.value = roundTo(monthly * 6, 100);
    renderAll();
  }

  // ---------- effective APY ----------
  // The "Expected annual return" field is used as a nominal rate (like an
  // APR): divided evenly per period, not compounded on its own. This shows
  // what that nominal rate actually yields over a year once compounding is
  // applied — the same distinction a savings account discloses as APY.
  function updateApyNote(){
    const nominal = parseNum(returnRateEl.value) / 100;
    const periodsPerYear = parseInt(freqSelectEl.value, 10) || 12;
    const apy = (Math.pow(1 + nominal / periodsPerYear, periodsPerYear) - 1) * 100;
    const freqWord = periodsPerYear === 12 ? 'monthly' : periodsPerYear === 4 ? 'quarterly' : 'annual';
    apyNoteEl.textContent = '≈' + (Math.round(apy * 100) / 100) + '% effective annual yield (APY) at ' + freqWord + ' compounding';
  }

  // ---------- simulation ----------
  // Simulates period-by-period (not a closed-form formula) so the
  // year-by-year table is exact: each period adds the contribution then
  // compounds the whole balance, and the contribution itself grows by
  // increasePct once per year, not per period.
  function simulate(){
    const startingBalance = Math.max(0, parseNum(startingBalanceEl.value));
    const baseContribution = Math.max(0, parseNum(contributionEl.value));
    const periodsPerYear = parseInt(freqSelectEl.value, 10) || 12;
    const increasePct = Math.max(0, parseNum(contribIncreaseEl.value)) / 100;
    const annualRate = parseNum(returnRateEl.value) / 100;
    const years = Math.max(1, Math.min(75, Math.round(parseNum(yearsEl.value)) || 1));
    const ratePerPeriod = annualRate / periodsPerYear;

    let balance = startingBalance;
    let contributionThisYear = baseContribution;
    let cumulativeContributed = startingBalance;
    const rows = [];
    const points = [{ year: 0, balance: startingBalance, contribCum: startingBalance }];

    for (let year = 1; year <= years; year++) {
      const yearStart = balance;
      let yearContrib = 0;
      for (let p = 0; p < periodsPerYear; p++) {
        balance += contributionThisYear;
        yearContrib += contributionThisYear;
        balance *= (1 + ratePerPeriod);
      }
      const yearInterest = balance - yearStart - yearContrib;
      cumulativeContributed += yearContrib;
      rows.push({ year, yearStart, yearContrib, yearInterest, yearEnd: balance });
      points.push({ year, balance, contribCum: cumulativeContributed });
      contributionThisYear *= (1 + increasePct);
    }

    const finalBalance = balance;
    const totalContributed = cumulativeContributed;
    const totalGrowth = finalBalance - totalContributed;
    let realValue = null;
    if (inflationOn) {
      const inflationRate = parseNum(inflationRateEl.value) / 100;
      realValue = finalBalance / Math.pow(1 + inflationRate, years);
    }

    return { rows, points, finalBalance, totalContributed, totalGrowth, realValue };
  }

  // ---------- render: summary ----------
  function renderSummary(result){
    $('finalBalance').textContent = fmtMoney(result.finalBalance);
    $('totalContributed').textContent = fmtMoney(result.totalContributed);
    $('totalGrowth').textContent = fmtMoney(result.totalGrowth);
    realValueCard.style.display = inflationOn ? '' : 'none';
    if (inflationOn) $('realValue').textContent = fmtMoney(result.realValue);
  }

  // ---------- render: breakdown table ----------
  function renderBreakdown(result){
    const body = $('breakdownBody');
    body.innerHTML = result.rows.map(r =>
      '<tr><td>' + r.year + '</td><td>' + fmtMoney(r.yearStart) + '</td><td>' + fmtMoney(r.yearContrib) +
      '</td><td class="growth">' + fmtMoney(r.yearInterest) + '</td><td>' + fmtMoney(r.yearEnd) + '</td></tr>'
    ).join('');
  }

  // ---------- render: chart ----------
  // Hand-built SVG (no charting library) — two stacked area fills (total
  // balance, cumulative contributions) sharing one x/y coordinate mapper,
  // so the gap between them visually reads as "growth."
  function renderChart(result){
    const points = result.points;
    const n = points.length - 1;
    const width = 640, height = 260;
    const padLeft = 54, padRight = 12, padTop = 14, padBottom = 26;
    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;
    const baseline = padTop + plotH;
    const maxY = Math.max(1, Math.max.apply(null, points.map(p => p.balance)) * 1.08);

    const xFor = i => padLeft + (n === 0 ? 0 : (i / n) * plotW);
    const yFor = v => padTop + plotH - (v / maxY) * plotH;

    const balancePts = points.map((p, i) => xFor(i) + ',' + yFor(p.balance).toFixed(1));
    const contribPts = points.map((p, i) => xFor(i) + ',' + yFor(p.contribCum).toFixed(1));

    const balanceArea = 'M' + xFor(0) + ',' + baseline + ' L' + balancePts.join(' L') + ' L' + xFor(n) + ',' + baseline + ' Z';
    const contribArea = 'M' + xFor(0) + ',' + baseline + ' L' + contribPts.join(' L') + ' L' + xFor(n) + ',' + baseline + ' Z';

    const gridlines = [0, 0.5, 1].map(frac => {
      const y = padTop + plotH * (1 - frac);
      return '<line class="chart-gridline" x1="' + padLeft + '" y1="' + y + '" x2="' + (width - padRight) + '" y2="' + y + '"/>' +
        '<text class="chart-axis-label" x="' + (padLeft - 8) + '" y="' + (y + 3) + '" text-anchor="end">' + fmtShort(maxY * frac) + '</text>';
    }).join('');

    const midYear = Math.round(n / 2);
    const xLabels = [0, midYear, n].map(i =>
      '<text class="chart-axis-label" x="' + xFor(i) + '" y="' + (height - 6) + '" text-anchor="' + (i === 0 ? 'start' : i === n ? 'end' : 'middle') + '">Year ' + i + '</text>'
    ).join('');

    $('chartWrap').innerHTML =
      '<svg viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="xMidYMid meet">' +
      gridlines +
      '<path class="chart-balance-area" d="' + balanceArea + '"/>' +
      '<path class="chart-contrib-area" d="' + contribArea + '"/>' +
      '<polyline class="chart-balance-line" points="' + balancePts.join(' ') + '"/>' +
      '<polyline class="chart-contrib-line" points="' + contribPts.join(' ') + '"/>' +
      xLabels +
      '</svg>';
  }

  function renderAll(){
    const result = simulate();
    renderSummary(result);
    renderBreakdown(result);
    renderChart(result);
    updateApyNote();
  }

  // ---------- events ----------
  [startingBalanceEl, contributionEl, contribIncreaseEl, returnRateEl, yearsEl, inflationRateEl].forEach(el =>
    el.addEventListener('input', renderAll)
  );
  // Tracks freqSelectEl's value from before the most recent change, so the
  // Contribution field can be rescaled to the new period instead of being
  // silently relabeled — e.g. "$500/month" becoming "$500/year" would be a
  // ~12x understatement, not just a label swap. Kept in sync wherever
  // freqSelectEl.value is set programmatically (reset, load).
  let previousFreq = DEFAULTS.freq;
  freqSelectEl.addEventListener('change', () => {
    const oldAnnual = parseNum(contributionEl.value) * parseInt(previousFreq, 10);
    const newPeriods = parseInt(freqSelectEl.value, 10);
    contributionEl.value = roundTo(oldAnnual / newPeriods, FREQ_ROUND_STEP[freqSelectEl.value]);
    previousFreq = freqSelectEl.value;
    contributionLabelEl.textContent = 'Contribution / ' + FREQ_UNIT[freqSelectEl.value];
    formatIncomeDisplay();
    renderAll();
  });
  incomeSliderEl.addEventListener('input', applyIncome);
  incomeStateEl.addEventListener('change', applyIncome);
  householdSizeEl.addEventListener('input', () => {
    householdSizeEl.value = clampHousehold(parseNum(householdSizeEl.value));
    applyIncome();
  });
  householdMinusBtn.addEventListener('click', () => {
    householdSizeEl.value = clampHousehold(parseNum(householdSizeEl.value) - 1);
    applyIncome();
  });
  householdPlusBtn.addEventListener('click', () => {
    householdSizeEl.value = clampHousehold(parseNum(householdSizeEl.value) + 1);
    applyIncome();
  });

  function toggleInflation(){
    inflationOn = !inflationOn;
    inflationSwitch.classList.toggle('on', inflationOn);
    inflationFields.style.display = inflationOn ? '' : 'none';
    renderAll();
  }
  inflationSwitch.addEventListener('click', toggleInflation);
  inflationLabel.addEventListener('click', toggleInflation);

  // ---------- save / reset ----------
  const saveBtn = $('saveBtn'), resetBtn = $('resetBtn'), saveNote = $('saveNote');
  const STORAGE_KEY = 'growthLedgerSettings_v1';

  saveBtn.addEventListener('click', () => {
    const data = {
      startingBalance: startingBalanceEl.value, contribution: contributionEl.value, freq: freqSelectEl.value,
      contribIncrease: contribIncreaseEl.value, returnRate: returnRateEl.value, years: yearsEl.value,
      inflationOn, inflationRate: inflationRateEl.value, income: incomeSliderEl.value, incomeState: incomeStateEl.value,
      householdSize: householdSizeEl.value
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      saveNote.textContent = 'Saved to this browser at ' + new Date().toLocaleTimeString();
    } catch (e) {
      saveNote.textContent = 'Could not save (storage unavailable).';
    }
  });

  resetBtn.addEventListener('click', () => {
    freqSelectEl.value = DEFAULTS.freq;
    previousFreq = DEFAULTS.freq;
    contributionLabelEl.textContent = 'Contribution / ' + FREQ_UNIT[DEFAULTS.freq];
    contribIncreaseEl.value = DEFAULTS.contribIncrease;
    returnRateEl.value = DEFAULTS.returnRate;
    yearsEl.value = DEFAULTS.years;
    inflationOn = DEFAULTS.inflationOn;
    inflationSwitch.classList.toggle('on', inflationOn);
    inflationFields.style.display = inflationOn ? '' : 'none';
    inflationRateEl.value = DEFAULTS.inflationRate;
    incomeSliderEl.value = DEFAULTS.income;
    incomeStateEl.value = DEFAULTS.incomeState;
    householdSizeEl.value = DEFAULTS.householdSize;
    applyIncome(); // also sets startingBalance/contribution to match the income default, and calls renderAll()
    saveNote.textContent = 'Reset to defaults (not saved).';
  });

  function loadSaved(){
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d.startingBalance !== undefined) startingBalanceEl.value = d.startingBalance;
      if (d.contribution !== undefined) contributionEl.value = d.contribution;
      if (d.freq !== undefined) freqSelectEl.value = d.freq;
      previousFreq = freqSelectEl.value;
      contributionLabelEl.textContent = 'Contribution / ' + FREQ_UNIT[freqSelectEl.value];
      if (d.contribIncrease !== undefined) contribIncreaseEl.value = d.contribIncrease;
      if (d.returnRate !== undefined) returnRateEl.value = d.returnRate;
      if (d.years !== undefined) yearsEl.value = d.years;
      if (d.inflationOn) { inflationOn = true; inflationSwitch.classList.add('on'); inflationFields.style.display = ''; }
      if (d.inflationRate !== undefined) inflationRateEl.value = d.inflationRate;
      if (d.income !== undefined) incomeSliderEl.value = d.income;
      if (d.incomeState !== undefined) incomeStateEl.value = d.incomeState;
      if (d.householdSize !== undefined) householdSizeEl.value = d.householdSize;
      saveNote.textContent = 'Loaded saved settings from this browser.';
    } catch (e) { /* ignore */ }
  }

  // ---------- init ----------
  // The compound-interest simulation itself doesn't depend on fetched data
  // (startingBalance/contribution defaults are already self-consistent —
  // see the DEFAULTS comment above), so it renders immediately. Only the
  // income-row controls wait on the states fetch, since the state dropdown
  // has nothing to select from until then.
  renderAll();
  incomeSliderEl.disabled = true;
  incomeStateEl.disabled = true;
  householdSizeEl.disabled = true;
  householdMinusBtn.disabled = true;
  householdPlusBtn.disabled = true;
  incomeSuggestionEl.textContent = 'Loading income data…';

  loadStates().then(() => {
    incomeSliderEl.disabled = false;
    incomeStateEl.disabled = false;
    householdSizeEl.disabled = false;
    householdMinusBtn.disabled = false;
    householdPlusBtn.disabled = false;
    populateStateSelect();
    loadSaved();
    // Only updates the slider's own readout/suggestion text — never call
    // applyIncome() here, since that would overwrite a saved (or manually
    // edited) startingBalance/contribution with a recomputed value the user
    // never asked for.
    formatIncomeDisplay();
  }).catch(() => {
    incomeSuggestionEl.textContent = 'Could not load income data — check your connection and reload.';
  });
})();
