(function(){
  "use strict";
  const $ = id => document.getElementById(id);

  // Models a whole household's pay across multiple people, each with
  // multiple jobs, combined federal/state/FICA tax, and per-job breakdowns.

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
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const makeId = () => Math.random().toString(36).slice(2,9);

  // ---------- 2026 federal tax data ----------
  // Still a local hardcoded copy, unlike IncomeCalculatorSimple and
  // InvestmentGrowthCalculator, which now fetch the same data from
  // GET /api/federal and GET /api/states (server/data/) — this file wasn't
  // migrated when that API was introduced, so it's a third independent
  // copy that can drift from the other two.
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
    WA:Object.assign({name:'Washington (wages untaxed)'}, NONE),
    WV:{name:'West Virginia', type:'brackets', brackets:{single:[[0,2.22],[10000,2.96],[25000,3.33],[40000,4.44],[60000,4.82]], mfj:[[0,2.22],[10000,2.96],[25000,3.33],[40000,4.44],[60000,4.82]]}, stdDed:{single:2000, mfj:4000}},
    WI:{name:'Wisconsin', type:'brackets', brackets:{single:[[0,3.5],[15110,4.4],[51950,5.3],[332720,7.65]], mfj:[[0,3.5],[20150,4.4],[69260,5.3],[443630,7.65]]}, stdDed:{single:13960, mfj:25840}},
    WY:Object.assign({name:'Wyoming'}, NONE),
    DC:{name:'Washington DC', type:'brackets', brackets:{
      single:[[0,4],[10000,6],[40000,6.5],[60000,8.5],[250000,9.25],[500000,9.75],[1000000,10.75]],
      mfj:[[0,4],[10000,6],[40000,6.5],[60000,8.5],[250000,9.25],[500000,9.75],[1000000,10.75]]
    }, stdDed:{single:16100, mfj:32200}}
  };

  // Walks the bracket table applying each tier's rate only to the income
  // within it, stopping once taxableIncome is exhausted.
  function bracketTax(taxableIncome, brackets){
    if (taxableIncome <= 0) return { tax: 0, marginalRate: 0 };
    let tax = 0, marginalRate = brackets[0][1];
    for (let i = 0; i < brackets.length; i++){
      const threshold = brackets[i][0], rate = brackets[i][1];
      const nextThreshold = (i + 1 < brackets.length) ? brackets[i+1][0] : Infinity;
      if (taxableIncome > threshold){
        const band = Math.min(taxableIncome, nextThreshold) - threshold;
        tax += band * (rate/100);
        marginalRate = rate;
      } else break;
    }
    return { tax, marginalRate };
  }

  function stateOptionsHtml(selected){
    const groups = { none: [], flat: [], bracket: [] };
    Object.keys(STATE_TAX).sort((a,b) => STATE_TAX[a].name.localeCompare(STATE_TAX[b].name)).forEach(code => {
      const s = STATE_TAX[code];
      if (s.type === 'none') groups.none.push(code);
      else if (s.brackets.single.length === 1) groups.flat.push(code);
      else groups.bracket.push(code);
    });
    const mk = (label, codes) => !codes.length ? '' : `<optgroup label="${label}">` + codes.map(c => `<option value="${c}"${c===selected?' selected':''}>${STATE_TAX[c].name}</option>`).join('') + `</optgroup>`;
    return mk('No income tax', groups.none) + mk('Flat-rate states', groups.flat) + mk('Progressive-bracket states', groups.bracket);
  }

  // ---------- data model ----------
  function createJob(label){
    return { id: makeId(), label, annualSalary: 65000, hoursPerWeek: 40, daysPerWeek: 5, weeksPerYear: 52,
             otOn: false, otIncludeOn: false, otHours: 5, otMultiplier: 1.5, ptoDays: 15 };
  }
  function createPerson(name){
    return { id: makeId(), name, filingStatus:'single', state:'CA', seniorOn:false,
             overrideOn:false, fedOverridePct:12, stateOverridePct:4,
             retPct:5, healthAnnual:2400, hsaAnnual:0, otherAnnual:0,
             numChildren:0, stateCreditPerChild:0,
             jobs: [createJob('Main job')] };
  }
  let people = [ createPerson('Person 1') ];
  let currentView = 'household';

  function findPerson(id){ return people.find(p => p.id === id); }
  function findJobAndPerson(jobId){
    for (const p of people){ const j = p.jobs.find(j => j.id === jobId); if (j) return { job:j, person:p }; }
    return null;
  }

  function jobSchedule(job){
    return {
      hoursPerWeek: clamp(parseNum(String(job.hoursPerWeek)) || 40, 1, 168),
      daysPerWeek: clamp(parseNum(String(job.daysPerWeek)) || 5, 1, 7),
      weeksPerYear: clamp(parseNum(String(job.weeksPerYear)) || 52, 1, 52)
    };
  }
  function annualFromHourly(hourly, sch){ return hourly * sch.hoursPerWeek * sch.weeksPerYear; }
  function hourlyFromAnnual(annual, sch){ const t = sch.hoursPerWeek * sch.weeksPerYear; return t > 0 ? annual / t : 0; }

  function jobBaseHourly(job){ return hourlyFromAnnual(job.annualSalary, jobSchedule(job)); }
  function jobOvertimeExtraAnnual(job){
    if (!job.otOn) return 0;
    const sch = jobSchedule(job);
    const hourly = jobBaseHourly(job);
    const otRate = hourly * (parseNum(String(job.otMultiplier)) || 1.5);
    return otRate * (parseNum(String(job.otHours)) || 0) * sch.weeksPerYear;
  }
  function jobGrossAnnual(job){ return job.annualSalary + (job.otOn && job.otIncludeOn ? jobOvertimeExtraAnnual(job) : 0); }
  function personGrossAnnual(person){ return person.jobs.reduce((sum, j) => sum + jobGrossAnnual(j), 0); }

  function ssWageBase(){ return Math.max(0, parseNum($('ssWageBaseGlobal').value)) || 184500; }

  // Federal Child Tax Credit: $2,200/child, reduced $50 per $1,000 of
  // income above the filing-status threshold. State child credits vary too
  // much to model generically — see the person's stateCreditPerChild field.
  const CTC_PER_CHILD = 2200;
  const CTC_PHASEOUT_THRESHOLD = { single: 200000, hoh: 200000, mfj: 400000 };
  function childTaxCredit(numChildren, grossAnnual, filingStatus){
    if (numChildren <= 0) return 0;
    let credit = CTC_PER_CHILD * numChildren;
    const threshold = CTC_PHASEOUT_THRESHOLD[filingStatus];
    if (grossAnnual > threshold){
      const excess = grossAnnual - threshold;
      const reduction = Math.ceil(excess / 1000) * 50;
      credit = Math.max(0, credit - reduction);
    }
    return credit;
  }

  // The only place tax math happens — computed ONCE per person on their
  // combined income across all jobs (grossOverride lets the comparator
  // reuse this for a hypothetical single-job income), never per job, since
  // brackets are inherently a whole-income calculation.
  function computeTaxesForPerson(person, grossOverride){
    const grossAnnual = grossOverride !== undefined ? grossOverride : personGrossAnnual(person);
    const filingStatus = person.filingStatus;
    const stateInfo = STATE_TAX[person.state] || NONE;

    const retPct = clamp((parseNum(String(person.retPct)) || 0) / 100, 0, 1);
    const healthAnnual = Math.max(0, parseNum(String(person.healthAnnual)) || 0);
    const hsaAnnual = Math.max(0, parseNum(String(person.hsaAnnual)) || 0);
    const otherAnnual = Math.max(0, parseNum(String(person.otherAnnual)) || 0);

    const pretaxRetirement = grossAnnual * retPct;
    const pretaxHealthHSA = healthAnnual + hsaAnnual;

    let federalTax, federalMarginal, stateTax = 0, stateMarginal = 0;

    if (person.overrideOn){
      const fedPct = clamp((parseNum(String(person.fedOverridePct)) || 0) / 100, 0, 1);
      const statePct = clamp((parseNum(String(person.stateOverridePct)) || 0) / 100, 0, 1);
      federalTax = Math.max(0, grossAnnual) * fedPct;
      federalMarginal = fedPct * 100;
      stateTax = Math.max(0, grossAnnual) * statePct;
      stateMarginal = statePct * 100;
    } else {
      const stdDed = FEDERAL_STD_DED[filingStatus] + (person.seniorOn ? SENIOR_DED[filingStatus] : 0);
      const fedBase = Math.max(0, grossAnnual - pretaxRetirement - pretaxHealthHSA - stdDed);
      const fedResult = bracketTax(fedBase, FEDERAL_BRACKETS[filingStatus]);
      federalTax = fedResult.tax; federalMarginal = fedResult.marginalRate;

      if (stateInfo.type === 'none'){
        stateTax = 0; stateMarginal = 0;
      } else {
        const key = filingStatus === 'mfj' ? 'mfj' : 'single';
        const stateStdDed = (stateInfo.stdDed && stateInfo.stdDed[key]) || 0;
        const stateBase = Math.max(0, grossAnnual - pretaxRetirement - pretaxHealthHSA - stateStdDed);
        const stateResult = bracketTax(stateBase, stateInfo.brackets[key]);
        stateTax = stateResult.tax; stateMarginal = stateResult.marginalRate;
      }
    }

    const wageBase = ssWageBase();
    const ficaBase = Math.max(0, grossAnnual - pretaxHealthHSA);
    const ssTaxable = Math.min(ficaBase, wageBase);
    const socialSecurityTax = ssTaxable * SS_RATE;
    const medicareTax = ficaBase * MEDICARE_RATE;
    const addlThreshold = ADDL_MEDICARE_THRESHOLD[filingStatus];
    const addlMedicareTax = Math.max(0, ficaBase - addlThreshold) * ADDL_MEDICARE_RATE;
    const ficaTax = socialSecurityTax + medicareTax + addlMedicareTax;

    const numChildren = Math.max(0, Math.round(parseNum(String(person.numChildren)) || 0));
    const ctc = childTaxCredit(numChildren, grossAnnual, filingStatus);
    const federalTaxBeforeCredit = federalTax;
    federalTax = Math.max(0, federalTax - ctc);
    const ctcApplied = federalTaxBeforeCredit - federalTax;

    const stateCreditPerChild = Math.max(0, parseNum(String(person.stateCreditPerChild)) || 0);
    const stateChildCredit = numChildren * stateCreditPerChild;
    const stateTaxBeforeCredit = stateTax;
    stateTax = Math.max(0, stateTax - stateChildCredit);
    const stateChildCreditApplied = stateTaxBeforeCredit - stateTax;

    const totalTax = federalTax + stateTax + ficaTax;
    const netAnnual = grossAnnual - totalTax - pretaxRetirement - pretaxHealthHSA - otherAnnual;
    const effectiveRate = grossAnnual > 0 ? (totalTax/grossAnnual)*100 : 0;

    return {
      grossAnnual, federalTax, federalMarginal, stateTax, stateMarginal, stateName: stateInfo.name || '—',
      socialSecurityTax, medicareTax, addlMedicareTax, ficaTax, totalTax, netAnnual, effectiveRate,
      nonTaxDeductions: pretaxRetirement + pretaxHealthHSA + otherAnnual,
      numChildren, ctcApplied, stateChildCreditApplied
    };
  }

  // ---------- people editor rendering ----------
  const peopleContainer = $('peopleContainer');

  function renderPeopleEditor(){
    peopleContainer.innerHTML = people.map(person => personCardHtml(person)).join('');
  }

  function personCardHtml(person){
    const canRemovePerson = people.length > 1;
    return `
    <div class="person-card" data-person="${person.id}">
      <div class="person-head">
        <input type="text" value="${escapeHtml(person.name)}" data-scope="person" data-field="name" data-person="${person.id}">
        ${canRemovePerson ? `<button class="btn-mini" data-action="remove-person" data-person="${person.id}">Remove person</button>` : ''}
      </div>
      <div class="person-body">
        <div class="field-grid">
          <div class="field"><label>Filing status</label>
            <select data-scope="person" data-field="filingStatus" data-person="${person.id}">
              <option value="single"${person.filingStatus==='single'?' selected':''}>Single</option>
              <option value="mfj"${person.filingStatus==='mfj'?' selected':''}>Married filing jointly</option>
              <option value="hoh"${person.filingStatus==='hoh'?' selected':''}>Head of household</option>
            </select>
          </div>
          <div class="field"><label>State</label>
            <select data-scope="person" data-field="state" data-person="${person.id}">${stateOptionsHtml(person.state)}</select>
          </div>
          <div class="field"><label>Retirement (401k/IRA)</label>
            <input type="number" value="${person.retPct}" step="0.1" data-scope="person" data-field="retPct" data-person="${person.id}">
          </div>
          <div class="field"><label>Health insurance $/yr</label>
            <input type="number" value="${person.healthAnnual}" step="10" data-scope="person" data-field="healthAnnual" data-person="${person.id}">
          </div>
          <div class="field"><label>HSA/FSA $/yr</label>
            <input type="number" value="${person.hsaAnnual}" step="10" data-scope="person" data-field="hsaAnnual" data-person="${person.id}">
          </div>
          <div class="field"><label>Other (post‑tax) $/yr</label>
            <input type="number" value="${person.otherAnnual}" step="10" data-scope="person" data-field="otherAnnual" data-person="${person.id}">
          </div>
          <div class="field"><label>Children (under 17)</label>
            <input type="number" value="${person.numChildren}" min="0" step="1" data-scope="person" data-field="numChildren" data-person="${person.id}">
          </div>
          <div class="field"><label>State credit/child $ (optional)</label>
            <input type="number" value="${person.stateCreditPerChild}" min="0" step="10" data-scope="person" data-field="stateCreditPerChild" data-person="${person.id}">
          </div>
        </div>
        <p class="section-sub" style="margin:8px 0 0 0;">Federal Child Tax Credit ($2,200/child, 2026, with income phase‑out) is applied automatically. States vary widely — some give a credit, some an exemption, amounts differ a lot — so enter your state's per‑child amount above if you know it; it's applied as a direct credit against state tax. Leave at $0 to skip.</p>
        <div class="row-toggle">
          <div class="switch ${person.seniorOn?'on':''}" data-action="toggle-senior" data-person="${person.id}"><div class="knob"></div></div>
          <label data-action="toggle-senior" data-person="${person.id}">Add additional 65+ standard deduction</label>
        </div>
        <div class="row-toggle">
          <div class="switch ${person.overrideOn?'on':''}" data-action="toggle-override" data-person="${person.id}"><div class="knob"></div></div>
          <label data-action="toggle-override" data-person="${person.id}">Override with flat federal/state rates</label>
        </div>
        ${person.overrideOn ? `
        <div class="field-grid">
          <div class="field"><label>Federal rate %</label><input type="number" value="${person.fedOverridePct}" step="0.1" data-scope="person" data-field="fedOverridePct" data-person="${person.id}"></div>
          <div class="field"><label>State rate %</label><input type="number" value="${person.stateOverridePct}" step="0.1" data-scope="person" data-field="stateOverridePct" data-person="${person.id}"></div>
        </div>` : ''}

        ${person.jobs.map(job => jobBlockHtml(person, job)).join('')}
        <button class="btn-mini add" data-action="add-job" data-person="${person.id}" style="margin-top:12px;">+ Add job for ${escapeHtml(person.name)}</button>
      </div>
    </div>`;
  }

  function jobBlockHtml(person, job){
    const canRemoveJob = person.jobs.length > 1;
    const sch = jobSchedule(job);
    const hourly = hourlyFromAnnual(job.annualSalary, sch);
    return `
    <div class="job-block" data-job="${job.id}" data-person="${person.id}">
      <div class="job-head">
        <input type="text" value="${escapeHtml(job.label)}" data-scope="job" data-field="label" data-job="${job.id}" data-person="${person.id}">
        ${canRemoveJob ? `<button class="btn-mini" data-action="remove-job" data-job="${job.id}" data-person="${person.id}">Remove</button>` : ''}
      </div>
      <div class="job-balance">
        <div class="mini-account"><div class="lab">Annual salary</div><div class="amt-row"><span class="pre">$</span><input type="text" value="${fmt(job.annualSalary,0)}" data-scope="job" data-field="salary" data-job="${job.id}" data-person="${person.id}"></div></div>
        <div class="job-beam-wrap"><div class="job-beam" data-jobbeam="${job.id}">=</div></div>
        <div class="mini-account"><div class="lab">Hourly rate</div><div class="amt-row"><span class="pre">$</span><input type="text" value="${fmt(hourly,2)}" data-scope="job" data-field="hourly" data-job="${job.id}" data-person="${person.id}"></div></div>
      </div>
      <div class="field-grid">
        <div class="field"><label>Hours/week</label><input type="number" value="${job.hoursPerWeek}" min="1" max="168" step="0.5" data-scope="job" data-field="hoursPerWeek" data-job="${job.id}" data-person="${person.id}"></div>
        <div class="field"><label>Days/week</label><input type="number" value="${job.daysPerWeek}" min="1" max="7" step="1" data-scope="job" data-field="daysPerWeek" data-job="${job.id}" data-person="${person.id}"></div>
        <div class="field"><label>Paid weeks/year</label><input type="number" value="${job.weeksPerYear}" min="1" max="52" step="0.5" data-scope="job" data-field="weeksPerYear" data-job="${job.id}" data-person="${person.id}"></div>
        <div class="field"><label>PTO days/year</label><input type="number" value="${job.ptoDays}" min="0" step="1" data-scope="job" data-field="ptoDays" data-job="${job.id}" data-person="${person.id}"></div>
      </div>
      <div class="row-toggle">
        <div class="switch ${job.otOn?'on':''}" data-action="toggle-ot" data-job="${job.id}" data-person="${person.id}"><div class="knob"></div></div>
        <label data-action="toggle-ot" data-job="${job.id}" data-person="${person.id}">Overtime</label>
      </div>
      ${job.otOn ? `
      <div class="field-grid">
        <div class="field"><label>OT hours/week</label><input type="number" value="${job.otHours}" min="0" step="0.5" data-scope="job" data-field="otHours" data-job="${job.id}" data-person="${person.id}"></div>
        <div class="field"><label>Multiplier</label>
          <select data-scope="job" data-field="otMultiplier" data-job="${job.id}" data-person="${person.id}">
            <option value="1.5"${String(job.otMultiplier)==='1.5'?' selected':''}>1.5×</option>
            <option value="2"${String(job.otMultiplier)==='2'?' selected':''}>2×</option>
          </select>
        </div>
      </div>
      <div class="row-toggle">
        <div class="switch ${job.otIncludeOn?'on':''}" data-action="toggle-ot-include" data-job="${job.id}" data-person="${person.id}"><div class="knob"></div></div>
        <label data-action="toggle-ot-include" data-job="${job.id}" data-person="${person.id}">Fold into totals</label>
      </div>` : ''}
      <div class="job-stats" data-jobstats="${job.id}"></div>
    </div>`;
  }

  function renderJobStats(job){
    const el = peopleContainer.querySelector(`[data-jobstats="${job.id}"]`);
    if (!el) return;
    const sch = jobSchedule(job);
    const person = findJobAndPerson(job.id).person;
    const grossAnnual = jobGrossAnnual(job);
    const personGross = personGrossAnnual(person);
    const share = personGross > 0 ? grossAnnual / personGross : 0;
    const personTax = computeTaxesForPerson(person);
    const jobNetAnnual = personTax.netAnnual * share;
    const dayValueGross = grossAnnual / (sch.daysPerWeek * 52);
    const dayValueNet = jobNetAnnual / (sch.daysPerWeek * 52);
    let cards = [
      { lab: "This job's annual gross", val: fmtMoney(grossAnnual,0) },
      { lab: 'PTO value (gross)', val: fmtMoney(dayValueGross * (parseNum(String(job.ptoDays))||0), 0) },
      { lab: 'Unpaid day cost (net)', val: fmtMoney(dayValueNet, 0) }
    ];
    if (job.otOn){
      const extra = jobOvertimeExtraAnnual(job);
      cards.push({ lab: 'Extra OT pay / yr', val: fmtMoney(extra,0) });
    }
    el.innerHTML = cards.map(c => `<div class="job-stat"><div class="lab">${c.lab}</div><div class="val">${c.val}</div></div>`).join('');
  }

  function renderAllJobStats(){
    people.forEach(p => p.jobs.forEach(j => renderJobStats(j)));
  }

  // ---------- view selector ----------
  const viewSelect = $('viewSelect');
  function renderViewOptions(){
    const prev = currentView;
    let html = `<option value="household">Household total</option>`;
    people.forEach(p => {
      html += `<option value="person:${p.id}">${escapeHtml(p.name)} — total</option>`;
      p.jobs.forEach(j => { html += `<option value="job:${j.id}">&nbsp;&nbsp;&nbsp;&nbsp;↳ ${escapeHtml(p.name)}: ${escapeHtml(j.label)}</option>`; });
    });
    viewSelect.innerHTML = html;
    const stillValid = Array.from(viewSelect.options).some(o => o.value === prev);
    viewSelect.value = stillValid ? prev : 'household';
    currentView = viewSelect.value;
  }
  viewSelect.addEventListener('change', () => { currentView = viewSelect.value; renderView(); });

  // ---------- hero + breakdown rendering ----------
  const heroBeam = $('heroBeam');
  function pulseHeroBeam(){
    heroBeam.classList.add('pulse');
    clearTimeout(pulseHeroBeam._t);
    pulseHeroBeam._t = setTimeout(()=> heroBeam.classList.remove('pulse'), 320);
  }

  function renderView(){
    const breakdownBody = $('breakdownBody');
    const taxDetail = $('taxDetail');
    const warnBanner = $('warnBanner');
    const infoBanner = $('infoBanner');

    if (currentView.startsWith('job:')){
      // There's no real per-job tax figure (see computeTaxesForPerson) — a
      // job's "net" here is the person's total net allocated by that job's
      // share of their gross income, not actual employer withholding.
      const jobId = currentView.slice(4);
      const found = findJobAndPerson(jobId);
      if (!found){ currentView = 'household'; viewSelect.value = 'household'; return renderView(); }
      const { job, person } = found;
      const sch = jobSchedule(job);
      const jobGross = jobGrossAnnual(job);
      const personGross = personGrossAnnual(person);
      const personTax = computeTaxesForPerson(person);
      const share = personGross > 0 ? jobGross / personGross : 0;
      const jobNetAnnual = personTax.netAnnual * share;
      const hourlyRate = jobBaseHourly(job);

      $('heroLeftLabel').textContent = job.label + ' — Gross';
      $('heroLeftAmount').textContent = fmtMoney(jobGross, 0);
      $('heroLeftSuffix').textContent = '/ year · ' + fmtMoney(hourlyRate,2) + '/hr';
      $('heroRightLabel').textContent = job.label + ' — Net (allocated)';
      $('heroRightAmount').textContent = fmtMoney(jobNetAnnual, 0);
      $('heroRightSuffix').textContent = '/ year';

      const dailyHours = sch.hoursPerWeek / sch.daysPerWeek;
      const periods = [
        { name:'Hourly', gross: hourlyRate, net: hourlyRate * (jobGross>0 ? jobNetAnnual/jobGross : 0), decimals:2 },
        { name:'Daily', gross: hourlyRate*dailyHours, net: jobNetAnnual/(52*sch.daysPerWeek) || 0 },
        { name:'Weekly', gross: jobGross/52, net: jobNetAnnual/52 || 0 },
        { name:'Biweekly', gross: jobGross/26, net: jobNetAnnual/26 || 0 },
        { name:'Semi‑monthly', gross: jobGross/24, net: jobNetAnnual/24 || 0 },
        { name:'Monthly', gross: jobGross/12, net: jobNetAnnual/12 || 0 },
        { name:'Annual', gross: jobGross, net: jobNetAnnual, highlight:true }
      ];
      breakdownBody.innerHTML = periods.map(p => `<tr${p.highlight?' class="highlight"':''}><td>${p.name}</td><td>${fmtMoney(p.gross,p.decimals||0)}</td><td class="net${p.net<0?' negative':''}">${fmtMoney(p.net,p.decimals||0)}</td></tr>`).join('');

      taxDetail.innerHTML = `
        <div class="trow"><span class="k">Share of ${escapeHtml(person.name)}'s total income</span><span class="v">${fmt(share*100,1)}%</span></div>
        <div class="trow"><span class="k">Allocated tax + deductions (this job's share)</span><span class="v">${fmtMoney(jobGross - jobNetAnnual,0)}</span></div>
        <div class="trow total"><span class="k">Allocated net</span><span class="v">${fmtMoney(jobNetAnnual,0)}</span></div>`;
      infoBanner.style.display = '';
      infoBanner.textContent = `Net for a single job is estimated by giving it its proportional share (${fmt(share*100,1)}%) of ${escapeHtml(person.name)}'s total tax and deductions — not this employer's actual paycheck withholding.`;
      warnBanner.style.display = jobNetAnnual < 0 ? '' : 'none';
      if (jobNetAnnual < 0) warnBanner.textContent = `${person.name}'s combined taxes and deductions currently exceed gross pay, so this job's allocated net is negative too.`;

    } else if (currentView.startsWith('person:')){
      const personId = currentView.slice(7);
      const person = findPerson(personId);
      if (!person){ currentView = 'household'; viewSelect.value = 'household'; return renderView(); }
      const t = computeTaxesForPerson(person);

      $('heroLeftLabel').textContent = escapeHtml(person.name) + ' — Gross';
      $('heroLeftAmount').textContent = fmtMoney(t.grossAnnual, 0);
      $('heroLeftSuffix').textContent = '/ year';
      $('heroRightLabel').textContent = escapeHtml(person.name) + ' — Net';
      $('heroRightAmount').textContent = fmtMoney(t.netAnnual, 0);
      $('heroRightSuffix').textContent = '/ year';

      const periods = [
        { name:'Weekly', gross: t.grossAnnual/52, net: t.netAnnual/52 || 0 },
        { name:'Biweekly', gross: t.grossAnnual/26, net: t.netAnnual/26 || 0 },
        { name:'Semi‑monthly', gross: t.grossAnnual/24, net: t.netAnnual/24 || 0 },
        { name:'Monthly', gross: t.grossAnnual/12, net: t.netAnnual/12 || 0 },
        { name:'Annual', gross: t.grossAnnual, net: t.netAnnual, highlight:true }
      ];
      breakdownBody.innerHTML = periods.map(p => `<tr${p.highlight?' class="highlight"':''}><td>${p.name}</td><td>${fmtMoney(p.gross,0)}</td><td class="net${p.net<0?' negative':''}">${fmtMoney(p.net,0)}</td></tr>`).join('');

      const jobRows = person.jobs.map(j => {
        const jg = jobGrossAnnual(j);
        const sh = t.grossAnnual>0 ? jg/t.grossAnnual*100 : 0;
        return `<div class="trow"><span class="k">↳ ${escapeHtml(j.label)} (${fmt(sh,1)}% of income)</span><span class="v">${fmtMoney(jg,0)}</span></div>`;
      }).join('');

      taxDetail.innerHTML = `
        ${jobRows}
        <div class="trow"><span class="k">Federal income tax (marginal ${fmt(t.federalMarginal,1)}%)</span><span class="v">${fmtMoney(t.federalTax,0)}</span></div>
        ${t.ctcApplied>0?`<div class="trow"><span class="k">↳ Child Tax Credit applied (${t.numChildren} ${t.numChildren===1?'child':'children'})</span><span class="v">-${fmtMoney(t.ctcApplied,0)}</span></div>`:''}
        <div class="trow"><span class="k">State income tax — ${t.stateName} (marginal ${fmt(t.stateMarginal,1)}%)</span><span class="v">${fmtMoney(t.stateTax,0)}</span></div>
        ${t.stateChildCreditApplied>0?`<div class="trow"><span class="k">↳ State per‑child credit applied</span><span class="v">-${fmtMoney(t.stateChildCreditApplied,0)}</span></div>`:''}
        <div class="trow"><span class="k">Social Security (6.2%, capped)</span><span class="v">${fmtMoney(t.socialSecurityTax,0)}</span></div>
        <div class="trow"><span class="k">Medicare (1.45%${t.addlMedicareTax>0?' + 0.9% additional':''})</span><span class="v">${fmtMoney(t.medicareTax+t.addlMedicareTax,0)}</span></div>
        <div class="trow total"><span class="k">Total tax</span><span class="v">${fmtMoney(t.totalTax,0)}</span></div>
        <div class="trow"><span class="k">Effective tax rate</span><span class="v">${fmt(t.effectiveRate,1)}%</span></div>
        <div class="trow keep"><span class="k">Take‑home (after tax + all deductions)</span><span class="v">${fmt(t.grossAnnual>0?(t.netAnnual/t.grossAnnual*100):100,1)}%</span></div>`;
      infoBanner.style.display = 'none';
      warnBanner.style.display = t.netAnnual < 0 ? '' : 'none';
      if (t.netAnnual < 0) warnBanner.textContent = `${person.name}'s combined taxes and deductions currently exceed gross pay.`;

    } else {
      // household
      const rows = people.map(p => ({ person: p, t: computeTaxesForPerson(p) }));
      const householdGross = rows.reduce((s,r) => s + r.t.grossAnnual, 0);
      const householdNet = rows.reduce((s,r) => s + r.t.netAnnual, 0);
      const householdTax = rows.reduce((s,r) => s + r.t.totalTax, 0);

      $('heroLeftLabel').textContent = 'Household — Gross';
      $('heroLeftAmount').textContent = fmtMoney(householdGross, 0);
      $('heroLeftSuffix').textContent = '/ year · ' + people.length + ' ' + (people.length===1?'person':'people');
      $('heroRightLabel').textContent = 'Household — Net';
      $('heroRightAmount').textContent = fmtMoney(householdNet, 0);
      $('heroRightSuffix').textContent = '/ year';

      const periods = [
        { name:'Weekly', gross: householdGross/52, net: householdNet/52 || 0 },
        { name:'Biweekly', gross: householdGross/26, net: householdNet/26 || 0 },
        { name:'Semi‑monthly', gross: householdGross/24, net: householdNet/24 || 0 },
        { name:'Monthly', gross: householdGross/12, net: householdNet/12 || 0 },
        { name:'Annual', gross: householdGross, net: householdNet, highlight:true }
      ];
      breakdownBody.innerHTML = periods.map(p => `<tr${p.highlight?' class="highlight"':''}><td>${p.name}</td><td>${fmtMoney(p.gross,0)}</td><td class="net${p.net<0?' negative':''}">${fmtMoney(p.net,0)}</td></tr>`).join('');

      const personRows = rows.map(r => `<div class="trow"><span class="k">↳ ${escapeHtml(r.person.name)} (${r.person.jobs.length} job${r.person.jobs.length>1?'s':''}${r.t.numChildren>0?`, ${r.t.numChildren} ${r.t.numChildren===1?'child':'children'}`:''})</span><span class="v">${fmtMoney(r.t.grossAnnual,0)} gross → ${fmtMoney(r.t.netAnnual,0)} net</span></div>`).join('');
      const householdCtc = rows.reduce((s,r) => s + r.t.ctcApplied + r.t.stateChildCreditApplied, 0);

      taxDetail.innerHTML = `
        ${personRows}
        <div class="trow total"><span class="k">Combined tax (federal + state + FICA, after credits)</span><span class="v">${fmtMoney(householdTax,0)}</span></div>
        ${householdCtc>0?`<div class="trow"><span class="k">↳ includes child tax credits totaling</span><span class="v">-${fmtMoney(householdCtc,0)}</span></div>`:''}
        <div class="trow"><span class="k">Household effective tax rate</span><span class="v">${fmt(householdGross>0?householdTax/householdGross*100:0,1)}%</span></div>
        <div class="trow keep"><span class="k">Household take‑home</span><span class="v">${fmt(householdGross>0?householdNet/householdGross*100:100,1)}%</span></div>`;
      infoBanner.style.display = 'none';
      warnBanner.style.display = householdNet < 0 ? '' : 'none';
      if (householdNet < 0) warnBanner.textContent = 'Combined household taxes and deductions currently exceed combined gross pay.';
    }
    pulseHeroBeam();
  }

  // ---------- event delegation ----------
  peopleContainer.addEventListener('input', handleFieldEvent);
  peopleContainer.addEventListener('change', handleFieldEvent);
  peopleContainer.addEventListener('click', handleClickEvent);

  function handleFieldEvent(e){
    const t = e.target;
    if (!t.dataset || !t.dataset.field) return;
    const scope = t.dataset.scope;
    if (scope === 'person'){
      const person = findPerson(t.dataset.person);
      if (!person) return;
      const field = t.dataset.field;
      if (field === 'name'){
        person.name = t.value;
        renderViewOptions();
      } else if (['retPct','healthAnnual','hsaAnnual','otherAnnual','fedOverridePct','stateOverridePct','numChildren','stateCreditPerChild'].includes(field)){
        person[field] = t.value;
      } else if (field === 'filingStatus' || field === 'state'){
        person[field] = t.value;
      }
      renderView();
    } else if (scope === 'job'){
      const found = findJobAndPerson(t.dataset.job);
      if (!found) return;
      const job = found.job;
      const field = t.dataset.field;
      if (field === 'label'){
        job.label = t.value;
        renderViewOptions();
      } else if (field === 'salary'){
        job.annualSalary = Math.max(0, parseNum(t.value));
        syncJobHourlyDisplay(job);
        pulseJobBeam(job.id);
      } else if (field === 'hourly'){
        const sch = jobSchedule(job);
        job.annualSalary = Math.max(0, annualFromHourly(parseNum(t.value), sch));
        syncJobSalaryDisplay(job);
        pulseJobBeam(job.id);
      } else if (['hoursPerWeek','daysPerWeek','weeksPerYear'].includes(field)){
        job[field] = t.value;
        syncJobHourlyDisplay(job);
        pulseJobBeam(job.id);
      } else if (['otHours','otMultiplier','ptoDays'].includes(field)){
        job[field] = t.value;
      }
      renderJobStats(job);
      renderView();
    }
  }

  function syncJobHourlyDisplay(job){
    const block = peopleContainer.querySelector(`.job-block[data-job="${job.id}"]`);
    if (!block) return;
    const hourlyEl = block.querySelector('[data-field="hourly"]');
    if (hourlyEl && document.activeElement !== hourlyEl){
      hourlyEl.value = fmt(hourlyFromAnnual(job.annualSalary, jobSchedule(job)), 2);
    }
  }
  function syncJobSalaryDisplay(job){
    const block = peopleContainer.querySelector(`.job-block[data-job="${job.id}"]`);
    if (!block) return;
    const salaryEl = block.querySelector('[data-field="salary"]');
    if (salaryEl && document.activeElement !== salaryEl){
      salaryEl.value = fmt(job.annualSalary, 0);
    }
  }
  function pulseJobBeam(jobId){
    const beam = peopleContainer.querySelector(`[data-jobbeam="${jobId}"]`);
    if (!beam) return;
    beam.classList.add('pulse');
    setTimeout(()=> beam.classList.remove('pulse'), 320);
  }

  function handleClickEvent(e){
    const t = e.target.closest('[data-action]');
    if (!t) return;
    const action = t.dataset.action;
    if (action === 'remove-person'){
      if (people.length <= 1) return;
      people = people.filter(p => p.id !== t.dataset.person);
      rebuildAfterStructuralChange();
    } else if (action === 'add-job'){
      const person = findPerson(t.dataset.person);
      if (!person) return;
      person.jobs.push(createJob('New job'));
      rebuildAfterStructuralChange();
    } else if (action === 'remove-job'){
      const person = findPerson(t.dataset.person);
      if (!person || person.jobs.length <= 1) return;
      person.jobs = person.jobs.filter(j => j.id !== t.dataset.job);
      rebuildAfterStructuralChange();
    } else if (action === 'toggle-senior'){
      const person = findPerson(t.dataset.person);
      if (!person) return;
      person.seniorOn = !person.seniorOn;
      rebuildAfterStructuralChange();
    } else if (action === 'toggle-override'){
      const person = findPerson(t.dataset.person);
      if (!person) return;
      person.overrideOn = !person.overrideOn;
      rebuildAfterStructuralChange();
    } else if (action === 'toggle-ot'){
      const found = findJobAndPerson(t.dataset.job);
      if (!found) return;
      found.job.otOn = !found.job.otOn;
      rebuildAfterStructuralChange();
    } else if (action === 'toggle-ot-include'){
      const found = findJobAndPerson(t.dataset.job);
      if (!found) return;
      found.job.otIncludeOn = !found.job.otIncludeOn;
      rebuildAfterStructuralChange();
    }
  }

  function rebuildAfterStructuralChange(){
    renderPeopleEditor();
    renderAllJobStats();
    renderViewOptions();
    renderView();
    renderComparatorProfiles();
  }

  $('addPersonBtn').addEventListener('click', () => {
    people.push(createPerson('Person ' + (people.length + 1)));
    rebuildAfterStructuralChange();
  });

  $('ssWageBaseGlobal').addEventListener('input', renderView);

  // ---------- comparator ----------
  const cmpProfile = $('cmpProfile'), cmpAType = $('cmpAType'), cmpAVal = $('cmpAVal');
  const cmpBType = $('cmpBType'), cmpBVal = $('cmpBVal');
  const cmpResult = $('cmpResult'), cmpBig = $('cmpBig'), cmpSub = $('cmpSub'), cmpSub2 = $('cmpSub2');

  function renderComparatorProfiles(){
    const prev = cmpProfile.value;
    let html = `<option value="standalone">Standalone (Single, no deductions)</option>`;
    people.forEach(p => { html += `<option value="person:${p.id}">Use ${escapeHtml(p.name)}'s profile</option>`; });
    cmpProfile.innerHTML = html;
    const stillValid = Array.from(cmpProfile.options).some(o => o.value === prev);
    cmpProfile.value = stillValid ? prev : 'standalone';
  }

  function comparatorScheduleDefault(){ return { hoursPerWeek: 40, daysPerWeek: 5, weeksPerYear: 52 }; }
  function cmpToAnnual(type, val, sch){ return type === 'hourly' ? annualFromHourly(Math.max(0,val), sch) : Math.max(0,val); }

  // "Standalone" evaluates both offers as a plain single filer with zero
  // deductions; picking a person instead reuses their actual filing
  // status/state/deductions via computeTaxesForPerson(person, override), so
  // the comparison reflects what a raise would really net them.
  function cmpProfilePerson(){
    const v = cmpProfile.value;
    if (v === 'standalone') return null;
    return findPerson(v.slice(7));
  }

  function renderComparator(){
    const sch = comparatorScheduleDefault();
    const aAnnual = cmpToAnnual(cmpAType.value, parseNum(cmpAVal.value), sch);
    const bAnnual = cmpToAnnual(cmpBType.value, parseNum(cmpBVal.value), sch);
    const diff = bAnnual - aAnnual;
    const pct = aAnnual !== 0 ? (diff/aAnnual)*100 : 0;
    const positive = diff >= 0;
    cmpResult.classList.toggle('negative', !positive);
    cmpBig.textContent = (positive?'+':'−') + fmtMoney(Math.abs(diff),0);
    cmpSub.textContent = `Offer B pays ${fmt(Math.abs(pct),1)}% ${positive?'more':'less'} annually than Offer A ` +
      `(${fmtMoney(aAnnual,0)} vs ${fmtMoney(bAnnual,0)}/yr — ${fmtMoney(hourlyFromAnnual(aAnnual,sch),2)}/hr vs ${fmtMoney(hourlyFromAnnual(bAnnual,sch),2)}/hr).`;

    const profilePerson = cmpProfilePerson();
    let taxA, taxB, profileLabel;
    if (profilePerson){
      taxA = computeTaxesForPerson(profilePerson, aAnnual);
      taxB = computeTaxesForPerson(profilePerson, bAnnual);
      profileLabel = profilePerson.name + "'s";
    } else {
      const fake = { filingStatus:'single', state:'CA', seniorOn:false, overrideOn:false, fedOverridePct:0, stateOverridePct:0, retPct:0, healthAnnual:0, hsaAnnual:0, otherAnnual:0, numChildren:0, stateCreditPerChild:0 };
      taxA = computeTaxesForPerson(fake, aAnnual);
      taxB = computeTaxesForPerson(fake, bAnnual);
      profileLabel = 'a standalone Single filer, no deductions,';
    }
    const netDiff = taxB.netAnnual - taxA.netAnnual;
    cmpSub2.textContent = `As ${profileLabel} income: ${fmtMoney(taxA.netAnnual,0)}/yr net vs ${fmtMoney(taxB.netAnnual,0)}/yr net — ${netDiff>=0?'+':'-'}${fmtMoney(Math.abs(netDiff),0)}/yr take‑home.`;
  }
  [cmpProfile,cmpAType,cmpAVal,cmpBType,cmpBVal].forEach(el => { el.addEventListener('input', renderComparator); el.addEventListener('change', renderComparator); });

  // ---------- save / reset ----------
  const saveBtn = $('saveBtn'), resetBtn = $('resetBtn'), saveNote = $('saveNote');
  const STORAGE_KEY = 'payLedgerHousehold_v3';

  saveBtn.addEventListener('click', () => {
    try{
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ people, currentView, ssWageBase: $('ssWageBaseGlobal').value }));
      saveNote.textContent = 'Saved to this browser at ' + new Date().toLocaleTimeString();
    }catch(e){ saveNote.textContent = 'Could not save (storage unavailable).'; }
  });

  resetBtn.addEventListener('click', () => {
    people = [ createPerson('Person 1') ];
    currentView = 'household';
    $('ssWageBaseGlobal').value = 184500;
    rebuildAfterStructuralChange();
    renderComparator();
    saveNote.textContent = 'Reset to defaults (not saved).';
  });

  function loadSaved(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (Array.isArray(d.people) && d.people.length){
        people = d.people.map(p => ({
          id: p.id || makeId(), name: p.name || 'Person', filingStatus: p.filingStatus || 'single', state: p.state || 'CA',
          seniorOn: !!p.seniorOn, overrideOn: !!p.overrideOn, fedOverridePct: p.fedOverridePct ?? 12, stateOverridePct: p.stateOverridePct ?? 4,
          retPct: p.retPct ?? 5, healthAnnual: p.healthAnnual ?? 2400, hsaAnnual: p.hsaAnnual ?? 0, otherAnnual: p.otherAnnual ?? 0,
          numChildren: p.numChildren ?? 0, stateCreditPerChild: p.stateCreditPerChild ?? 0,
          jobs: (Array.isArray(p.jobs) && p.jobs.length) ? p.jobs.map(j => ({
            id: j.id || makeId(), label: j.label || 'Job', annualSalary: j.annualSalary ?? 65000,
            hoursPerWeek: j.hoursPerWeek ?? 40, daysPerWeek: j.daysPerWeek ?? 5, weeksPerYear: j.weeksPerYear ?? 52,
            otOn: !!j.otOn, otIncludeOn: !!j.otIncludeOn, otHours: j.otHours ?? 5, otMultiplier: j.otMultiplier ?? 1.5, ptoDays: j.ptoDays ?? 15
          })) : [createJob('Main job')]
        }));
      }
      if (d.currentView) currentView = d.currentView;
      if (d.ssWageBase) $('ssWageBaseGlobal').value = d.ssWageBase;
      saveNote.textContent = 'Loaded saved household from this browser.';
    }catch(e){ /* ignore */ }
  }

  // ---------- init ----------
  loadSaved();
  renderPeopleEditor();
  renderAllJobStats();
  renderViewOptions();
  renderComparatorProfiles();
  renderView();
  renderComparator();

})();
