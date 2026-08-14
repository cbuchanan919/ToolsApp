(function(){
  "use strict";
  const $ = id => document.getElementById(id);

  // Converts between salary and hourly pay, with a full tax breakdown,
  // an offer comparator, and a PTO value calculator built on top.

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
  const parseNum = (str) => {
    if (typeof str !== 'string') return Number(str) || 0;
    const cleaned = str.replace(/[^0-9.\-]/g, '');
    const v = parseFloat(cleaned);
    return isFinite(v) ? v : 0;
  };
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

  // ---------- federal + state tax reference data ----------
  // Fetched once from GET /api/federal and GET /api/states (server/data/) —
  // no longer hardcoded here. Was previously duplicated verbatim in
  // tools/Finance/InvestmentGrowthCalculator/app.js; both now read from the
  // same server-side source of truth. All computation below still runs
  // fully locally/synchronously against the fetched data — only the data
  // itself made a network trip, once, on page load.
  let FEDERAL_BRACKETS, FEDERAL_STD_DED, SENIOR_DED;
  let SS_RATE, MEDICARE_RATE, ADDL_MEDICARE_RATE, ADDL_MEDICARE_THRESHOLD;
  let STATE_TAX = {};
  const NONE = { type: 'none' };

  async function loadReferenceData(){
    const [federalRes, statesRes] = await Promise.all([fetch('/api/federal'), fetch('/api/states')]);
    if (!federalRes.ok || !statesRes.ok) throw new Error('reference data request failed');
    const federal = await federalRes.json();
    const states = await statesRes.json();

    FEDERAL_BRACKETS = federal.brackets;
    FEDERAL_STD_DED = federal.stdDed;
    SENIOR_DED = federal.seniorDed;
    SS_RATE = federal.fica.ssRate;
    MEDICARE_RATE = federal.fica.medicareRate;
    ADDL_MEDICARE_RATE = federal.fica.addlMedicareRate;
    ADDL_MEDICARE_THRESHOLD = federal.fica.addlMedicareThreshold;
    STATE_TAX = states;
  }

  // ---------- progressive bracket tax function ----------
  // Walks the bracket table applying each tier's rate only to the income
  // that falls within it, stopping once taxableIncome is exhausted.
  function bracketTax(taxableIncome, brackets){
    if (taxableIncome <= 0) return { tax: 0, marginalRate: 0 };
    let tax = 0, marginalRate = brackets[0][1];
    for (let i = 0; i < brackets.length; i++){
      const threshold = brackets[i][0];
      const rate = brackets[i][1];
      const nextThreshold = (i + 1 < brackets.length) ? brackets[i+1][0] : Infinity;
      if (taxableIncome > threshold){
        const band = Math.min(taxableIncome, nextThreshold) - threshold;
        tax += band * (rate/100);
        marginalRate = rate;
      } else break;
    }
    return { tax, marginalRate };
  }

  // Groups states into three <optgroup>s by tax structure (none/flat/
  // progressive) rather than one flat alphabetical list.
  function populateStateSelect(){
    const sel = $('stateSelect');
    const groups = { none: [], flat: [], bracket: [] };
    Object.keys(STATE_TAX).sort((a,b) => STATE_TAX[a].name.localeCompare(STATE_TAX[b].name)).forEach(code => {
      const s = STATE_TAX[code];
      if (s.type === 'none') groups.none.push(code);
      else if (s.brackets.single.length === 1) groups.flat.push(code);
      else groups.bracket.push(code);
    });
    const mkGroup = (label, codes) => {
      if (!codes.length) return '';
      return `<optgroup label="${label}">` + codes.map(c => `<option value="${c}">${STATE_TAX[c].name}</option>`).join('') + `</optgroup>`;
    };
    sel.innerHTML = mkGroup('No income tax', groups.none) + mkGroup('Flat-rate states', groups.flat) + mkGroup('Progressive-bracket states', groups.bracket);
    sel.value = 'CA';
  }

  // ---------- schedule & core state ----------
  const DEFAULTS = { salary: 65000, hoursPerWeek: 40, daysPerWeek: 5, weeksPerYear: 52 };
  let annualSalary = DEFAULTS.salary; // single source of truth, full precision
  let lastEdited = 'salary';

  const salaryInput = $('salaryInput');
  const hourlyInput = $('hourlyInput');
  const beam = $('beam');
  const hoursPerWeekEl = $('hoursPerWeek');
  const daysPerWeekEl = $('daysPerWeek');
  const weeksPerYearEl = $('weeksPerYear');

  function schedule(){
    return {
      hoursPerWeek: clamp(parseNum(hoursPerWeekEl.value) || 40, 1, 168),
      daysPerWeek: clamp(parseNum(daysPerWeekEl.value) || 5, 1, 7),
      weeksPerYear: clamp(parseNum(weeksPerYearEl.value) || 52, 1, 52)
    };
  }
  function annualFromHourly(hourly, sch){ return hourly * sch.hoursPerWeek * sch.weeksPerYear; }
  function hourlyFromAnnual(annual, sch){ const t = sch.hoursPerWeek * sch.weeksPerYear; return t > 0 ? annual / t : 0; }

  function pulseBeam(){
    beam.classList.add('pulse');
    clearTimeout(pulseBeam._t);
    pulseBeam._t = setTimeout(()=> beam.classList.remove('pulse'), 320);
  }

  function refreshDisplays(){
    const sch = schedule();
    // Skip whichever field the user is actively typing in — reformatting it
    // mid-keystroke (e.g. forcing 2 decimal places on hourly) jumps the
    // cursor and fights the user's typing. It still gets reformatted on blur.
    if (document.activeElement !== salaryInput){
      salaryInput.value = fmt(Math.max(0, annualSalary), 0);
    }
    if (document.activeElement !== hourlyInput){
      hourlyInput.value = fmt(Math.max(0, hourlyFromAnnual(annualSalary, sch)), 2);
    }
  }

  salaryInput.addEventListener('input', () => {
    lastEdited = 'salary';
    annualSalary = Math.max(0, parseNum(salaryInput.value));
    pulseBeam();
    renderAll();
  });
  hourlyInput.addEventListener('input', () => {
    lastEdited = 'hourly';
    const sch = schedule();
    annualSalary = Math.max(0, annualFromHourly(parseNum(hourlyInput.value), sch));
    pulseBeam();
    renderAll();
  });
  salaryInput.addEventListener('blur', refreshDisplays);
  hourlyInput.addEventListener('blur', refreshDisplays);
  [hoursPerWeekEl, daysPerWeekEl, weeksPerYearEl].forEach(el => el.addEventListener('input', () => { pulseBeam(); renderAll(); }));

  // ---------- filing / state ----------
  const filingStatusEl = $('filingStatus');
  const stateSelectEl = $('stateSelect');
  filingStatusEl.addEventListener('change', renderAll);
  stateSelectEl.addEventListener('change', renderAll);

  let seniorOn = false;
  const seniorSwitch = $('seniorSwitch'), seniorLabel = $('seniorLabel');
  function toggleSenior(){ seniorOn = !seniorOn; seniorSwitch.classList.toggle('on', seniorOn); renderAll(); }
  seniorSwitch.addEventListener('click', toggleSenior);
  seniorLabel.addEventListener('click', toggleSenior);

  // ---------- deductions ----------
  const dedInputs = ['retPct','healthAnnual','hsaAnnual','otherAnnual','ssWageBase','fedOverridePct','stateOverridePct'];
  dedInputs.forEach(id => $(id).addEventListener('input', renderAll));

  let overrideOn = false;
  const overrideSwitch = $('overrideSwitch'), overrideLabel = $('overrideLabel'), overrideFields = $('overrideFields');
  function toggleOverride(){
    overrideOn = !overrideOn;
    overrideSwitch.classList.toggle('on', overrideOn);
    overrideFields.style.display = overrideOn ? '' : 'none';
    renderAll();
  }
  overrideSwitch.addEventListener('click', toggleOverride);
  overrideLabel.addEventListener('click', toggleOverride);

  // ---------- overtime ----------
  let otOn = false, otIncludeOn = false;
  const otSwitch = $('otSwitch'), otLabel = $('otLabel'), otFields = $('otFields');
  const otIncludeSwitch = $('otIncludeSwitch'), otIncludeLabel = $('otIncludeLabel');
  function toggleOt(){
    otOn = !otOn;
    otSwitch.classList.toggle('on', otOn);
    otFields.style.display = otOn ? '' : 'none';
    renderAll();
  }
  function toggleOtInclude(){
    otIncludeOn = !otIncludeOn;
    otIncludeSwitch.classList.toggle('on', otIncludeOn);
    renderAll();
  }
  otSwitch.addEventListener('click', toggleOt);
  otLabel.addEventListener('click', toggleOt);
  otIncludeSwitch.addEventListener('click', toggleOtInclude);
  otIncludeLabel.addEventListener('click', toggleOtInclude);
  ['otHours','otMultiplier'].forEach(id => $(id).addEventListener('input', renderAll));

  // Extra annual pay from OT hours at the configured multiplier, on top of
  // (not instead of) the base salary.
  function overtimeExtraAnnual(sch, hourlyRate){
    if (!otOn) return 0;
    const otHours = parseNum($('otHours').value);
    const mult = parseNum($('otMultiplier').value);
    const otRate = hourlyRate * mult;
    return otRate * otHours * sch.weeksPerYear;
  }

  // ---------- core tax computation ----------
  // Pretax retirement/health/HSA reduce taxable income for federal + state
  // (retirement doesn't reduce the FICA base, health/HSA does), then
  // progressive brackets apply — or, in override mode, flat percentages
  // bypass the brackets entirely.
  function computeTaxes(grossAnnual){
    const filingStatus = filingStatusEl.value;
    const stateCode = stateSelectEl.value;
    const stateInfo = STATE_TAX[stateCode] || NONE;

    const retPct = parseNum($('retPct').value) / 100;
    const healthAnnual = Math.max(0, parseNum($('healthAnnual').value));
    const hsaAnnual = Math.max(0, parseNum($('hsaAnnual').value));
    const otherAnnual = Math.max(0, parseNum($('otherAnnual').value));

    const pretaxRetirement = grossAnnual * clamp(retPct, 0, 1);
    const pretaxHealthHSA = healthAnnual + hsaAnnual;

    let federalTax, federalMarginal;
    let stateTax = 0, stateMarginal = 0, stateName = stateInfo.name || '—';

    if (overrideOn){
      const fedPct = parseNum($('fedOverridePct').value) / 100;
      const statePct = parseNum($('stateOverridePct').value) / 100;
      federalTax = Math.max(0, grossAnnual) * clamp(fedPct, 0, 1);
      federalMarginal = fedPct * 100;
      stateTax = Math.max(0, grossAnnual) * clamp(statePct, 0, 1);
      stateMarginal = statePct * 100;
    } else {
      const stdDed = FEDERAL_STD_DED[filingStatus] + (seniorOn ? SENIOR_DED[filingStatus] : 0);
      const fedTaxableBase = Math.max(0, grossAnnual - pretaxRetirement - pretaxHealthHSA - stdDed);
      const fedResult = bracketTax(fedTaxableBase, FEDERAL_BRACKETS[filingStatus]);
      federalTax = fedResult.tax;
      federalMarginal = fedResult.marginalRate;

      if (stateInfo.type === 'none'){
        stateTax = 0; stateMarginal = 0;
      } else {
        const key = filingStatus === 'mfj' ? 'mfj' : 'single'; // hoh approximated via single
        const stateStdDed = (stateInfo.stdDed && stateInfo.stdDed[key]) || 0;
        const stateTaxableBase = Math.max(0, grossAnnual - pretaxRetirement - pretaxHealthHSA - stateStdDed);
        const stateResult = bracketTax(stateTaxableBase, stateInfo.brackets[key]);
        stateTax = stateResult.tax;
        stateMarginal = stateResult.marginalRate;
      }
    }

    const ssWageBase = Math.max(0, parseNum($('ssWageBase').value)) || 184500;
    const ficaBase = Math.max(0, grossAnnual - pretaxHealthHSA); // 401k doesn't reduce FICA wages
    const ssTaxable = Math.min(ficaBase, ssWageBase);
    const socialSecurityTax = ssTaxable * SS_RATE;
    const medicareTax = ficaBase * MEDICARE_RATE;
    const addlThreshold = ADDL_MEDICARE_THRESHOLD[filingStatus];
    const addlMedicareTax = Math.max(0, ficaBase - addlThreshold) * ADDL_MEDICARE_RATE;
    const ficaTax = socialSecurityTax + medicareTax + addlMedicareTax;

    const totalTax = federalTax + stateTax + ficaTax;
    const netAnnual = grossAnnual - totalTax - pretaxRetirement - pretaxHealthHSA - otherAnnual;
    const effectiveRate = grossAnnual > 0 ? (totalTax / grossAnnual) * 100 : 0;

    return {
      federalTax, federalMarginal, stateTax, stateMarginal, stateName,
      socialSecurityTax, medicareTax, addlMedicareTax, ficaTax,
      totalTax, netAnnual, effectiveRate,
      totalDeductionsNonTax: pretaxRetirement + pretaxHealthHSA + otherAnnual
    };
  }

  // Base salary plus OT, but only if OT is on AND explicitly folded into
  // totals — OT can be modeled and shown without affecting the headline
  // numbers.
  function currentGrossAnnual(){
    const sch = schedule();
    const hourlyRate = hourlyFromAnnual(annualSalary, sch);
    const extraOt = (otOn && otIncludeOn) ? overtimeExtraAnnual(sch, hourlyRate) : 0;
    return annualSalary + extraOt;
  }

  // ---------- breakdown table ----------
  const breakdownBody = $('breakdownBody');
  const taxDetail = $('taxDetail');
  const warnBanner = $('warnBanner');

  function renderBreakdown(){
    const sch = schedule();
    const grossAnnual = currentGrossAnnual();
    const hourlyGross = hourlyFromAnnual(annualSalary, sch); // base hourly rate (pre-OT)
    const t = computeTaxes(grossAnnual);
    const netAnnual = t.netAnnual;

    const dailyHours = sch.hoursPerWeek / sch.daysPerWeek;
    const periods = [
      { name: 'Hourly', gross: hourlyGross, net: hourlyGross * (grossAnnual > 0 ? netAnnual/grossAnnual : 0), decimals:2 },
      { name: 'Daily', gross: hourlyGross*dailyHours, net: netAnnual/(52*sch.daysPerWeek) || 0 },
      { name: 'Weekly', gross: grossAnnual/52, net: netAnnual/52 || 0 },
      { name: 'Biweekly', gross: grossAnnual/26, net: netAnnual/26 || 0 },
      { name: 'Semi‑monthly', gross: grossAnnual/24, net: netAnnual/24 || 0 },
      { name: 'Monthly', gross: grossAnnual/12, net: netAnnual/12 || 0 },
      { name: 'Annual', gross: grossAnnual, net: netAnnual, highlight:true }
    ];

    breakdownBody.innerHTML = periods.map(p => `
      <tr${p.highlight?' class="highlight"':''}>
        <td>${p.name}</td>
        <td class="gross">${fmtMoney(p.gross, p.decimals||0)}</td>
        <td class="net${p.net<0?' negative':''}">${fmtMoney(p.net, p.decimals||0)}</td>
      </tr>
    `).join('');

    taxDetail.innerHTML = `
      <div class="trow"><span class="k">Federal income tax (marginal ${fmt(t.federalMarginal,1)}%)</span><span class="v">${fmtMoney(t.federalTax,0)}</span></div>
      <div class="trow"><span class="k">State income tax — ${t.stateName} (marginal ${fmt(t.stateMarginal,1)}%)</span><span class="v">${fmtMoney(t.stateTax,0)}</span></div>
      <div class="trow"><span class="k">Social Security (6.2%, capped)</span><span class="v">${fmtMoney(t.socialSecurityTax,0)}</span></div>
      <div class="trow"><span class="k">Medicare (1.45%${t.addlMedicareTax>0?' + 0.9% additional':''})</span><span class="v">${fmtMoney(t.medicareTax + t.addlMedicareTax,0)}</span></div>
      <div class="trow total"><span class="k">Total tax</span><span class="v">${fmtMoney(t.totalTax,0)}</span></div>
      <div class="trow"><span class="k">Effective tax rate</span><span class="v">${fmt(t.effectiveRate,1)}%</span></div>
      <div class="trow keep"><span class="k">You keep (after tax + all deductions)</span><span class="v">${fmt(grossAnnual>0?100-((grossAnnual-netAnnual)/grossAnnual*100):100,1)}%</span></div>
    `;

    if (netAnnual < 0){
      warnBanner.style.display = '';
      warnBanner.textContent = 'Your combined taxes and deductions currently exceed gross pay — net figures above are negative. Check your deduction percentages and overrides.';
    } else {
      warnBanner.style.display = 'none';
    }
  }

  // ---------- overtime panel ----------
  function renderOvertime(){
    if (!otOn) return;
    const sch = schedule();
    const hourly = hourlyFromAnnual(annualSalary, sch);
    const otHours = parseNum($('otHours').value);
    const mult = parseNum($('otMultiplier').value);
    const otRate = hourly * mult;
    const extraWeekly = otRate * otHours;
    const extraAnnual = extraWeekly * sch.weeksPerYear;
    $('otWeekly').textContent = fmtMoney(extraWeekly, 0);
    $('otAnnual').textContent = fmtMoney(extraAnnual, 0);
    $('otNewAnnual').textContent = fmtMoney(annualSalary + extraAnnual, 0);
  }

  // ---------- comparator ----------
  const cmpAType = $('cmpAType'), cmpAVal = $('cmpAVal');
  const cmpBType = $('cmpBType'), cmpBVal = $('cmpBVal');
  const cmpResult = $('cmpResult'), cmpBig = $('cmpBig'), cmpSub = $('cmpSub'), cmpSub2 = $('cmpSub2');
  [cmpAType,cmpAVal,cmpBType,cmpBVal].forEach(el => el.addEventListener('input', renderComparator));
  [cmpAType,cmpBType].forEach(el => el.addEventListener('change', renderComparator));

  function toAnnual(type, val, sch){ return type === 'hourly' ? annualFromHourly(Math.max(0,val), sch) : Math.max(0,val); }

  // Both offers are taxed through the same filing status/state/deductions
  // configured above (computeTaxes reads those globals) — this compares
  // two salaries for one person, not two independently-configured people.
  function renderComparator(){
    const sch = schedule();
    const aAnnual = toAnnual(cmpAType.value, parseNum(cmpAVal.value), sch);
    const bAnnual = toAnnual(cmpBType.value, parseNum(cmpBVal.value), sch);
    const diff = bAnnual - aAnnual;
    const pct = aAnnual !== 0 ? (diff/aAnnual)*100 : 0;
    const positive = diff >= 0;
    cmpResult.classList.toggle('negative', !positive);
    cmpBig.textContent = (positive?'+':'−') + fmtMoney(Math.abs(diff),0);
    cmpSub.textContent = `Offer B pays ${fmt(Math.abs(pct),1)}% ${positive?'more':'less'} annually than Offer A ` +
      `(${fmtMoney(aAnnual,0)} vs ${fmtMoney(bAnnual,0)} / yr — ` +
      `${fmtMoney(hourlyFromAnnual(aAnnual,sch),2)}/hr vs ${fmtMoney(hourlyFromAnnual(bAnnual,sch),2)}/hr).`;

    const taxA = computeTaxes(aAnnual);
    const taxB = computeTaxes(bAnnual);
    const netDiff = taxB.netAnnual - taxA.netAnnual;
    cmpSub2.textContent = `After estimated taxes & deductions: ${fmtMoney(taxA.netAnnual,0)}/yr net vs ${fmtMoney(taxB.netAnnual,0)}/yr net — a difference of ${netDiff>=0?'+':'-'}${fmtMoney(Math.abs(netDiff),0)}/yr take‑home.`;
  }

  // ---------- PTO ----------
  const ptoDaysEl = $('ptoDays');
  ptoDaysEl.addEventListener('input', renderPTO);

  function renderPTO(){
    const sch = schedule();
    const grossAnnual = currentGrossAnnual();
    const t = computeTaxes(grossAnnual);
    const totalWorkDays = sch.daysPerWeek * 52;
    const dayValueGross = totalWorkDays > 0 ? grossAnnual/totalWorkDays : 0;
    const dayValueNet = totalWorkDays > 0 ? t.netAnnual/totalWorkDays : 0;
    const ptoDays = parseNum(ptoDaysEl.value);
    $('dayValue').textContent = fmtMoney(dayValueGross,0);
    $('ptoValue').textContent = fmtMoney(dayValueGross*ptoDays,0);
    $('unpaidCost').textContent = fmtMoney(dayValueNet,0);
  }

  // ---------- save / reset ----------
  const saveBtn = $('saveBtn'), resetBtn = $('resetBtn'), saveNote = $('saveNote');
  const STORAGE_KEY = 'payLedgerSettings_v2';

  saveBtn.addEventListener('click', () => {
    const data = {
      annualSalary,
      hoursPerWeek: hoursPerWeekEl.value, daysPerWeek: daysPerWeekEl.value, weeksPerYear: weeksPerYearEl.value,
      filingStatus: filingStatusEl.value, state: stateSelectEl.value, seniorOn,
      retPct: $('retPct').value, healthAnnual: $('healthAnnual').value, hsaAnnual: $('hsaAnnual').value,
      otherAnnual: $('otherAnnual').value, ssWageBase: $('ssWageBase').value,
      overrideOn, fedOverridePct: $('fedOverridePct').value, stateOverridePct: $('stateOverridePct').value,
      otOn, otIncludeOn, otHours: $('otHours').value, otMultiplier: $('otMultiplier').value,
      ptoDays: ptoDaysEl.value
    };
    try{
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      saveNote.textContent = 'Saved to this browser at ' + new Date().toLocaleTimeString();
    }catch(e){
      saveNote.textContent = 'Could not save (storage unavailable).';
    }
  });

  resetBtn.addEventListener('click', () => {
    hoursPerWeekEl.value = DEFAULTS.hoursPerWeek;
    daysPerWeekEl.value = DEFAULTS.daysPerWeek;
    weeksPerYearEl.value = DEFAULTS.weeksPerYear;
    annualSalary = DEFAULTS.salary;
    filingStatusEl.value = 'single';
    stateSelectEl.value = 'CA';
    seniorOn = false; seniorSwitch.classList.remove('on');
    $('retPct').value = 5; $('healthAnnual').value = 2400; $('hsaAnnual').value = 0; $('otherAnnual').value = 0;
    $('ssWageBase').value = 184500;
    overrideOn = false; overrideSwitch.classList.remove('on'); overrideFields.style.display = 'none';
    $('fedOverridePct').value = 12; $('stateOverridePct').value = 4;
    otOn = false; otSwitch.classList.remove('on'); otFields.style.display = 'none';
    otIncludeOn = false; otIncludeSwitch.classList.remove('on');
    ptoDaysEl.value = 15;
    lastEdited = 'salary';
    refreshDisplays();
    renderAll();
    saveNote.textContent = 'Reset to defaults (not saved).';
  });

  function loadSaved(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) { saveNote.textContent = 'Not yet saved this browser.'; return; }
      const d = JSON.parse(raw);
      if (typeof d.annualSalary === 'number') annualSalary = d.annualSalary;
      if (d.hoursPerWeek) hoursPerWeekEl.value = d.hoursPerWeek;
      if (d.daysPerWeek) daysPerWeekEl.value = d.daysPerWeek;
      if (d.weeksPerYear) weeksPerYearEl.value = d.weeksPerYear;
      if (d.filingStatus) filingStatusEl.value = d.filingStatus;
      if (d.state) stateSelectEl.value = d.state;
      if (d.seniorOn){ seniorOn = true; seniorSwitch.classList.add('on'); }
      if (d.retPct !== undefined) $('retPct').value = d.retPct;
      if (d.healthAnnual !== undefined) $('healthAnnual').value = d.healthAnnual;
      if (d.hsaAnnual !== undefined) $('hsaAnnual').value = d.hsaAnnual;
      if (d.otherAnnual !== undefined) $('otherAnnual').value = d.otherAnnual;
      if (d.ssWageBase !== undefined) $('ssWageBase').value = d.ssWageBase;
      if (d.overrideOn){ overrideOn = true; overrideSwitch.classList.add('on'); overrideFields.style.display = ''; }
      if (d.fedOverridePct !== undefined) $('fedOverridePct').value = d.fedOverridePct;
      if (d.stateOverridePct !== undefined) $('stateOverridePct').value = d.stateOverridePct;
      if (d.otOn){ otOn = true; otSwitch.classList.add('on'); otFields.style.display = ''; }
      if (d.otIncludeOn){ otIncludeOn = true; otIncludeSwitch.classList.add('on'); }
      if (d.otHours !== undefined) $('otHours').value = d.otHours;
      if (d.otMultiplier !== undefined) $('otMultiplier').value = d.otMultiplier;
      if (d.ptoDays !== undefined) ptoDaysEl.value = d.ptoDays;
      saveNote.textContent = 'Loaded saved settings from this browser.';
    }catch(e){ /* ignore */ }
  }

  // ---------- master render ----------
  function renderAll(){
    refreshDisplays();
    renderBreakdown();
    renderOvertime();
    renderComparator();
    renderPTO();
  }

  // ---------- init ----------
  // Nothing above touches FEDERAL_BRACKETS/STATE_TAX until this resolves —
  // inputs stay disabled so a stray keystroke can't run computeTaxes()
  // against still-undefined data.
  salaryInput.disabled = true;
  hourlyInput.disabled = true;
  saveNote.textContent = 'Loading current tax rates…';

  loadReferenceData().then(() => {
    salaryInput.disabled = false;
    hourlyInput.disabled = false;
    populateStateSelect();
    loadSaved();
    refreshDisplays();
    renderAll();
  }).catch(() => {
    saveNote.textContent = 'Could not load tax data — check your connection and reload.';
  });

})();
