(function(){
  "use strict";
  const $ = id => document.getElementById(id);

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

  // ---------- state tax + cost-of-living data ----------
  // Single-filer, standard-deduction-only slice of the same 2026 federal/
  // state bracket data used by the Income Calculator tools (kept as a local
  // copy per this site's convention of each tool folder being self-
  // contained — see tools/Finance/IncomeCalculatorSimple/app.js for the
  // full multi-filing-status version). `col` is each state's cost-of-living
  // index (100 = national average), MERIC/C2ER 2025 annual average via
  // https://worldpopulationreview.com/state-rankings/cost-of-living-index-by-state —
  // used only to shift the savings-rate curve below, not the tax math.
  const FEDERAL_BRACKETS_SINGLE = [[0,10],[12400,12],[50400,22],[105700,24],[201775,32],[256225,35],[640600,37]];
  const FEDERAL_STD_DED_SINGLE = 16100;
  const SS_RATE = 0.062, MEDICARE_RATE = 0.0145, ADDL_MEDICARE_RATE = 0.009, ADDL_MEDICARE_THRESHOLD_SINGLE = 200000;
  const SS_WAGE_BASE = 184500;

  const STATES = {
    AL:{name:'Alabama', col:88.6, brackets:[[0,2],[500,4],[3000,5]], stdDed:3000},
    AK:{name:'Alaska', col:124.9, brackets:null, stdDed:0},
    AZ:{name:'Arizona', col:110.7, brackets:[[0,2.5]], stdDed:8350},
    AR:{name:'Arkansas', col:89.6, brackets:[[0,2],[4600,3.9]], stdDed:2470},
    CA:{name:'California', col:142.3, brackets:[[0,1],[11079,2],[26264,4],[41452,6],[57542,8],[72724,9.3],[371479,10.3],[445771,11.3],[742953,12.3],[1000000,13.3]], stdDed:5540},
    CO:{name:'Colorado', col:102.7, brackets:[[0,4.4]], stdDed:16100},
    CT:{name:'Connecticut', col:112.7, brackets:[[0,2],[10000,4.5],[50000,5.5],[100000,6],[200000,6.5],[250000,6.9],[500000,6.99]], stdDed:15000},
    DE:{name:'Delaware', col:101.9, brackets:[[0,0],[2000,2.2],[5000,3.9],[10000,4.8],[20000,5.2],[25000,5.55],[60000,6.6]], stdDed:3250},
    DC:{name:'Washington DC', col:138.8, brackets:[[0,4],[10000,6],[40000,6.5],[60000,8.5],[250000,9.25],[500000,9.75],[1000000,10.75]], stdDed:16100},
    FL:{name:'Florida', col:102.2, brackets:null, stdDed:0},
    GA:{name:'Georgia', col:92.5, brackets:[[0,5.19]], stdDed:12000},
    HI:{name:'Hawaii', col:185.0, brackets:[[0,1.4],[9600,3.2],[14400,5.5],[19200,6.4],[24000,6.8],[36000,7.2],[48000,7.6],[125000,7.9],[175000,8.25],[225000,9],[275000,10],[325000,11]], stdDed:4400},
    ID:{name:'Idaho', col:99.9, brackets:[[0,0],[4811,5.3]], stdDed:16100},
    IL:{name:'Illinois', col:94.7, brackets:[[0,4.95]], stdDed:2925},
    IN:{name:'Indiana', col:91.0, brackets:[[0,2.95]], stdDed:1000},
    IA:{name:'Iowa', col:89.7, brackets:[[0,3.8]], stdDed:16100},
    KS:{name:'Kansas', col:88.8, brackets:[[0,5.2],[23000,5.58]], stdDed:3605},
    KY:{name:'Kentucky', col:92.5, brackets:[[0,3.5]], stdDed:3360},
    LA:{name:'Louisiana', col:92.3, brackets:[[0,3]], stdDed:12875},
    ME:{name:'Maine', col:113.0, brackets:[[0,5.8],[27399,6.75],[64849,7.15]], stdDed:8350},
    MD:{name:'Maryland', col:115.4, brackets:[[0,2],[1000,3],[2000,4],[3000,4.75],[100000,5],[125000,5.25],[150000,5.5],[250000,5.75],[500000,6.25],[1000000,6.5]], stdDed:3350},
    MA:{name:'Massachusetts', col:141.2, brackets:[[0,5],[1083150,9]], stdDed:4400},
    MI:{name:'Michigan', col:90.1, brackets:[[0,4.25]], stdDed:5900},
    MN:{name:'Minnesota', col:94.6, brackets:[[0,5.35],[33310,6.8],[109430,7.85],[203150,9.85]], stdDed:15300},
    MS:{name:'Mississippi', col:87.3, brackets:[[0,0],[10000,4]], stdDed:2300},
    MO:{name:'Missouri', col:89.0, brackets:[[0,0],[1348,2],[2696,2.5],[4044,3],[5392,3.5],[6740,4],[8088,4.5],[9436,4.7]], stdDed:16100},
    MT:{name:'Montana', col:95.5, brackets:[[0,4.7],[47500,5.65]], stdDed:16100},
    NE:{name:'Nebraska', col:92.6, brackets:[[0,2.46],[4130,3.51],[24760,4.55]], stdDed:8850},
    NV:{name:'Nevada', col:100.2, brackets:null, stdDed:0},
    NH:{name:'New Hampshire', col:111.4, brackets:null, stdDed:0},
    NJ:{name:'New Jersey', col:115.1, brackets:[[0,1.4],[20000,1.75],[35000,3.5],[40000,5.53],[75000,6.37],[500000,8.97],[1000000,10.75]], stdDed:1000},
    NM:{name:'New Mexico', col:93.7, brackets:[[0,1.5],[5500,3.2],[16500,4.3],[33500,4.7],[66500,4.9],[210000,5.9]], stdDed:16100},
    NY:{name:'New York', col:125.1, brackets:[[0,3.9],[8500,4.4],[11700,5.15],[13900,5.4],[80650,5.9],[215400,6.85],[1077550,9.65],[5000000,10.3],[25000000,10.9]], stdDed:8000},
    NC:{name:'North Carolina', col:97.8, brackets:[[0,3.99]], stdDed:12750},
    ND:{name:'North Dakota', col:91.4, brackets:[[0,0],[48475,1.95],[244825,2.5]], stdDed:16100},
    OH:{name:'Ohio', col:94.3, brackets:[[0,0],[26050,2.75]], stdDed:2400},
    OK:{name:'Oklahoma', col:86.0, brackets:[[0,0],[3750,2.5],[4900,3.5],[7200,4.5]], stdDed:6350},
    OR:{name:'Oregon', col:111.8, brackets:[[0,4.75],[4550,6.75],[11400,8.75],[125000,9.9]], stdDed:2910},
    PA:{name:'Pennsylvania', col:97.2, brackets:[[0,3.07]], stdDed:0},
    RI:{name:'Rhode Island', col:110.6, brackets:[[0,3.75],[82050,4.75],[186450,5.99]], stdDed:11200},
    SC:{name:'South Carolina', col:94.7, brackets:[[0,0],[3640,3],[18230,6]], stdDed:8350},
    SD:{name:'South Dakota', col:91.9, brackets:null, stdDed:0},
    TN:{name:'Tennessee', col:90.3, brackets:null, stdDed:0},
    TX:{name:'Texas', col:92.1, brackets:null, stdDed:0},
    UT:{name:'Utah', col:102.2, brackets:[[0,4.5]], stdDed:0},
    VT:{name:'Vermont', col:113.6, brackets:[[0,3.35],[49400,6.6],[119700,7.6],[249700,8.75]], stdDed:7650},
    VA:{name:'Virginia', col:100.8, brackets:[[0,2],[3000,3],[5000,5],[17000,5.75]], stdDed:8750},
    WA:{name:'Washington', col:114.1, brackets:null, stdDed:0},
    WV:{name:'West Virginia', col:88.3, brackets:[[0,2.22],[10000,2.96],[25000,3.33],[40000,4.44],[60000,4.82]], stdDed:2000},
    WI:{name:'Wisconsin', col:97.7, brackets:[[0,3.5],[15110,4.4],[51950,5.3],[332720,7.65]], stdDed:13960},
    WY:{name:'Wyoming', col:93.7, brackets:null, stdDed:0}
  };

  function bracketTax(taxableIncome, brackets){
    if (!brackets || taxableIncome <= 0) return 0;
    let tax = 0;
    for (let i = 0; i < brackets.length; i++){
      const threshold = brackets[i][0];
      const rate = brackets[i][1];
      const nextThreshold = (i + 1 < brackets.length) ? brackets[i+1][0] : Infinity;
      if (taxableIncome > threshold){
        tax += (Math.min(taxableIncome, nextThreshold) - threshold) * (rate / 100);
      } else break;
    }
    return tax;
  }

  function populateStateSelect(){
    const sel = $('incomeState');
    const options = ['<option value="US" selected>National average</option>'];
    Object.keys(STATES).sort((a, b) => STATES[a].name.localeCompare(STATES[b].name)).forEach(code => {
      options.push('<option value="' + code + '">' + STATES[code].name + '</option>');
    });
    sel.innerHTML = options.join('');
  }

  // Estimated federal + state income tax and FICA on gross income, single
  // filer, standard deduction only — no credits, no pretax deductions, no
  // local/city taxes. Used only for the "money left over" readout.
  function estimateTax(income, stateCode){
    const fedTaxable = Math.max(0, income - FEDERAL_STD_DED_SINGLE);
    const federalTax = bracketTax(fedTaxable, FEDERAL_BRACKETS_SINGLE);

    const state = STATES[stateCode];
    let stateTax = 0;
    if (state && state.brackets){
      const stateTaxable = Math.max(0, income - state.stdDed);
      stateTax = bracketTax(stateTaxable, state.brackets);
    }

    const ssTaxable = Math.min(income, SS_WAGE_BASE);
    const socialSecurityTax = ssTaxable * SS_RATE;
    const medicareTax = income * MEDICARE_RATE;
    const addlMedicareTax = Math.max(0, income - ADDL_MEDICARE_THRESHOLD_SINGLE) * ADDL_MEDICARE_RATE;
    const ficaTax = socialSecurityTax + medicareTax + addlMedicareTax;

    return federalTax + stateTax + ficaTax;
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

    const annualContribution = perPeriod * periodsPerYear;
    const tax = estimateTax(income, stateCode);
    const leftoverAnnual = income - tax - annualContribution;
    const stateLabel = stateCode === 'US' ? 'national average' : STATES[stateCode].name;
    const householdLabel = 'household of ' + householdSize;
    incomeLeftoverEl.textContent = fmtMoney(leftoverAnnual) + '/yr (' + fmtMoney(leftoverAnnual / 12) + '/mo) left over after an estimated ' +
      fmtMoney(tax) + '/yr in taxes and the contribution above — ' + stateLabel + ', ' + householdLabel + ', single-filer tax estimate.';
  }

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
  populateStateSelect();
  loadSaved();
  // Only updates the slider's own readout/suggestion text — never call
  // applyIncome() here, since that would overwrite a saved (or manually
  // edited) startingBalance/contribution with a recomputed value the user
  // never asked for.
  formatIncomeDisplay();
  renderAll();
})();
