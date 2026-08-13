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
  const parseNum = (str) => {
    if (typeof str !== 'string') return Number(str) || 0;
    const cleaned = str.replace(/[^0-9.\-]/g, '');
    const v = parseFloat(cleaned);
    return isFinite(v) ? v : 0;
  };
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

  // ---------- 2026 federal tax data ----------
  const FEDERAL_BRACKETS = {
    single: [[0,10],[12400,12],[50400,22],[105700,24],[201775,32],[256225,35],[640600,37]],
    mfj:    [[0,10],[24800,12],[100800,22],[211400,24],[403550,32],[512450,35],[768700,37]],
    hoh:    [[0,10],[17700,12],[67450,22],[105700,24],[201775,32],[256200,35],[640600,37]]
  };
  const FEDERAL_STD_DED = { single: 16100, mfj: 32200, hoh: 24150 };
  const SENIOR_DED = { single: 2050, mfj: 1650, hoh: 2050 };
  const SS_RATE = 0.062, MEDICARE_RATE = 0.0145, ADDL_MEDICARE_RATE = 0.009;
  const ADDL_MEDICARE_THRESHOLD = { single: 200000, hoh: 200000, mfj: 250000 };

  // ---------- 2026 state tax data ----------
  // type: 'none' | 'brackets'  (flat states expressed as a single-tier bracket)
  // brackets: [[threshold, ratePct], ...] ; hoh approximated via 'single'
  const NONE = { type:'none' };
  const STATE_TAX = {
    AL:{name:'Alabama', type:'brackets', brackets:{single:[[0,2],[500,4],[3000,5]], mfj:[[0,2],[1000,4],[6000,5]]}, stdDed:{single:3000, mfj:8500}},
    AK:Object.assign({name:'Alaska'}, NONE),
    AZ:{name:'Arizona', type:'brackets', brackets:{single:[[0,2.5]], mfj:[[0,2.5]]}, stdDed:{single:8350, mfj:16700}},
    AR:{name:'Arkansas', type:'brackets', brackets:{single:[[0,2],[4600,3.9]], mfj:[[0,2],[4600,3.9]]}, stdDed:{single:2470, mfj:4940}},
    CA:{name:'California', type:'brackets', brackets:{
      single:[[0,1],[11079,2],[26264,4],[41452,6],[57542,8],[72724,9.3],[371479,10.3],[445771,11.3],[742953,12.3],[1000000,13.3]],
      mfj:[[0,1],[22158,2],[52528,4],[82904,6],[115084,8],[145448,9.3],[742958,10.3],[891542,11.3],[1000000,12.3],[1485906,13.3]]
    }, stdDed:{single:5540, mfj:11080}},
    CO:{name:'Colorado', type:'brackets', brackets:{single:[[0,4.4]], mfj:[[0,4.4]]}, stdDed:{single:16100, mfj:32200}},
    CT:{name:'Connecticut', type:'brackets', brackets:{
      single:[[0,2],[10000,4.5],[50000,5.5],[100000,6],[200000,6.5],[250000,6.9],[500000,6.99]],
      mfj:[[0,2],[20000,4.5],[100000,5.5],[200000,6],[400000,6.5],[500000,6.9],[1000000,6.99]]
    }, stdDed:{single:15000, mfj:24000}},
    DE:{name:'Delaware', type:'brackets', brackets:{
      single:[[0,0],[2000,2.2],[5000,3.9],[10000,4.8],[20000,5.2],[25000,5.55],[60000,6.6]],
      mfj:[[0,0],[2000,2.2],[5000,3.9],[10000,4.8],[20000,5.2],[25000,5.55],[60000,6.6]]
    }, stdDed:{single:3250, mfj:6500}},
    FL:Object.assign({name:'Florida'}, NONE),
    GA:{name:'Georgia', type:'brackets', brackets:{single:[[0,5.19]], mfj:[[0,5.19]]}, stdDed:{single:12000, mfj:24000}},
    HI:{name:'Hawaii', type:'brackets', brackets:{
      single:[[0,1.4],[9600,3.2],[14400,5.5],[19200,6.4],[24000,6.8],[36000,7.2],[48000,7.6],[125000,7.9],[175000,8.25],[225000,9],[275000,10],[325000,11]],
      mfj:[[0,1.4],[19200,3.2],[28800,5.5],[38400,6.4],[48000,6.8],[72000,7.2],[96000,7.6],[250000,7.9],[350000,8.25],[450000,9],[550000,10],[650000,11]]
    }, stdDed:{single:4400, mfj:8800}},
    ID:{name:'Idaho', type:'brackets', brackets:{single:[[0,0],[4811,5.3]], mfj:[[0,0],[9622,5.3]]}, stdDed:{single:16100, mfj:32200}},
    IL:{name:'Illinois', type:'brackets', brackets:{single:[[0,4.95]], mfj:[[0,4.95]]}, stdDed:{single:2925, mfj:5850}},
    IN:{name:'Indiana', type:'brackets', brackets:{single:[[0,2.95]], mfj:[[0,2.95]]}, stdDed:{single:1000, mfj:2000}},
    IA:{name:'Iowa', type:'brackets', brackets:{single:[[0,3.8]], mfj:[[0,3.8]]}, stdDed:{single:16100, mfj:32200}},
    KS:{name:'Kansas', type:'brackets', brackets:{single:[[0,5.2],[23000,5.58]], mfj:[[0,5.2],[46000,5.58]]}, stdDed:{single:3605, mfj:8240}},
    KY:{name:'Kentucky', type:'brackets', brackets:{single:[[0,3.5]], mfj:[[0,3.5]]}, stdDed:{single:3360, mfj:3360}},
    LA:{name:'Louisiana', type:'brackets', brackets:{single:[[0,3]], mfj:[[0,3]]}, stdDed:{single:12875, mfj:25750}},
    ME:{name:'Maine', type:'brackets', brackets:{single:[[0,5.8],[27399,6.75],[64849,7.15]], mfj:[[0,5.8],[54849,6.75],[129749,7.15]]}, stdDed:{single:8350, mfj:16700}},
    MD:{name:'Maryland', type:'brackets', brackets:{
      single:[[0,2],[1000,3],[2000,4],[3000,4.75],[100000,5],[125000,5.25],[150000,5.5],[250000,5.75],[500000,6.25],[1000000,6.5]],
      mfj:[[0,2],[1000,3],[2000,4],[3000,4.75],[150000,5],[175000,5.25],[225000,5.5],[300000,5.75],[600000,6.25],[1200000,6.5]]
    }, stdDed:{single:3350, mfj:6700}},
    MA:{name:'Massachusetts', type:'brackets', brackets:{single:[[0,5],[1083150,9]], mfj:[[0,5],[1083150,9]]}, stdDed:{single:4400, mfj:8800}},
    MI:{name:'Michigan', type:'brackets', brackets:{single:[[0,4.25]], mfj:[[0,4.25]]}, stdDed:{single:5900, mfj:11800}},
    MN:{name:'Minnesota', type:'brackets', brackets:{
      single:[[0,5.35],[33310,6.8],[109430,7.85],[203150,9.85]],
      mfj:[[0,5.35],[48700,6.8],[193480,7.85],[337930,9.85]]
    }, stdDed:{single:15300, mfj:30600}},
    MS:{name:'Mississippi', type:'brackets', brackets:{single:[[0,0],[10000,4]], mfj:[[0,0],[10000,4]]}, stdDed:{single:2300, mfj:4600}},
    MO:{name:'Missouri', type:'brackets', brackets:{
      single:[[0,0],[1348,2],[2696,2.5],[4044,3],[5392,3.5],[6740,4],[8088,4.5],[9436,4.7]],
      mfj:[[0,0],[1348,2],[2696,2.5],[4044,3],[5392,3.5],[6740,4],[8088,4.5],[9436,4.7]]
    }, stdDed:{single:16100, mfj:32200}},
    MT:{name:'Montana', type:'brackets', brackets:{single:[[0,4.7],[47500,5.65]], mfj:[[0,4.7],[95000,5.65]]}, stdDed:{single:16100, mfj:32200}},
    NE:{name:'Nebraska', type:'brackets', brackets:{single:[[0,2.46],[4130,3.51],[24760,4.55]], mfj:[[0,2.46],[8250,3.51],[49530,4.55]]}, stdDed:{single:8850, mfj:17700}},
    NV:Object.assign({name:'Nevada'}, NONE),
    NH:Object.assign({name:'New Hampshire'}, NONE),
    NJ:{name:'New Jersey', type:'brackets', brackets:{
      single:[[0,1.4],[20000,1.75],[35000,3.5],[40000,5.53],[75000,6.37],[500000,8.97],[1000000,10.75]],
      mfj:[[0,1.4],[20000,1.75],[50000,2.45],[70000,3.5],[80000,5.53],[150000,6.37],[500000,8.97],[1000000,10.75]]
    }, stdDed:{single:1000, mfj:2000}},
    NM:{name:'New Mexico', type:'brackets', brackets:{
      single:[[0,1.5],[5500,3.2],[16500,4.3],[33500,4.7],[66500,4.9],[210000,5.9]],
      mfj:[[0,1.5],[8000,3.2],[25000,4.3],[50000,4.7],[100000,4.9],[315000,5.9]]
    }, stdDed:{single:16100, mfj:32200}},
    NY:{name:'New York', type:'brackets', brackets:{
      single:[[0,3.9],[8500,4.4],[11700,5.15],[13900,5.4],[80650,5.9],[215400,6.85],[1077550,9.65],[5000000,10.3],[25000000,10.9]],
      mfj:[[0,3.9],[17150,4.4],[23600,5.15],[27900,5.4],[161550,5.9],[323200,6.85],[2155350,9.65],[5000000,10.3],[25000000,10.9]]
    }, stdDed:{single:8000, mfj:16050}},
    NC:{name:'North Carolina', type:'brackets', brackets:{single:[[0,3.99]], mfj:[[0,3.99]]}, stdDed:{single:12750, mfj:25500}},
    ND:{name:'North Dakota', type:'brackets', brackets:{single:[[0,0],[48475,1.95],[244825,2.5]], mfj:[[0,0],[80975,1.95],[298075,2.5]]}, stdDed:{single:16100, mfj:32200}},
    OH:{name:'Ohio', type:'brackets', brackets:{single:[[0,0],[26050,2.75]], mfj:[[0,0],[26050,2.75]]}, stdDed:{single:2400, mfj:4800}},
    OK:{name:'Oklahoma', type:'brackets', brackets:{single:[[0,0],[3750,2.5],[4900,3.5],[7200,4.5]], mfj:[[0,0],[7500,2.5],[9800,3.5],[14400,4.5]]}, stdDed:{single:6350, mfj:12700}},
    OR:{name:'Oregon', type:'brackets', brackets:{single:[[0,4.75],[4550,6.75],[11400,8.75],[125000,9.9]], mfj:[[0,4.75],[9100,6.75],[22800,8.75],[250000,9.9]]}, stdDed:{single:2910, mfj:5820}},
    PA:{name:'Pennsylvania', type:'brackets', brackets:{single:[[0,3.07]], mfj:[[0,3.07]]}, stdDed:{single:0, mfj:0}},
    RI:{name:'Rhode Island', type:'brackets', brackets:{single:[[0,3.75],[82050,4.75],[186450,5.99]], mfj:[[0,3.75],[82050,4.75],[186450,5.99]]}, stdDed:{single:11200, mfj:22400}},
    SC:{name:'South Carolina', type:'brackets', brackets:{single:[[0,0],[3640,3],[18230,6]], mfj:[[0,0],[3640,3],[18230,6]]}, stdDed:{single:8350, mfj:16700}},
    SD:Object.assign({name:'South Dakota'}, NONE),
    TN:Object.assign({name:'Tennessee'}, NONE),
    TX:Object.assign({name:'Texas'}, NONE),
    UT:{name:'Utah', type:'brackets', brackets:{single:[[0,4.5]], mfj:[[0,4.5]]}, stdDed:{single:0, mfj:0}},
    VT:{name:'Vermont', type:'brackets', brackets:{single:[[0,3.35],[49400,6.6],[119700,7.6],[249700,8.75]], mfj:[[0,3.35],[82500,6.6],[199450,7.6],[304000,8.75]]}, stdDed:{single:7650, mfj:15300}},
    VA:{name:'Virginia', type:'brackets', brackets:{single:[[0,2],[3000,3],[5000,5],[17000,5.75]], mfj:[[0,2],[3000,3],[5000,5],[17000,5.75]]}, stdDed:{single:8750, mfj:17500}},
    WA:Object.assign({name:'Washington (wages untaxed; capital gains only)'}, NONE),
    WV:{name:'West Virginia', type:'brackets', brackets:{single:[[0,2.22],[10000,2.96],[25000,3.33],[40000,4.44],[60000,4.82]], mfj:[[0,2.22],[10000,2.96],[25000,3.33],[40000,4.44],[60000,4.82]]}, stdDed:{single:2000, mfj:4000}},
    WI:{name:'Wisconsin', type:'brackets', brackets:{single:[[0,3.5],[15110,4.4],[51950,5.3],[332720,7.65]], mfj:[[0,3.5],[20150,4.4],[69260,5.3],[443630,7.65]]}, stdDed:{single:13960, mfj:25840}},
    WY:Object.assign({name:'Wyoming'}, NONE),
    DC:{name:'Washington DC', type:'brackets', brackets:{
      single:[[0,4],[10000,6],[40000,6.5],[60000,8.5],[250000,9.25],[500000,9.75],[1000000,10.75]],
      mfj:[[0,4],[10000,6],[40000,6.5],[60000,8.5],[250000,9.25],[500000,9.75],[1000000,10.75]]
    }, stdDed:{single:16100, mfj:32200}}
  };

  // ---------- progressive bracket tax function ----------
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

  function overtimeExtraAnnual(sch, hourlyRate){
    if (!otOn) return 0;
    const otHours = parseNum($('otHours').value);
    const mult = parseNum($('otMultiplier').value);
    const otRate = hourlyRate * mult;
    return otRate * otHours * sch.weeksPerYear;
  }

  // ---------- core tax computation ----------
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
      if (!raw) return;
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
  populateStateSelect();
  loadSaved();
  refreshDisplays();
  renderAll();

})();
