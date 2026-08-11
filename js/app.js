(function(){
  "use strict";

  var SHARED_ADDRESS = '20 Sisley Avenue\nNottingham\nNG9 7HT';

  var ROLE_TEXT = {
    music: { tagline: 'Singer-Songwriter', description: 'Live performance fee', signoff: 'Thanks for having me!' },
    elearning: { tagline: 'E-Learning Designer', description: 'E-learning design services', signoff: 'Thank you for the opportunity to work together.' }
  };

  var DEFAULTS = {
    gadd: {
      businessName: 'George Gadd',
      address: SHARED_ADDRESS,
      email: 'georgewtgadd@gmail.com',
      phone: '',
      currency: '£',
      accountName: '',
      bankName: '',
      sortCode: '',
      accountNumber: '',
      paymentTerms: 'Payment due within 14 days of the invoice date.',
      agentFeePercent: 10,
      lastRole: 'music',
      roles: {
        music: { invoicePrefix: 'GG', nextNumber: 68 },
        elearning: { invoicePrefix: 'GGE', nextNumber: 1 }
      }
    },
    tvparty: {
      businessName: 'TV Party Tonight!',
      tagline: 'TV Theme Party Band',
      address: SHARED_ADDRESS,
      email: 'georgewtgadd@gmail.com',
      phone: '',
      currency: '£',
      accountName: '',
      bankName: '',
      sortCode: '',
      accountNumber: '',
      paymentTerms: 'Payment due within 14 days of the invoice date.',
      agentFeePercent: 10,
      defaultDescription: 'Live performance fee',
      invoicePrefix: 'TVPT',
      nextNumber: 1
    }
  };

  var state = {
    persona: 'gadd',
    settings: { gadd: null, tvparty: null },
    contacts: [],
    history: [],
    invoice: {}
  };

  function $(id){ return document.getElementById(id); }

  /* AppStorage (window.AppStorage) and Auth (window.Auth) are defined in js/storage.js,
     loaded before this file — see that file for how persistence is chosen. */

  function todayISO(){
    var d = new Date();
    var off = d.getTimezoneOffset();
    var local = new Date(d.getTime() - off * 60000);
    return local.toISOString().slice(0, 10);
  }

  function pad4(n){
    n = parseInt(n, 10) || 1;
    var s = String(n);
    while(s.length < 4){ s = '0' + s; }
    return s;
  }

  function escapeHtml(str){
    return String(str == null ? '' : str).replace(/[&<>"']/g, function(s){
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[s];
    });
  }

  function placeholder(val, ph){
    var v = (val == null ? '' : String(val)).trim();
    return v ? escapeHtml(v) : '<span class="ph">' + escapeHtml(ph) + '</span>';
  }

  function formatDate(iso){
    if(!iso) return '';
    var parts = iso.split('-').map(Number);
    var dt = new Date(parts[0], parts[1] - 1, parts[2]);
    if(isNaN(dt.getTime())) return '';
    return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function formatAmount(amount, symbol){
    var n = Number(amount);
    var sym = symbol || '£';
    if(isNaN(n)) n = 0;
    return sym + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function calcTotals(inv){
    var gross = Number(inv.amount) || 0;

    var additionLines = [];
    var travel = inv.additions.travel;
    if(travel.enabled){
      var tAmt = Number(travel.amount) || 0;
      if(tAmt > 0) additionLines.push({ label: 'Travel', amount: tAmt });
    }
    var addOther = inv.additions.other;
    if(addOther.enabled){
      var aoAmt = Number(addOther.amount) || 0;
      if(aoAmt > 0) additionLines.push({ label: addOther.label || 'Other', amount: aoAmt });
    }
    var totalAdditions = additionLines.reduce(function(sum, l){ return sum + l.amount; }, 0);

    var deductionLines = [];
    var agent = inv.deductions.agent;
    if(agent.enabled){
      var agentAmt = 0, agentLabel = 'Agent fee';
      if(agent.mode === 'flat'){
        agentAmt = Number(agent.value) || 0;
      } else {
        var pct = Number(agent.value) || 0;
        agentAmt = gross * pct / 100;
        agentLabel = 'Agent fee (' + pct + '%)';
      }
      if(agentAmt > 0) deductionLines.push({ label: agentLabel, amount: agentAmt });
    }
    var carbon = inv.deductions.carbon;
    if(carbon.enabled){
      var camt = Number(carbon.amount) || 0;
      if(camt > 0) deductionLines.push({ label: 'Carbon offset levy', amount: camt });
    }
    var dedOther = inv.deductions.other;
    if(dedOther.enabled){
      var doAmt = Number(dedOther.amount) || 0;
      if(doAmt > 0) deductionLines.push({ label: dedOther.label || 'Other', amount: doAmt });
    }
    var totalDeductions = deductionLines.reduce(function(sum, l){ return sum + l.amount; }, 0);

    var net = gross + totalAdditions - totalDeductions;
    return { gross: gross, additionLines: additionLines, deductionLines: deductionLines, net: net };
  }

  /* ---------- Settings persistence ---------- */
  async function loadSettings(persona){
    var fresh = JSON.parse(JSON.stringify(DEFAULTS[persona]));
    try {
      var res = await AppStorage.get('settings:' + persona, false);
      if(res && res.value){
        var parsed = JSON.parse(res.value);
        var key;
        for(key in parsed){
          if(persona === 'gadd' && key === 'roles'){
            fresh.roles.music = Object.assign({}, DEFAULTS.gadd.roles.music, (parsed.roles && parsed.roles.music) || {});
            fresh.roles.elearning = Object.assign({}, DEFAULTS.gadd.roles.elearning, (parsed.roles && parsed.roles.elearning) || {});
          } else {
            fresh[key] = parsed[key];
          }
        }
      }
    } catch(e){ /* nothing saved yet — use defaults */ }
    return fresh;
  }

  async function saveSettings(persona, obj){
    try {
      await AppStorage.set('settings:' + persona, JSON.stringify(obj), false);
      return true;
    } catch(e){
      console.error('Failed to save settings', e);
      return false;
    }
  }

  /* ---------- Saved clients (contacts) ---------- */
  async function loadContactsList(){
    try {
      var res = await AppStorage.get('contacts', false);
      if(res && res.value){ return JSON.parse(res.value) || []; }
    } catch(e){ /* none saved yet */ }
    return [];
  }

  async function saveContactsList(){
    try {
      await AppStorage.set('contacts', JSON.stringify(state.contacts), false);
      return true;
    } catch(e){
      console.error('Failed to save contacts', e);
      return false;
    }
  }

  function populateSavedClientSelect(){
    var sel = $('f-savedClient');
    var current = sel.value;
    sel.innerHTML = '<option value="">— Select a saved client —</option>';
    state.contacts.slice().sort(function(a,b){ return a.name.localeCompare(b.name); }).forEach(function(c){
      var opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name;
      sel.appendChild(opt);
    });
    sel.value = (current && state.contacts.some(function(c){ return c.id === current; })) ? current : '';
  }

  function onSelectContact(){
    var id = $('f-savedClient').value;
    if(!id) return;
    var c = state.contacts.find(function(x){ return x.id === id; });
    if(!c) return;
    state.invoice.clientName = c.name;
    state.invoice.clientAddress = c.address;
    state.invoice.clientEmail = c.email || '';
    syncFormFromState();
    renderPreview();
    setStatus('Loaded ' + c.name + '.', true);
  }

  async function onSaveClient(){
    readFormIntoState();
    var name = state.invoice.clientName.trim();
    if(!name){ setStatus('Add a client name before saving.', false); return; }
    var existing = state.contacts.find(function(c){ return c.name.toLowerCase() === name.toLowerCase(); });
    if(existing){
      existing.address = state.invoice.clientAddress;
      existing.email = state.invoice.clientEmail;
    } else {
      state.contacts.push({ id: 'c' + Date.now(), name: name, address: state.invoice.clientAddress, email: state.invoice.clientEmail });
    }
    var ok = await saveContactsList();
    populateSavedClientSelect();
    setStatus(ok ? ('Saved "' + name + '" for quick reference.') : 'Could not save client — please try again.', ok);
  }

  function renderContactsList(){
    var wrap = $('contactsList');
    if(!state.contacts.length){
      wrap.innerHTML = '<p class="contacts-empty">No saved clients yet — use "Save this client" on the form.</p>';
      return;
    }
    wrap.innerHTML = state.contacts.slice().sort(function(a,b){ return a.name.localeCompare(b.name); }).map(function(c){
      var details = [c.address, c.email].filter(Boolean).join('\n');
      return '<div class="contact-row"><div class="contact-row-info"><strong>' + escapeHtml(c.name) + '</strong><span>' + escapeHtml(details) + '</span></div><button type="button" class="contact-remove" data-id="' + escapeHtml(c.id) + '">Remove</button></div>';
    }).join('');
  }

  function openContactsModal(){
    renderContactsList();
    $('contactsModal').classList.remove('hidden');
  }
  function closeContactsModal(){
    $('contactsModal').classList.add('hidden');
  }

  /* ---------- Invoice history ---------- */
  async function loadHistory(){
    try {
      var res = await AppStorage.get('invoiceHistory', false);
      if(res && res.value){ return JSON.parse(res.value) || []; }
    } catch(e){ /* none logged yet */ }
    return [];
  }

  async function saveHistoryList(){
    try {
      await AppStorage.set('invoiceHistory', JSON.stringify(state.history), false);
      return true;
    } catch(e){
      console.error('Failed to save history', e);
      return false;
    }
  }

  function personaLabel(persona, role){
    if(persona === 'gadd'){ return 'George Gadd — ' + ROLE_TEXT[role || 'music'].tagline; }
    return 'TV Party Tonight!';
  }

  function logInvoice(){
    var s = state.settings[state.persona];
    var inv = state.invoice;
    var totals = calcTotals(inv);
    var entry = {
      id: state.persona + ':' + (inv.role || '') + ':' + inv.invoiceNumber,
      persona: state.persona,
      role: inv.role || null,
      invoiceNumber: inv.invoiceNumber,
      date: inv.date,
      clientName: inv.clientName,
      clientAddress: inv.clientAddress,
      clientEmail: inv.clientEmail,
      description: inv.description,
      amount: totals.gross,
      deductions: JSON.parse(JSON.stringify(inv.deductions)),
      net: totals.net,
      currency: s.currency,
      loggedAt: new Date().toISOString()
    };
    var idx = -1;
    for(var i = 0; i < state.history.length; i++){
      if(state.history[i].id === entry.id){ idx = i; break; }
    }
    if(idx !== -1){ state.history[idx] = entry; } else { state.history.push(entry); }
    saveHistoryList();
  }

  function renderHistoryList(){
    var wrap = $('historyList');
    if(!state.history.length){
      wrap.innerHTML = '<p class="contacts-empty">No invoices logged yet — they\'ll appear here after you download or email one.</p>';
      return;
    }
    var sorted = state.history.slice().sort(function(a,b){ return (b.date || '').localeCompare(a.date || ''); });
    var groups = {};
    var order = [];
    sorted.forEach(function(h){
      var year = (h.date || '').slice(0,4) || 'Undated';
      if(!groups[year]){ groups[year] = []; order.push(year); }
      groups[year].push(h);
    });
    var html = '';
    order.forEach(function(year){
      html += '<div class="history-year">' + escapeHtml(year) + '</div>';
      groups[year].forEach(function(h){
        html += '<div class="history-row">' +
          '<div class="history-row-info">' +
            '<strong>' + escapeHtml(h.invoiceNumber) + ' — ' + escapeHtml(h.clientName || 'Unnamed client') + '</strong>' +
            '<span>' + formatDate(h.date) + ' &middot; ' + escapeHtml(personaLabel(h.persona, h.role)) + ' &middot; ' + formatAmount(h.net, h.currency) + '</span>' +
          '</div>' +
          '<div class="history-row-actions">' +
            '<button type="button" class="icon-btn history-load" data-id="' + escapeHtml(h.id) + '">Load</button>' +
            '<button type="button" class="contact-remove history-remove" data-id="' + escapeHtml(h.id) + '">Remove</button>' +
          '</div>' +
        '</div>';
      });
    });
    wrap.innerHTML = html;
  }

  function loadFromHistory(entry){
    state.persona = entry.persona;
    var tabs = document.querySelectorAll('.tab-btn');
    for(var i = 0; i < tabs.length; i++){
      tabs[i].classList.toggle('active', tabs[i].getAttribute('data-persona') === entry.persona);
    }
    $('roleToggleWrap').style.display = entry.persona === 'gadd' ? 'block' : 'none';
    state.invoice = {
      date: entry.date,
      clientName: entry.clientName,
      clientAddress: entry.clientAddress,
      clientEmail: entry.clientEmail || '',
      amount: entry.amount,
      description: entry.description,
      invoiceNumber: entry.invoiceNumber,
      role: entry.role,
      deductions: normalizeDeductions(entry.deductions),
      additions: normalizeAdditions(entry.additions)
    };
    syncFormFromState();
    renderPreview();
    closeHistoryModal();
    setStatus('Loaded invoice ' + entry.invoiceNumber + '.', true);
  }

  function openHistoryModal(){ renderHistoryList(); $('historyModal').classList.remove('hidden'); }
  function closeHistoryModal(){ $('historyModal').classList.add('hidden'); }

  /* ---------- Invoice sequence helpers ---------- */
  function getActiveSeq(){
    if(state.persona === 'gadd'){
      var role = state.invoice.role || state.settings.gadd.lastRole || 'music';
      return state.settings.gadd.roles[role];
    }
    return state.settings.tvparty;
  }

  function deductionsFor(agentPct){
    return {
      agent: { enabled: false, mode: 'percent', value: agentPct || '' },
      carbon: { enabled: false, amount: '' },
      other: { enabled: false, label: 'Other', amount: '' }
    };
  }

  function additionsFor(){
    return {
      travel: { enabled: false, amount: '' },
      other: { enabled: false, label: 'Other', amount: '' }
    };
  }

  function normalizeDeductions(d){
    d = d || {};
    var agent = d.agent || {};
    var value = agent.value !== undefined ? agent.value : agent.percent;
    return {
      agent: { enabled: !!agent.enabled, mode: agent.mode || 'percent', value: value || '' },
      carbon: { enabled: !!(d.carbon && d.carbon.enabled), amount: (d.carbon && d.carbon.amount) || '' },
      other: { enabled: !!(d.other && d.other.enabled), label: (d.other && d.other.label) || 'Other', amount: (d.other && d.other.amount) || '' }
    };
  }

  function normalizeAdditions(a){
    a = a || {};
    return {
      travel: { enabled: !!(a.travel && a.travel.enabled), amount: (a.travel && a.travel.amount) || '' },
      other: { enabled: !!(a.other && a.other.enabled), label: (a.other && a.other.label) || 'Other', amount: (a.other && a.other.amount) || '' }
    };
  }

  function newInvoiceDefaults(persona){
    if(persona === 'gadd'){
      var role = state.settings.gadd.lastRole || 'music';
      var seq = state.settings.gadd.roles[role];
      return {
        date: todayISO(), clientName: '', clientAddress: '', clientEmail: '',
        amount: '', description: ROLE_TEXT[role].description,
        invoiceNumber: seq.invoicePrefix + '-' + pad4(seq.nextNumber),
        role: role,
        deductions: deductionsFor(state.settings.gadd.agentFeePercent),
        additions: additionsFor()
      };
    }
    var s = state.settings.tvparty;
    return {
      date: todayISO(), clientName: '', clientAddress: '', clientEmail: '',
      amount: '', description: s.defaultDescription || '',
      invoiceNumber: s.invoicePrefix + '-' + pad4(s.nextNumber),
      role: null,
      deductions: deductionsFor(s.agentFeePercent),
      additions: additionsFor()
    };
  }

  /* ---------- Form <-> state sync ---------- */
  function updateCurrencySymbols(){
    var sym = state.settings[state.persona].currency || '£';
    var els = document.querySelectorAll('.currency-symbol');
    for(var i = 0; i < els.length; i++){ els[i].textContent = sym; }
  }

  function syncFormFromState(){
    var inv = state.invoice;
    $('f-date').value = inv.date;
    $('f-clientName').value = inv.clientName;
    $('f-clientAddress').value = inv.clientAddress;
    $('f-clientEmail').value = inv.clientEmail;
    $('f-amount').value = inv.amount;
    $('f-description').value = inv.description;
    $('f-invoiceNumber').value = inv.invoiceNumber;

    $('f-travel-on').checked = inv.additions.travel.enabled;
    $('f-travel-amount').value = inv.additions.travel.amount;
    $('f-addother-on').checked = inv.additions.other.enabled;
    $('f-addother-label').value = inv.additions.other.label;
    $('f-addother-amount').value = inv.additions.other.amount;

    $('f-agent-on').checked = inv.deductions.agent.enabled;
    $('f-agent-mode').value = inv.deductions.agent.mode;
    $('f-agent-value').value = inv.deductions.agent.value;
    $('f-agent-value').placeholder = inv.deductions.agent.mode === 'percent' ? '10' : '0.00';
    $('f-carbon-on').checked = inv.deductions.carbon.enabled;
    $('f-carbon-amount').value = inv.deductions.carbon.amount;
    $('f-dedother-on').checked = inv.deductions.other.enabled;
    $('f-dedother-label').value = inv.deductions.other.label;
    $('f-dedother-amount').value = inv.deductions.other.amount;

    updateCurrencySymbols();
    syncRoleButtons(inv.role);
  }

  function readFormIntoState(){
    state.invoice.date = $('f-date').value;
    state.invoice.clientName = $('f-clientName').value;
    state.invoice.clientAddress = $('f-clientAddress').value;
    state.invoice.clientEmail = $('f-clientEmail').value;
    state.invoice.amount = $('f-amount').value;
    state.invoice.description = $('f-description').value;
    state.invoice.invoiceNumber = $('f-invoiceNumber').value;
    state.invoice.additions = {
      travel: { enabled: $('f-travel-on').checked, amount: $('f-travel-amount').value },
      other: { enabled: $('f-addother-on').checked, label: $('f-addother-label').value.trim() || 'Other', amount: $('f-addother-amount').value }
    };
    state.invoice.deductions = {
      agent: { enabled: $('f-agent-on').checked, mode: $('f-agent-mode').value, value: $('f-agent-value').value },
      carbon: { enabled: $('f-carbon-on').checked, amount: $('f-carbon-amount').value },
      other: { enabled: $('f-dedother-on').checked, label: $('f-dedother-label').value.trim() || 'Other', amount: $('f-dedother-amount').value }
    };
  }

  /* ---------- Role toggle (George Gadd) ---------- */
  function syncRoleButtons(role){
    var btns = document.querySelectorAll('.role-btn');
    for(var i = 0; i < btns.length; i++){
      btns[i].classList.toggle('active', btns[i].getAttribute('data-role') === role);
    }
  }

  function setRole(role){
    if(state.invoice.role === role) return;
    state.invoice.role = role;
    var seq = state.settings.gadd.roles[role];
    state.invoice.invoiceNumber = seq.invoicePrefix + '-' + pad4(seq.nextNumber);
    var knownDefaults = [ROLE_TEXT.music.description, ROLE_TEXT.elearning.description, ''];
    if(knownDefaults.indexOf(state.invoice.description.trim()) !== -1){
      state.invoice.description = ROLE_TEXT[role].description;
    }
    state.settings.gadd.lastRole = role;
    saveSettings('gadd', state.settings.gadd);
    syncFormFromState();
    renderPreview();
  }

  /* ---------- Templates ---------- */
  function bankLine(s){
    var parts = [];
    if(s.accountName) parts.push(escapeHtml(s.accountName));
    if(s.sortCode) parts.push('Sort code ' + escapeHtml(s.sortCode));
    if(s.accountNumber) parts.push('Account ' + escapeHtml(s.accountNumber));
    if(s.bankName) parts.push(escapeHtml(s.bankName));
    return parts.length ? parts.join(' &middot; ') : '<span class="ph">Add your payment details in Settings</span>';
  }

  function additionRows(totals, symbol){
    return totals.additionLines.map(function(l){
      return '<tr class="i-row-addition"><td>' + escapeHtml(l.label) + '</td><td class="num">+' + formatAmount(l.amount, symbol) + '</td></tr>';
    }).join('');
  }

  function deductionRows(totals, symbol){
    return totals.deductionLines.map(function(l){
      return '<tr class="i-row-deduction"><td>Less: ' + escapeHtml(l.label) + '</td><td class="num">-' + formatAmount(l.amount, symbol) + '</td></tr>';
    }).join('');
  }

  function gaddTemplate(s, inv){
    var roleText = ROLE_TEXT[inv.role || 'music'];
    var totals = calcTotals(inv);
    return '' +
      '<div class="i-header">' +
        '<div class="i-brand">' +
          '<img class="i-logo" src="assets/george-gadd-logo.png" alt="' + escapeHtml(s.businessName || 'George Gadd') + '">' +
          '<div class="i-tagline">' + escapeHtml(roleText.tagline) + '</div>' +
        '</div>' +
        '<div class="i-stamp">' +
          '<div class="i-stamp-label">Invoice</div>' +
          '<div class="i-stamp-number">No. ' + escapeHtml(inv.invoiceNumber) + '</div>' +
          '<div class="i-stamp-date">' + formatDate(inv.date) + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="i-rule"></div>' +
      '<div class="i-parties">' +
        '<div>' +
          '<div class="i-label">From</div>' +
          '<div class="i-partytext">' + placeholder(s.address, 'Add your address in Settings').replace(/\n/g,'<br>') +
            (s.email ? '<br>' + escapeHtml(s.email) : '') +
            (s.phone ? '<br>' + escapeHtml(s.phone) : '') +
          '</div>' +
        '</div>' +
        '<div>' +
          '<div class="i-label">Bill to</div>' +
          '<div class="i-partytext">' + placeholder(inv.clientName, 'Client name') + '<br>' + placeholder(inv.clientAddress, 'Client address').replace(/\n/g,'<br>') + (inv.clientEmail ? '<br>' + escapeHtml(inv.clientEmail) : '') + '</div>' +
        '</div>' +
      '</div>' +
      '<table class="i-table">' +
        '<thead><tr><th>Description</th><th class="num">Amount</th></tr></thead>' +
        '<tbody>' +
          '<tr><td>' + placeholder(inv.description, roleText.description) + '</td><td class="num">' + formatAmount(totals.gross, s.currency) + '</td></tr>' +
          additionRows(totals, s.currency) +
          deductionRows(totals, s.currency) +
        '</tbody>' +
      '</table>' +
      '<div class="i-total"><span>Total due</span><span>' + formatAmount(totals.net, s.currency) + '</span></div>' +
      '<div class="i-footer">' +
        '<p>' + escapeHtml(s.paymentTerms || 'Payment due within 14 days of the invoice date.') + '</p>' +
        '<p>' + bankLine(s) + '</p>' +
        '<p class="i-signoff">' + escapeHtml(roleText.signoff) + '</p>' +
      '</div>';
  }

  function tvpartyTemplate(s, inv){
    var totals = calcTotals(inv);
    return '' +
      '<div class="i-band">' +
        '<div class="i-bandname">' + escapeHtml(s.businessName || 'TV Party Tonight!') + '</div>' +
        '<div class="i-bandtag">' + escapeHtml(s.tagline || 'TV Theme Party Band') + '</div>' +
        '<svg class="i-tv-badge" viewBox="0 0 120 108" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="TV">' +
          '<line x1="42" y1="20" x2="26" y2="4" stroke="#ef5335" stroke-width="4" stroke-linecap="round"/>' +
          '<line x1="78" y1="20" x2="94" y2="4" stroke="#ef5335" stroke-width="4" stroke-linecap="round"/>' +
          '<rect x="8" y="20" width="104" height="76" rx="12" fill="#ef5335"/>' +
          '<rect x="8" y="20" width="104" height="76" rx="12" fill="none" stroke="#fdfcf9" stroke-width="3"/>' +
          '<rect x="20" y="32" width="66" height="50" rx="6" fill="#131a2e"/>' +
          '<circle cx="98" cy="48" r="6" fill="#fdfcf9"/>' +
          '<circle cx="98" cy="68" r="6" fill="#fdfcf9"/>' +
          '<text x="53" y="53" font-family="Arial, Helvetica, sans-serif" font-weight="900" font-size="13" fill="#f6b93b" text-anchor="middle">GIG</text>' +
          '<text x="53" y="70" font-family="Arial, Helvetica, sans-serif" font-weight="900" font-size="10" fill="#f6b93b" text-anchor="middle">INVOICE</text>' +
        '</svg>' +
      '</div>' +
      '<div class="i-ticketrow">' +
        '<div class="i-ticketmeta">' +
          '<div>No. ' + escapeHtml(inv.invoiceNumber) + '</div>' +
          '<div>' + formatDate(inv.date) + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="i-parties">' +
        '<div>' +
          '<div class="i-label">From</div>' +
          '<div class="i-partytext">' + placeholder(s.address, 'Add your address in Settings').replace(/\n/g,'<br>') +
            (s.email ? '<br>' + escapeHtml(s.email) : '') +
            (s.phone ? '<br>' + escapeHtml(s.phone) : '') +
          '</div>' +
        '</div>' +
        '<div>' +
          '<div class="i-label">Bill to</div>' +
          '<div class="i-partytext">' + placeholder(inv.clientName, 'Client / venue name') + '<br>' + placeholder(inv.clientAddress, 'Client address').replace(/\n/g,'<br>') + (inv.clientEmail ? '<br>' + escapeHtml(inv.clientEmail) : '') + '</div>' +
        '</div>' +
      '</div>' +
      '<table class="i-table">' +
        '<thead><tr><th>Description</th><th class="num">Amount</th></tr></thead>' +
        '<tbody>' +
          '<tr><td>' + placeholder(inv.description, 'Live performance fee') + '</td><td class="num">' + formatAmount(totals.gross, s.currency) + '</td></tr>' +
          additionRows(totals, s.currency) +
          deductionRows(totals, s.currency) +
        '</tbody>' +
      '</table>' +
      '<div class="i-total"><span>Total due</span><span>' + formatAmount(totals.net, s.currency) + '</span></div>' +
      '<div class="i-stub">' +
        '<p>' + escapeHtml(s.paymentTerms || 'Payment due within 14 days of the invoice date.') + '</p>' +
        '<p class="i-bank">' + bankLine(s) + '</p>' +
        '<p class="i-signoff">Thanks for having us play — see you at the next one!</p>' +
      '</div>';
  }

  function renderPreview(){
    var persona = state.persona;
    var s = state.settings[persona];
    var inv = state.invoice;
    var el = $('invoicePreview');
    el.className = 'invoice ' + (persona === 'gadd' ? 'theme-gadd' : 'theme-tvparty');
    el.innerHTML = persona === 'gadd' ? gaddTemplate(s, inv) : tvpartyTemplate(s, inv);
  }

  /* ---------- Settings modal ---------- */
  function openSettings(){
    var persona = state.persona;
    var s = state.settings[persona];
    var isGadd = persona === 'gadd';
    $('settingsTitle').textContent = (isGadd ? 'George Gadd' : 'TV Party Tonight!') + ' — your details';
    $('fld-tagline').style.display = isGadd ? 'none' : 'block';
    $('fld-defaultDescription').style.display = isGadd ? 'none' : 'block';
    $('fld-genericSeq').style.display = isGadd ? 'none' : 'block';
    $('fld-gaddSeq').style.display = isGadd ? 'block' : 'none';

    $('s-businessName').value = s.businessName;
    $('s-address').value = s.address;
    $('s-email').value = s.email;
    $('s-phone').value = s.phone;
    $('s-currency').value = s.currency;
    $('s-accountName').value = s.accountName;
    $('s-bankName').value = s.bankName;
    $('s-sortCode').value = s.sortCode;
    $('s-accountNumber').value = s.accountNumber;
    $('s-paymentTerms').value = s.paymentTerms;
    $('s-agentFeePercent').value = s.agentFeePercent;

    if(isGadd){
      $('s-music-prefix').value = s.roles.music.invoicePrefix;
      $('s-music-next').value = s.roles.music.nextNumber;
      $('s-elearning-prefix').value = s.roles.elearning.invoicePrefix;
      $('s-elearning-next').value = s.roles.elearning.nextNumber;
    } else {
      $('s-tagline').value = s.tagline;
      $('s-defaultDescription').value = s.defaultDescription;
      $('s-invoicePrefix').value = s.invoicePrefix;
      $('s-nextNumber').value = s.nextNumber;
    }
    $('settingsModal').classList.remove('hidden');
  }

  function closeSettings(){ $('settingsModal').classList.add('hidden'); }

  async function saveSettingsFromForm(){
    var persona = state.persona;
    var s = state.settings[persona];
    var isGadd = persona === 'gadd';

    s.businessName = $('s-businessName').value.trim() || DEFAULTS[persona].businessName;
    s.address = $('s-address').value.trim();
    s.email = $('s-email').value.trim();
    s.phone = $('s-phone').value.trim();
    s.currency = $('s-currency').value.trim() || '£';
    s.accountName = $('s-accountName').value.trim();
    s.bankName = $('s-bankName').value.trim();
    s.sortCode = $('s-sortCode').value.trim();
    s.accountNumber = $('s-accountNumber').value.trim();
    s.paymentTerms = $('s-paymentTerms').value.trim();
    s.agentFeePercent = Math.max(0, parseFloat($('s-agentFeePercent').value)) || 0;

    if(isGadd){
      s.roles.music.invoicePrefix = $('s-music-prefix').value.trim() || DEFAULTS.gadd.roles.music.invoicePrefix;
      s.roles.music.nextNumber = Math.max(1, parseInt($('s-music-next').value, 10) || 1);
      s.roles.elearning.invoicePrefix = $('s-elearning-prefix').value.trim() || DEFAULTS.gadd.roles.elearning.invoicePrefix;
      s.roles.elearning.nextNumber = Math.max(1, parseInt($('s-elearning-next').value, 10) || 1);
    } else {
      s.tagline = $('s-tagline').value.trim();
      s.defaultDescription = $('s-defaultDescription').value.trim();
      s.invoicePrefix = $('s-invoicePrefix').value.trim() || DEFAULTS[persona].invoicePrefix;
      s.nextNumber = Math.max(1, parseInt($('s-nextNumber').value, 10) || 1);
    }

    var ok = await saveSettings(persona, s);
    setStatus(ok ? 'Details saved.' : 'Could not save details — please try again.', ok);
    if(ok){
      closeSettings();
      var seq = getActiveSeq();
      state.invoice.invoiceNumber = seq.invoicePrefix + '-' + pad4(seq.nextNumber);
      syncFormFromState();
      renderPreview();
    }
  }

  function setStatus(msg, ok){
    var el = $('statusMsg');
    el.textContent = msg;
    el.style.color = ok === false ? '#b3261e' : '#2f6b4f';
    if(msg){
      setTimeout(function(){ if(el.textContent === msg) el.textContent = ''; }, 4000);
    }
  }

  /* ---------- Validation ---------- */
  function validate(){
    readFormIntoState();
    var inv = state.invoice;
    if(!inv.clientName.trim()) return 'Add the client name.';
    if(!inv.clientAddress.trim()) return "Add the client's address.";
    if(!inv.amount || isNaN(Number(inv.amount)) || Number(inv.amount) <= 0) return 'Add a valid amount.';
    if(!inv.date) return 'Add the invoice date.';
    return null;
  }

  function validateForEmail(){
    var base = validate();
    if(base) return base;
    var email = state.invoice.clientEmail.trim();
    if(!email) return "Add the client's email address.";
    if(email.indexOf('@') === -1 || email.indexOf('.') === -1) return "That client email doesn't look right.";
    return null;
  }

  /* ---------- PDF export (native vector text/shapes — no screenshot step) ---------- */
  var logoImageCache = null;
  function loadLogoImage(){
    if(logoImageCache) return logoImageCache;
    logoImageCache = new Promise(function(resolve){
      var img = new Image();
      img.onload = function(){ resolve(img); };
      img.onerror = function(){ resolve(null); };
      img.src = 'assets/george-gadd-logo.png';
    });
    return logoImageCache;
  }

  function spacedCaps(text){
    return String(text == null ? '' : text).toUpperCase().split('').join(' ');
  }

  function pdfWrapLines(doc, linesArray, maxWidth){
    var out = [];
    linesArray.forEach(function(line){
      doc.splitTextToSize(line, maxWidth).forEach(function(w){ out.push(w); });
    });
    return out;
  }

  // Small retro TV icon drawn as native shapes (antenna, body, screen, dials) —
  // avoids embedding SVG, which had weak support in the old screenshot pipeline.
  function drawTvBadge(doc, x, y, w){
    var scale = w / 120;
    var CORAL = [239,83,53], NAVY = [19,26,46], CREAM = [253,252,249], MUSTARD = [246,185,59];

    doc.setDrawColor(CORAL[0],CORAL[1],CORAL[2]);
    doc.setLineWidth(1.1*scale);
    doc.line(x+42*scale, y+20*scale, x+26*scale, y+4*scale);
    doc.line(x+78*scale, y+20*scale, x+94*scale, y+4*scale);

    doc.setFillColor(CORAL[0],CORAL[1],CORAL[2]);
    doc.setDrawColor(CREAM[0],CREAM[1],CREAM[2]);
    doc.setLineWidth(0.8*scale);
    doc.roundedRect(x+8*scale, y+20*scale, 104*scale, 76*scale, 3.2*scale, 3.2*scale, 'FD');

    doc.setFillColor(NAVY[0],NAVY[1],NAVY[2]);
    doc.roundedRect(x+20*scale, y+32*scale, 66*scale, 50*scale, 1.6*scale, 1.6*scale, 'F');

    doc.setFillColor(CREAM[0],CREAM[1],CREAM[2]);
    doc.circle(x+98*scale, y+48*scale, 6*scale, 'F');
    doc.circle(x+98*scale, y+68*scale, 6*scale, 'F');

    doc.setFont('helvetica','bold');
    doc.setTextColor(MUSTARD[0],MUSTARD[1],MUSTARD[2]);
    doc.setFontSize(13*scale*2.83);
    doc.text('GIG', x+53*scale, y+53*scale, { align:'center' });
    doc.setFontSize(10*scale*2.83);
    doc.text('INVOICE', x+53*scale, y+70*scale, { align:'center' });
  }

  // Draws the full George Gadd invoice starting at startY, returns the final
  // y reached. buildGaddPdf() below calls this twice — once on a throwaway
  // doc to measure content height, once for real at a centred startY.
  function drawGaddPdf(doc, s, inv, totals, logoImg, startY){
    var INK = [26,26,26], MUTED = [74,68,56], RED = [161,31,38], PAPER = [244,239,228];
    var pageW = 210, marginX = 24, contentW = pageW - marginX*2, rightEdge = pageW - marginX;
    var roleText = ROLE_TEXT[inv.role || 'music'];

    doc.setFillColor(PAPER[0],PAPER[1],PAPER[2]);
    doc.rect(0,0,210,297,'F');

    var logoW = 70, logoH = logoW * 233/1963, logoY = startY;
    if(logoImg){
      doc.addImage(logoImg, 'PNG', marginX, logoY, logoW, logoH, undefined, 'FAST');
    } else {
      doc.setFont('helvetica','bold');
      doc.setFontSize(22);
      doc.setTextColor(INK[0],INK[1],INK[2]);
      doc.text((s.businessName||'George Gadd').toUpperCase(), marginX, logoY + 10);
      logoH = 10;
    }

    doc.setFont('courier','bold');
    doc.setFontSize(8.5);
    doc.setTextColor(INK[0],INK[1],INK[2]);
    var taglineY = logoY + logoH + 7;
    doc.text(spacedCaps(roleText ? roleText.tagline : ''), marginX, taglineY);

    var boxW = 40, boxH = 26, boxX = rightEdge - boxW, boxY = startY - 2;
    doc.setDrawColor(RED[0],RED[1],RED[2]);
    doc.setLineWidth(0.45);
    doc.roundedRect(boxX, boxY, boxW, boxH, 1.8, 1.8, 'S');
    doc.setLineWidth(0.25);
    doc.roundedRect(boxX+1.4, boxY+1.4, boxW-2.8, boxH-2.8, 1.2, 1.2, 'S');
    doc.setFont('courier','bold');
    doc.setFontSize(7.5);
    doc.setTextColor(RED[0],RED[1],RED[2]);
    doc.text('INVOICE', boxX + boxW/2, boxY + 8.5, { align: 'center' });
    doc.setFontSize(10.5);
    doc.text(inv.invoiceNumber, boxX + boxW/2, boxY + 15.5, { align: 'center' });
    doc.setFont('courier','normal');
    doc.setFontSize(7.5);
    doc.text(formatDate(inv.date), boxX + boxW/2, boxY + 21, { align: 'center' });

    var ruleY = Math.max(taglineY, boxY+boxH) + 12;
    doc.setDrawColor(INK[0],INK[1],INK[2]);
    doc.setLineWidth(0.2);
    doc.setLineDashPattern([0.8,0.8], 0);
    doc.line(marginX, ruleY, rightEdge, ruleY);
    doc.setLineDashPattern([], 0);

    var colGap = 12, colW = (contentW - colGap)/2;
    var col1X = marginX, col2X = marginX + colW + colGap;
    var partyTopY = ruleY + 14;

    doc.setFont('courier','bold');
    doc.setFontSize(7.5);
    doc.setTextColor(MUTED[0],MUTED[1],MUTED[2]);
    doc.text('FROM', col1X, partyTopY);
    doc.text('BILL TO', col2X, partyTopY);

    var fromLinesRaw = (s.address||'').split('\n').filter(Boolean);
    if(s.email) fromLinesRaw.push(s.email);
    if(s.phone) fromLinesRaw.push(s.phone);
    var billLinesRaw = [inv.clientName || 'Client name'];
    billLinesRaw = billLinesRaw.concat((inv.clientAddress||'Client address').split('\n').filter(Boolean));
    if(inv.clientEmail) billLinesRaw.push(inv.clientEmail);

    doc.setFont('courier','normal');
    doc.setFontSize(9.5);
    doc.setTextColor(INK[0],INK[1],INK[2]);
    var fromLines = pdfWrapLines(doc, fromLinesRaw, colW);
    var billLines = pdfWrapLines(doc, billLinesRaw, colW);

    var lineH = 6, textStartY = partyTopY + 6.5;
    fromLines.forEach(function(line, i){ doc.text(line, col1X, textStartY + i*lineH); });
    billLines.forEach(function(line, i){ doc.text(line, col2X, textStartY + i*lineH); });

    var maxPartyLines = Math.max(fromLines.length, billLines.length, 1);
    var tableY = textStartY + maxPartyLines*lineH + 12;

    doc.setFont('courier','bold');
    doc.setFontSize(7.5);
    doc.setTextColor(MUTED[0],MUTED[1],MUTED[2]);
    doc.text('DESCRIPTION', col1X, tableY);
    doc.text('AMOUNT', rightEdge, tableY, { align: 'right' });
    doc.setDrawColor(MUTED[0],MUTED[1],MUTED[2]);
    doc.setLineWidth(0.2);
    doc.setLineDashPattern([0.8,0.8], 0);
    doc.line(marginX, tableY+2.6, rightEdge, tableY+2.6);
    doc.setLineDashPattern([], 0);

    var rowY = tableY + 11;
    function tableRow(label, amountText, opts){
      opts = opts || {};
      doc.setFont('courier', opts.italic ? 'italic' : 'normal');
      doc.setFontSize(9.5);
      var col = opts.color || INK;
      doc.setTextColor(col[0],col[1],col[2]);
      var wrapped = doc.splitTextToSize(label, contentW - 45);
      wrapped.forEach(function(w, i){ doc.text(w, col1X, rowY + i*4.8); });
      doc.text(amountText, rightEdge, rowY, { align: 'right' });
      var dividerY = rowY + (wrapped.length-1)*4.8 + 3.4;
      doc.setDrawColor(220,213,196);
      doc.setLineWidth(0.15);
      doc.setLineDashPattern([0.8,0.8], 0);
      doc.line(marginX, dividerY, rightEdge, dividerY);
      doc.setLineDashPattern([], 0);
      rowY = dividerY + 7.2;
    }

    tableRow(inv.description || (roleText ? roleText.description : 'Live performance fee'), formatAmount(totals.gross, s.currency));
    (totals.additionLines||[]).forEach(function(l){ tableRow(l.label, '+' + formatAmount(l.amount, s.currency)); });
    (totals.deductionLines||[]).forEach(function(l){ tableRow('Less: ' + l.label, '-' + formatAmount(l.amount, s.currency), { italic: true, color: MUTED }); });

    doc.setDrawColor(INK[0],INK[1],INK[2]);
    doc.setLineWidth(0.5);
    doc.line(marginX, rowY, rightEdge, rowY);
    rowY += 9;
    doc.setFont('courier','bold');
    doc.setFontSize(11);
    doc.setTextColor(RED[0],RED[1],RED[2]);
    doc.text('Total due', col1X, rowY);
    doc.text(formatAmount(totals.net, s.currency), rightEdge, rowY, { align: 'right' });

    var footY = rowY + 20;
    doc.setFont('courier','normal');
    doc.setFontSize(8.5);
    doc.setTextColor(MUTED[0],MUTED[1],MUTED[2]);
    var terms = doc.splitTextToSize(s.paymentTerms || 'Payment due within 14 days of the invoice date.', contentW);
    terms.forEach(function(line,i){ doc.text(line, col1X, footY + i*4.8); });
    footY += terms.length*4.8 + 4;

    var bankParts = [];
    if(s.accountName) bankParts.push(s.accountName);
    if(s.sortCode) bankParts.push('Sort code ' + s.sortCode);
    if(s.accountNumber) bankParts.push('Account ' + s.accountNumber);
    if(s.bankName) bankParts.push(s.bankName);
    var bankLine = doc.splitTextToSize(bankParts.join('  |  ') || 'Add your payment details in Settings', contentW);
    bankLine.forEach(function(line,i){ doc.text(line, col1X, footY + i*4.8); });
    footY += bankLine.length*4.8 + 8;

    doc.setFont('helvetica','italic');
    doc.setFontSize(10);
    doc.setTextColor(INK[0],INK[1],INK[2]);
    doc.text((roleText ? roleText.signoff : 'Thanks for having me!'), col1X, footY);

    return footY;
  }

  function buildGaddPdf(s, inv, totals, logoImg){
    var jsPDF = window.jspdf.jsPDF;
    var defaultTop = 26, pageH = 297;
    var dryDoc = new jsPDF({ unit:'mm', format:'a4' });
    var contentBottom = drawGaddPdf(dryDoc, s, inv, totals, logoImg, defaultTop);
    var centeredTop = Math.max(20, (pageH - (contentBottom - defaultTop)) / 2);
    var doc = new jsPDF({ unit:'mm', format:'a4' });
    drawGaddPdf(doc, s, inv, totals, logoImg, centeredTop);
    return doc;
  }

  function drawTvPartyPdf(doc, s, inv, totals, startY){
    var NAVY = [19,26,46], MUSTARD = [246,185,59], CORAL = [239,83,53], CORALDARK = [194,60,31];
    var SLATE = [91,96,112], MUTEDBODY = [74,80,100], PAPER = [253,252,249];
    var pageW = 210, marginX = 24, contentW = pageW - marginX*2, rightEdge = pageW - marginX;

    doc.setFillColor(PAPER[0],PAPER[1],PAPER[2]);
    doc.rect(0,0,210,297,'F');

    var bandH = startY + 34;
    doc.setFillColor(NAVY[0],NAVY[1],NAVY[2]);
    doc.rect(0, 0, 210, bandH, 'F');

    doc.setFont('helvetica','bold');
    doc.setFontSize(22);
    doc.setTextColor(MUSTARD[0],MUSTARD[1],MUSTARD[2]);
    doc.text((s.businessName||'TV Party Tonight!').toUpperCase(), marginX, startY + 10);

    doc.setFontSize(9);
    doc.setTextColor(CORAL[0],CORAL[1],CORAL[2]);
    doc.text(spacedCaps(s.tagline || 'TV Theme Party Band'), marginX, startY + 18);

    drawTvBadge(doc, rightEdge - 32, startY - 6, 32);

    var ticketY = bandH + 12;
    doc.setFont('courier','normal');
    doc.setFontSize(9.5);
    doc.setTextColor(NAVY[0],NAVY[1],NAVY[2]);
    doc.setDrawColor(CORAL[0],CORAL[1],CORAL[2]);
    doc.setLineWidth(0.35);
    doc.setLineDashPattern([0.8,0.8], 0);
    doc.line(rightEdge-46, ticketY-4, rightEdge-46, ticketY+6);
    doc.setLineDashPattern([], 0);
    doc.text(inv.invoiceNumber, rightEdge, ticketY, { align:'right' });
    doc.text(formatDate(inv.date), rightEdge, ticketY+6, { align:'right' });

    var colGap = 12, colW = (contentW - colGap)/2;
    var col1X = marginX, col2X = marginX + colW + colGap;
    var partyTopY = ticketY + 18;

    doc.setFont('helvetica','bold');
    doc.setFontSize(7.5);
    doc.setTextColor(SLATE[0],SLATE[1],SLATE[2]);
    doc.text('FROM', col1X, partyTopY);
    doc.text('BILL TO', col2X, partyTopY);

    var fromLinesRaw = (s.address||'').split('\n').filter(Boolean);
    if(s.email) fromLinesRaw.push(s.email);
    if(s.phone) fromLinesRaw.push(s.phone);
    var billLinesRaw = [inv.clientName || 'Client / venue name'];
    billLinesRaw = billLinesRaw.concat((inv.clientAddress||'Client address').split('\n').filter(Boolean));
    if(inv.clientEmail) billLinesRaw.push(inv.clientEmail);

    doc.setFont('helvetica','normal');
    doc.setFontSize(10);
    doc.setTextColor(NAVY[0],NAVY[1],NAVY[2]);
    var fromLines = pdfWrapLines(doc, fromLinesRaw, colW);
    var billLines = pdfWrapLines(doc, billLinesRaw, colW);
    var lineH = 6, textStartY = partyTopY + 6.5;
    fromLines.forEach(function(line,i){ doc.text(line, col1X, textStartY + i*lineH); });
    billLines.forEach(function(line,i){ doc.text(line, col2X, textStartY + i*lineH); });
    var maxPartyLines = Math.max(fromLines.length, billLines.length, 1);
    var tableY = textStartY + maxPartyLines*lineH + 12;

    doc.setFont('helvetica','bold');
    doc.setFontSize(7.5);
    doc.setTextColor(SLATE[0],SLATE[1],SLATE[2]);
    doc.text('DESCRIPTION', col1X, tableY);
    doc.text('AMOUNT', rightEdge, tableY, { align:'right' });
    doc.setDrawColor(NAVY[0],NAVY[1],NAVY[2]);
    doc.setLineWidth(0.5);
    doc.line(marginX, tableY+2.8, rightEdge, tableY+2.8);

    var rowY = tableY + 11.5;
    function tableRow(label, amountText, opts){
      opts = opts || {};
      doc.setFont('helvetica', opts.italic ? 'italic' : 'normal');
      doc.setFontSize(10.5);
      var col = opts.color || NAVY;
      doc.setTextColor(col[0],col[1],col[2]);
      var wrapped = doc.splitTextToSize(label, contentW - 45);
      wrapped.forEach(function(w,i){ doc.text(w, col1X, rowY + i*5); });
      doc.text(amountText, rightEdge, rowY, { align:'right' });
      var dividerY = rowY + (wrapped.length-1)*5 + 3.6;
      doc.setDrawColor(228,226,218);
      doc.setLineWidth(0.2);
      doc.line(marginX, dividerY, rightEdge, dividerY);
      rowY = dividerY + 7.5;
    }
    tableRow(inv.description || 'Live performance fee', formatAmount(totals.gross, s.currency));
    (totals.additionLines||[]).forEach(function(l){ tableRow(l.label, '+' + formatAmount(l.amount, s.currency)); });
    (totals.deductionLines||[]).forEach(function(l){ tableRow('Less: ' + l.label, '-' + formatAmount(l.amount, s.currency), { italic:true, color: MUTEDBODY }); });

    var barH = 14;
    doc.setFillColor(MUSTARD[0],MUSTARD[1],MUSTARD[2]);
    doc.roundedRect(marginX, rowY, contentW, barH, 1.6, 1.6, 'F');
    doc.setFont('helvetica','bold');
    doc.setFontSize(12);
    doc.setTextColor(NAVY[0],NAVY[1],NAVY[2]);
    doc.text('Total due', marginX + 6, rowY + barH/2 + 3.2);
    doc.text(formatAmount(totals.net, s.currency), rightEdge - 6, rowY + barH/2 + 3.2, { align:'right' });
    rowY += barH + 16;

    doc.setDrawColor(207,208,200);
    doc.setLineWidth(0.4);
    doc.setLineDashPattern([1,1], 0);
    doc.line(marginX, rowY, rightEdge, rowY);
    doc.setLineDashPattern([], 0);
    rowY += 8;

    doc.setFont('helvetica','normal');
    doc.setFontSize(9);
    doc.setTextColor(MUTEDBODY[0],MUTEDBODY[1],MUTEDBODY[2]);
    var terms = doc.splitTextToSize(s.paymentTerms || 'Payment due within 14 days of the invoice date.', contentW);
    terms.forEach(function(line,i){ doc.text(line, col1X, rowY + i*4.8); });
    rowY += terms.length*4.8 + 4;

    var bankParts = [];
    if(s.accountName) bankParts.push(s.accountName);
    if(s.sortCode) bankParts.push('Sort code ' + s.sortCode);
    if(s.accountNumber) bankParts.push('Account ' + s.accountNumber);
    if(s.bankName) bankParts.push(s.bankName);
    doc.setFont('helvetica','bold');
    doc.setTextColor(NAVY[0],NAVY[1],NAVY[2]);
    var bankLine = doc.splitTextToSize(bankParts.join('  |  ') || 'Add your payment details in Settings', contentW);
    bankLine.forEach(function(line,i){ doc.text(line, col1X, rowY + i*4.8); });
    rowY += bankLine.length*4.8 + 8;

    doc.setFont('helvetica','bold');
    doc.setFontSize(10.5);
    doc.setTextColor(CORALDARK[0],CORALDARK[1],CORALDARK[2]);
    doc.text('Thanks for having us play — see you at the next one!', col1X, rowY);

    return rowY;
  }

  function buildTvPartyPdf(s, inv, totals){
    var jsPDF = window.jspdf.jsPDF;
    var defaultTop = 20, pageH = 297;
    var dryDoc = new jsPDF({ unit:'mm', format:'a4' });
    var contentBottom = drawTvPartyPdf(dryDoc, s, inv, totals, defaultTop);
    var centeredTop = Math.max(16, (pageH - (contentBottom - defaultTop)) / 2);
    var doc = new jsPDF({ unit:'mm', format:'a4' });
    drawTvPartyPdf(doc, s, inv, totals, centeredTop);
    return doc;
  }

  async function generatePdfBlob(){
    if(!window.jspdf) return null;
    var s = state.settings[state.persona];
    var inv = state.invoice;
    var totals = calcTotals(inv);
    var doc;
    if(state.persona === 'gadd'){
      var logoImg = await loadLogoImage();
      doc = buildGaddPdf(s, inv, totals, logoImg);
    } else {
      doc = buildTvPartyPdf(s, inv, totals);
    }
    var nameSlug = (inv.clientName || 'client').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    var fileName = 'Invoice-' + inv.invoiceNumber + '-' + nameSlug + '.pdf';
    return { blob: doc.output('blob'), fileName: fileName };
  }

  function savePdfBlob(blob, fileName){
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function(){ URL.revokeObjectURL(url); }, 4000);
  }

  async function bumpCounterIfNeeded(){
    var seq = getActiveSeq();
    var expected = seq.invoicePrefix + '-' + pad4(seq.nextNumber);
    if(state.invoice.invoiceNumber === expected){
      seq.nextNumber += 1;
      await saveSettings(state.persona, state.settings[state.persona]);
    }
  }

  async function downloadPdf(){
    var err = validate();
    renderPreview();
    if(err){ setStatus(err, false); return; }

    if(!window.jspdf){
      setStatus('PDF library failed to load — check your connection and try again.', false);
      return;
    }

    setStatus('Generating PDF…', true);
    try {
      var result = await generatePdfBlob();
      if(!result){ setStatus('Something went wrong generating the PDF.', false); return; }
      savePdfBlob(result.blob, result.fileName);
      await bumpCounterIfNeeded();
      logInvoice();
      setStatus('Invoice downloaded.', true);
    } catch(e){
      console.error(e);
      setStatus('Something went wrong generating the PDF.', false);
    }
  }

  /* ---------- Email export ---------- */
  function buildEmailContent(){
    var s = state.settings[state.persona];
    var inv = state.invoice;
    var totals = calcTotals(inv);
    var isGadd = state.persona === 'gadd';
    var roleText = isGadd ? ROLE_TEXT[inv.role || 'music'] : null;
    var descriptionDefault = isGadd ? roleText.description : 'Live performance fee';
    var signoff = isGadd ? roleText.signoff : 'Thanks for having us play — see you at the next one!';

    var lines = [];
    lines.push('Hi ' + (inv.clientName || 'there') + ',');
    lines.push('');
    lines.push('Here are the details for ' + (inv.description || descriptionDefault) + ':');
    lines.push('');
    lines.push('Invoice number: ' + inv.invoiceNumber);
    lines.push('Date: ' + formatDate(inv.date));
    lines.push('Fee: ' + formatAmount(totals.gross, s.currency));
    totals.additionLines.forEach(function(l){
      lines.push(l.label + ': +' + formatAmount(l.amount, s.currency));
    });
    totals.deductionLines.forEach(function(l){
      lines.push('Less: ' + l.label + ': -' + formatAmount(l.amount, s.currency));
    });
    lines.push('Amount due: ' + formatAmount(totals.net, s.currency));
    var bankParts = [];
    if(s.accountName) bankParts.push(s.accountName);
    if(s.sortCode) bankParts.push('Sort code ' + s.sortCode);
    if(s.accountNumber) bankParts.push('Account ' + s.accountNumber);
    if(s.bankName) bankParts.push(s.bankName);
    if(bankParts.length) lines.push('Payment details: ' + bankParts.join(', '));
    if(s.paymentTerms) lines.push(s.paymentTerms);
    lines.push('');
    lines.push(signoff);
    lines.push('');
    lines.push(s.businessName);
    if(s.email) lines.push(s.email);
    if(s.phone) lines.push(s.phone);

    return {
      subject: 'Invoice ' + inv.invoiceNumber + ' from ' + s.businessName,
      body: lines.join('\n')
    };
  }

  function openDraftedEmail(to, subject, body){
    var link = document.createElement('a');
    link.href = 'mailto:' + encodeURIComponent(to) + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  async function tryAutoGmailSend(to, content){
    try {
      var resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: 'Send an email right now using the Gmail tool. Do not ask for confirmation, just send it.\n\nTo: ' + to + '\nSubject: ' + content.subject + '\nBody:\n' + content.body
          }],
          mcp_servers: [{ type: 'url', url: 'https://gmailmcp.googleapis.com/mcp/v1', name: 'gmail-mcp' }]
        })
      });
      if(!resp.ok) return false;
      var data = await resp.json();
      var blocks = (data && data.content) || [];
      var usedTool = blocks.some(function(b){ return b.type === 'mcp_tool_use'; });
      var hadError = blocks.some(function(b){ return b.type === 'mcp_tool_result' && b.is_error; });
      return usedTool && !hadError;
    } catch(e){
      console.error('Automatic Gmail send failed', e);
      return false;
    }
  }

  // Returns 'sent', 'cancelled', or 'unavailable'.
  async function tryWebShare(blob, fileName, subject, body){
    if(!navigator.share || !navigator.canShare) return 'unavailable';
    try {
      var file = new File([blob], fileName, { type: 'application/pdf' });
      if(!navigator.canShare({ files: [file] })) return 'unavailable';
      await navigator.share({ files: [file], title: subject, text: body });
      return 'sent';
    } catch(e){
      if(e && e.name === 'AbortError') return 'cancelled';
      console.error('Web Share failed', e);
      return 'unavailable';
    }
  }

  async function sendInvoiceEmail(){
    var err = validateForEmail();
    renderPreview();
    if(err){ setStatus(err, false); return; }

    var to = state.invoice.clientEmail.trim();
    var content = buildEmailContent();

    var confirmed = window.confirm('Send this invoice to ' + to + '?');
    if(!confirmed) return;

    setStatus('Sending…', true);

    // Tier 1: fully automatic send via your connected Gmail (Claude.ai only).
    // Message only — no attachment, see README for why.
    var autoSent = await tryAutoGmailSend(to, content);
    if(autoSent){
      await bumpCounterIfNeeded();
      logInvoice();
      setStatus('Email sent to ' + to + '.', true);
      return;
    }

    // Tier 2: hand the actual PDF to the OS share sheet, so you can pick
    // Gmail, Outlook, Mail, or anything else — with the file genuinely
    // attached. Needs a browser that supports the Web Share API with files
    // (most Chrome/Edge/Safari; not Firefox).
    setStatus('Preparing the PDF…', true);
    var pdfResult = null;
    try { pdfResult = await generatePdfBlob(); } catch(e){ console.error(e); }

    if(pdfResult){
      var shareOutcome = await tryWebShare(pdfResult.blob, pdfResult.fileName, content.subject, content.body);
      if(shareOutcome === 'sent'){
        await bumpCounterIfNeeded();
        logInvoice();
        setStatus('Ready to send — pick where to send it from the share menu.', true);
        return;
      }
      if(shareOutcome === 'cancelled'){
        setStatus('Sharing cancelled.', false);
        return;
      }
      // 'unavailable' falls through to tier 3 below.
    }

    // Tier 3: last resort. Download the PDF and open a drafted email so
    // it's one drag-and-drop away from being attached and sent.
    if(pdfResult){ savePdfBlob(pdfResult.blob, pdfResult.fileName); }
    openDraftedEmail(to, content.subject, content.body);
    await bumpCounterIfNeeded();
    logInvoice();
    setStatus(pdfResult
      ? 'Downloaded the PDF and opened a drafted email — attach the PDF and send.'
      : "Opened a drafted email — automatic sending and file sharing aren't available here.", false);
  }

  /* ---------- Form actions ---------- */
  function clearForm(){
    state.invoice = newInvoiceDefaults(state.persona);
    syncFormFromState();
    renderPreview();
    setStatus('');
  }

  function switchPersona(persona){
    state.persona = persona;
    var btns = document.querySelectorAll('.tab-btn');
    for(var i = 0; i < btns.length; i++){
      btns[i].classList.toggle('active', btns[i].getAttribute('data-persona') === persona);
    }
    $('roleToggleWrap').style.display = persona === 'gadd' ? 'block' : 'none';
    state.invoice = newInvoiceDefaults(persona);
    syncFormFromState();
    renderPreview();
  }

  function attachLiveListeners(){
    ['f-date','f-clientName','f-clientAddress','f-clientEmail','f-amount','f-description','f-invoiceNumber',
     'f-travel-on','f-travel-amount','f-addother-on','f-addother-label','f-addother-amount',
     'f-agent-on','f-agent-value','f-carbon-on','f-carbon-amount',
     'f-dedother-on','f-dedother-label','f-dedother-amount'].forEach(function(id){
      $(id).addEventListener('input', function(){ readFormIntoState(); renderPreview(); });
      $(id).addEventListener('change', function(){ readFormIntoState(); renderPreview(); });
    });

    $('f-agent-mode').addEventListener('change', function(){
      $('f-agent-value').value = '';
      $('f-agent-value').placeholder = this.value === 'percent' ? '10' : '0.00';
      readFormIntoState();
      renderPreview();
    });

    var tabs = document.querySelectorAll('.tab-btn');
    for(var i = 0; i < tabs.length; i++){
      tabs[i].addEventListener('click', function(){ switchPersona(this.getAttribute('data-persona')); });
    }
    var roleBtns = document.querySelectorAll('.role-btn');
    for(var j = 0; j < roleBtns.length; j++){
      roleBtns[j].addEventListener('click', function(){ setRole(this.getAttribute('data-role')); });
    }

    $('settingsBtn').addEventListener('click', openSettings);
    $('closeSettingsBtn').addEventListener('click', closeSettings);
    $('settingsModal').addEventListener('click', function(e){ if(e.target.id === 'settingsModal') closeSettings(); });
    $('saveSettingsBtn').addEventListener('click', saveSettingsFromForm);

    $('manageContactsBtn').addEventListener('click', openContactsModal);
    $('closeContactsBtn').addEventListener('click', closeContactsModal);
    $('contactsModal').addEventListener('click', function(e){ if(e.target.id === 'contactsModal') closeContactsModal(); });
    $('contactsList').addEventListener('click', async function(e){
      var btn = e.target.closest ? e.target.closest('.contact-remove') : null;
      if(!btn) return;
      var id = btn.getAttribute('data-id');
      state.contacts = state.contacts.filter(function(c){ return c.id !== id; });
      await saveContactsList();
      renderContactsList();
      populateSavedClientSelect();
    });
    $('f-savedClient').addEventListener('change', onSelectContact);
    $('saveClientBtn').addEventListener('click', onSaveClient);

    $('historyBtn').addEventListener('click', openHistoryModal);
    $('closeHistoryBtn').addEventListener('click', closeHistoryModal);
    $('historyModal').addEventListener('click', function(e){ if(e.target.id === 'historyModal') closeHistoryModal(); });
    $('historyList').addEventListener('click', async function(e){
      var loadBtn = e.target.closest ? e.target.closest('.history-load') : null;
      var delBtn = e.target.closest ? e.target.closest('.history-remove') : null;
      if(loadBtn){
        var id = loadBtn.getAttribute('data-id');
        var entry = state.history.find(function(h){ return h.id === id; });
        if(entry) loadFromHistory(entry);
        return;
      }
      if(delBtn){
        var did = delBtn.getAttribute('data-id');
        state.history = state.history.filter(function(h){ return h.id !== did; });
        await saveHistoryList();
        renderHistoryList();
      }
    });

    $('downloadBtn').addEventListener('click', downloadPdf);
    $('emailBtn').addEventListener('click', sendInvoiceEmail);
    $('clearBtn').addEventListener('click', clearForm);
  }

  async function startApp(){
    state.settings.gadd = await loadSettings('gadd');
    state.settings.tvparty = await loadSettings('tvparty');
    state.contacts = await loadContactsList();
    state.history = await loadHistory();
    state.invoice = newInvoiceDefaults('gadd');
    populateSavedClientSelect();
    syncFormFromState();
    renderPreview();
    attachLiveListeners();
  }

  /* ---------- Auth screen wiring (only shown in standalone Firebase mode) ---------- */
  function setAuthError(msg){
    var el = $('authError');
    if(el) el.textContent = msg || '';
  }

  function friendlyAuthError(e){
    var code = (e && e.code) || '';
    var map = {
      'auth/email-already-in-use': 'An account already exists for that email — try signing in instead.',
      'auth/invalid-email': "That email address doesn't look right.",
      'auth/weak-password': 'Password should be at least 6 characters.',
      'auth/wrong-password': 'Incorrect password.',
      'auth/user-not-found': 'No account found for that email — try creating one.',
      'auth/too-many-requests': 'Too many attempts — please wait a moment and try again.'
    };
    return map[code] || (e && e.message) || 'Something went wrong — please try again.';
  }

  async function handleSignIn(){
    var email = $('auth-email').value.trim();
    var password = $('auth-password').value;
    if(!email || !password){ setAuthError('Enter your email and password.'); return; }
    setAuthError('Signing in…');
    try { await window.Auth.signIn(email, password); setAuthError(''); }
    catch(e){ setAuthError(friendlyAuthError(e)); }
  }

  async function handleSignUp(){
    var email = $('auth-email').value.trim();
    var password = $('auth-password').value;
    if(!email || !password){ setAuthError('Enter your email and password.'); return; }
    if(password.length < 6){ setAuthError('Password should be at least 6 characters.'); return; }
    setAuthError('Creating your account…');
    try { await window.Auth.signUp(email, password); setAuthError(''); }
    catch(e){ setAuthError(friendlyAuthError(e)); }
  }

  async function handleReset(){
    var email = $('auth-email').value.trim();
    if(!email){ setAuthError('Enter your email above first.'); return; }
    try { await window.Auth.resetPassword(email); setAuthError('Password reset email sent.'); }
    catch(e){ setAuthError(friendlyAuthError(e)); }
  }

  function updateBadgeClaude(){
    var badge = $('storageBadge');
    if(badge) badge.textContent = 'Running inside Claude.ai — your details are saved to your account.';
  }

  function updateBadgeFirebase(user){
    var badge = $('storageBadge');
    if(badge) badge.textContent = 'Signed in as ' + user.email + ' — your details are saved to your private database.';
    var btn = $('signOutBtn');
    if(btn) btn.classList.remove('hidden');
  }

  function boot(){
    var signInBtn = $('authSignInBtn');
    var signUpBtn = $('authSignUpBtn');
    var resetBtn = $('authResetBtn');
    var signOutBtn = $('signOutBtn');
    if(signInBtn) signInBtn.addEventListener('click', handleSignIn);
    if(signUpBtn) signUpBtn.addEventListener('click', handleSignUp);
    if(resetBtn) resetBtn.addEventListener('click', handleReset);
    if(signOutBtn) signOutBtn.addEventListener('click', async function(){
      await window.Auth.signOut();
      window.location.reload();
    });

    if(window.AppStorage.mode === 'claude'){
      updateBadgeClaude();
      startApp();
      return;
    }

    if(!window.Auth.isConfigured()){
      var notice = $('configNotice');
      if(notice) notice.classList.remove('hidden');
      return;
    }

    window.Auth.onChange(function(user){
      var authScreen = $('authScreen');
      if(user){
        if(authScreen) authScreen.classList.add('hidden');
        updateBadgeFirebase(user);
        startApp();
      } else {
        if(authScreen) authScreen.classList.remove('hidden');
      }
    });
  }

  boot();
})();
