/* ====== Utilities ====== */
// Safe UUID helper (fallback if crypto.randomUUID is missing)
const uuid = () => (
  (self.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
        (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
      )
);

dayjs.extend(dayjs_plugin_utc);
dayjs.extend(dayjs_plugin_timezone);
const IST_TZ = 'Asia/Kolkata';

const fmtINR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

function nowIST() { return dayjs().tz(IST_TZ); }
function istDateKey(d = nowIST()) { return d.format('YYYY-MM-DD'); }
function istDisplayDate(dISO) { return dayjs(dISO).tz(IST_TZ).format('DD - MM - YYYY'); }
function istDisplayTime(dISO) { return dayjs(dISO).tz(IST_TZ).format('hh:mm A'); }

function rupees(n) {
  return fmtINR.format(Number(n || 0));
}
function rupeesForPDF(n) {
  const v = Number(n || 0);
  return 'Rs' + v.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}
function parseINR(str) {
  // Make robust: handle "Rs", "₹", commas, spaces, NBSP, and minus sign
  const s = (str ?? '').toString().replace(/−/g, '-'); // normalize unicode minus
  const cleaned = s.replace(/[^\d-]/g, '');            // keep only digits and minus
  return parseInt(cleaned || '0', 10);
}

function el(id) { return document.getElementById(id); }

function toast(msg, ms = 2000) {
  const t = document.createElement('div');
  t.className = 'fixed bottom-4 left-1/2 -translate-x-1/2 bg-black text-white text-sm px-3 py-2 rounded-lg z-[70]';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}
// --- Global state for editing ---
let editingId = null;


/* ====== Amount in words ====== */
function numToWords(n) {
  n = Math.floor(Number(n || 0));
  if (n === 0) return 'zero';
  if (n > 999999999) return n.toString();
  const a = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const b = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

  function inWords(num) {
    if (num < 20) return a[num];
    if (num < 100) return b[Math.floor(num / 10)] + (num % 10 ? ' ' + a[num % 10] : '');
    if (num < 1000) return a[Math.floor(num / 100)] + ' hundred' + (num % 100 ? ' ' + inWords(num % 100) : '');
    return '';
  }

  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  const hundred = Math.floor(n / 100); n %= 100;

  let str = '';
  if (crore) str += inWords(crore) + ' crore ';
  if (lakh) str += inWords(lakh) + ' lakh ';
  if (thousand) str += inWords(thousand) + ' thousand ';
  if (hundred) str += a[hundred] + ' hundred ';
  if (n) str += inWords(n);
  return str.trim();
}

/* ====== Install PWA ====== */
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  el('btnInstall')?.classList.remove('hidden');
});
el('btnInstall')?.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  el('btnInstall')?.classList.add('hidden');
});

/* ====== Online status ====== */
function updateOnline() {
  const badge = el('onlineBadge');
  if (!badge) return;
  if (navigator.onLine) {
    badge.textContent = 'online';
    badge.className = 'px-2 py-1 text-xs rounded bg-green-200';
  } else {
    badge.textContent = 'offline';
    badge.className = 'px-2 py-1 text-xs rounded bg-gray-200';
  }
}
window.addEventListener('online', updateOnline);
window.addEventListener('offline', updateOnline);

/* ====== IndexedDB ====== */
let db;
function openDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open('simple-accounting', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('transactions')) {
        const s = db.createObjectStore('transactions', { keyPath: 'id' });
        s.createIndex('dateKey', 'dateKey', { unique: false });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('edits')) {
        db.createObjectStore('edits', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('denoms')) {
        db.createObjectStore('denoms', { keyPath: 'dateKey' });
      }

    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
function idbSet(store, value) {
  return new Promise((res, rej) => {
    const req = db.transaction(store, 'readwrite').objectStore(store).put(value);
    req.onsuccess = () => res(true);
    req.onerror = () => rej(req.error);
  });
}
function idbGetAll(store) {
  return new Promise((res, rej) => {
    const req = db.transaction(store, 'readonly').objectStore(store).getAll();
    req.onsuccess = () => res(req.result || []);
    req.onerror = () => rej(req.error);
  });
}
function idbGet(store, key) {
  return new Promise((res, rej) => {
    const req = db.transaction(store, 'readonly').objectStore(store).get(key);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
function idbDelete(store, key) {
  return new Promise((res, rej) => {
    const req = db.transaction(store, 'readwrite').objectStore(store).delete(key);
    req.onsuccess = () => res(true);
    req.onerror = () => rej(req.error);
  });
}
// ✅ Added missing clear
function idbClear(store) {
  return new Promise((res, rej) => {
    const req = db.transaction(store, 'readwrite').objectStore(store).clear();
    req.onsuccess = () => res(true);
    req.onerror = () => rej(req.error);
  });
}

/* ====== PIN lock ====== */
// Legacy simple hash (kept for back-compat with older saved PINs)
function legacyPinHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return hash.toString(16);
}
// Proper SHA-256 (hex). Falls back to legacy if subtle not available.
async function sha256Hex(str) {
  if (crypto?.subtle && window.TextEncoder) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  return legacyPinHash(str);
}

async function showPinLock() {
  return new Promise(async (resolve) => {
    const pinOverlay = el('pinOverlay');
    const pinInput = el('pinInput');
    const pinSubmit = el('pinSubmit');
    const pinReset = el('pinReset');
    const pinError = el('pinError');

    // Clear any existing listeners by cloning
    const newPinSubmit = pinSubmit.cloneNode(true);
    const newPinReset = pinReset.cloneNode(true);
    pinSubmit.replaceWith(newPinSubmit);
    pinReset.replaceWith(newPinReset);

    let saved;
    try {
      saved = await idbGet('settings', 'pinHash');
    } catch (e) {
      console.error('IndexedDB error:', e);
      pinError.textContent = 'Database error. Please reset PIN.';
      pinError.classList.remove('hidden');
      return;
    }

    const isSetup = !!saved?.value;
    el('pinSubheading').textContent = isSetup
      ? 'This keeps data private on this device.'
      : 'Create a 4-digit PIN for this device.';

    pinOverlay.classList.remove('hidden');
    el('app').classList.add('hidden');

    // Replace the existing PIN reset event listener in your showPinLock function
// Find this part in your code and replace it:

newPinReset.addEventListener('click', async () => {
  // Start the 4-step verification process
  const passwords = ["Syed", "Golam", "Faruk", "Sgf"];
  const prompts = [
    "Enter Password 1:",
    "Enter Password 2:", 
    "Enter Password 3:",
    "Enter Password 4:"
  ];
  
  const userInputs = [];
  
  // Collect all 4 passwords first without checking
  for (let i = 0; i < passwords.length; i++) {
    const userInput = prompt(prompts[i]);
    
    // If user cancels any prompt, stop the process
    if (userInput === null) {
      return;
    }
    
    userInputs.push(userInput);
  }
  
  // Now check if all passwords are correct
  let allCorrect = true;
  for (let i = 0; i < passwords.length; i++) {
    if (userInputs[i] !== passwords[i]) {
      allCorrect = false;
      break;
    }
  }
  
  // If any password is wrong, show generic error
  if (!allCorrect) {
    alert("❌ One or more passwords you entered is wrong. PIN reset cancelled.");
    return;
  }
  
  // If all 4 passwords are correct, proceed with PIN reset
  if (allCorrect) {
    // Ask for new PIN
    const newPin = prompt("✅ All passwords verified!\nEnter new 4-digit PIN:");
    
    if (newPin === null) {
      return; // User cancelled
    }
    
    // Validate new PIN format
    if (!/^\d{4}$/.test(newPin)) {
      alert("❌ PIN must be exactly 4 digits.");
      return;
    }
    
    try {
      // Generate new PIN hash using SHA-256
      const newHash = await sha256Hex(newPin);
      
      // Save new PIN hash to database (without deleting any data)
      await idbSet('settings', { 
        key: 'pinHash', 
        value: newHash, 
        alg: 'sha256-hex' 
      });
      
      alert("✅ PIN successfully reset!\nYou can now login with your new PIN.");
      
      // Clear the PIN input field
      pinInput.value = '';
      pinError.classList.add('hidden');
      
    } catch (e) {
      console.error('Failed to reset PIN:', e);
      alert("❌ Failed to reset PIN. Please try again.");
    }
  }
});

    const tryUnlock = async () => {
      const val = pinInput.value.trim();
      pinError.classList.add('hidden');
      if (!/^\d{4}$/.test(val)) {
        pinError.textContent = 'PIN must be 4 digits.';
        pinError.classList.remove('hidden');
        return;
      }
      try {
        if (isSetup) {
          // Back-compat acceptance: either legacy or new SHA-256 hex
          const candSha = await sha256Hex(val);
          const candLegacy = legacyPinHash(val);
          const savedHash = saved?.value;
          const savedAlg = saved?.alg; // may be undefined in older data

          const ok = (savedAlg === 'sha256-hex')
            ? (candSha === savedHash)
            : (candSha === savedHash || candLegacy === savedHash);

          if (ok) {
            pinOverlay.classList.add('hidden');
            el('app').classList.remove('hidden');
            pinInput.value = '';
            resolve(true);
          } else {
            pinError.textContent = 'Incorrect PIN.';
            pinError.classList.remove('hidden');
          }
        } else {
          // First-time setup → store strong hash
          const hash = await sha256Hex(val);
          await idbSet('settings', { key: 'pinHash', value: hash, alg: 'sha256-hex' });
          pinOverlay.classList.add('hidden');
          el('app').classList.remove('hidden');
          pinInput.value = '';
          toast('PIN set. Keep it safe.');
          resolve(true);
        }
      } catch (e) {
        console.error('PIN processing error:', e);
        pinError.textContent = 'Error processing PIN. Try again.';
        pinError.classList.remove('hidden');
      }
    };

    newPinSubmit.addEventListener('click', tryUnlock);
    pinInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') tryUnlock();
    });
  });
}

/* ====== Main ====== */
(async function () {
  db = await openDB();
  updateOnline();

  el('reportDate').value = istDateKey();

  el('txAmount').addEventListener('input', () => {
    const v = Number(el('txAmount').value || 0);
    el('amountInWords').textContent = v ? numToWords(v) + ' only' : '';
  });

  el('saveEntry').addEventListener('click', saveEntry);
  el('clearForm').addEventListener('click', clearForm);

  // ERASE ALL DATA BUTTON
  el('wipeAll')?.addEventListener('click', async () => {
    const pwd = prompt("Enter password to erase ALL data:");
    if (pwd !== "@Faruk123") {
      alert("❌ Incorrect password. Data not erased.");
      return;
    }
    const sure = confirm("⚠️ This will ERASE ALL transactions permanently. Continue?");
    if (!sure) return;
    await idbClear("transactions");
    await idbClear("edits");   // 🔥 clear all edits too
    await refreshTotals();
    await loadDayEntries();
    toast("🗑️ All accounting data erased.");
  });

  el('reportDate').addEventListener('change', loadDayEntries);


  
  el('loadDay').addEventListener('click', loadDayEntries);

  let exportMode = "pdf";
el('btnPdf').addEventListener('click', async () => {
  const date = el('reportDate').value || istDateKey();

  if (date === istDateKey()) {
    // ✅ Today → open denomination modal
    exportMode = "pdf";
    el('confirmDenom').textContent = "Generate PDF";
    const { totals } = await getDayData(date);
    el('denomModalBalance').textContent = rupeesForPDF(totals.balance);
    loadDefaultDenoms();
    el('reportDenomMatch').textContent = "";
    el('denomModal').classList.remove('hidden');
  } else {
    // ✅ Past date → load saved denominations or fallback
    const saved = await idbGet("denoms", date);
    if (saved) {
      await exportPDF(date, saved);
    } else {
      await exportSimplePDF(date);
    }
  }
});

  // --- Simple PDF export (no denomination) ---
el('exportSimplePDF').addEventListener('click', async () => {
  const date = el('reportDate').value || istDateKey();
  await exportSimplePDF(date);
});


  el('btnExcel').addEventListener('click', async () => {
  const date = el('reportDate').value || istDateKey();

  if (date === istDateKey()) {
    // ✅ Today → open denomination modal
    exportMode = "excel";
    el('confirmDenom').textContent = "Generate Excel";
    const { totals } = await getDayData(date);
    el('denomModalBalance').textContent = rupeesForPDF(totals.balance);
    loadDefaultDenoms();
    el('reportDenomMatch').textContent = "";
    el('denomModal').classList.remove('hidden');
  } else {
    // ✅ Past date → load saved denominations or fallback
    const saved = await idbGet("denoms", date);
    if (saved) {
      await exportExcel(date, saved);
    } else {
      await exportSimplePDF(date);
    }
  }
});


el('confirmDenom').addEventListener('click', async () => {
  const denomTotal = updateDenoms();
  const balance = parseINR(el('denomModalBalance').textContent);

  if (denomTotal !== balance) {
    el('reportDenomMatch').textContent = `❌ Denomination does not match balance. Still exporting...`;
    el('reportDenomMatch').className = "text-red-600 mt-1 text-sm";
    try {
      const diff = denomTotal - balance;
      const now = nowIST();
      const adj = {
        id: uuid(),
        dateKey: istDateKey(now),
        createdAt: now.toISOString(),
        type: 'adjustment',
        amount: diff,
        note: diff > 0 ? 'Excess money detected (denomination mismatch)' : 'Shortage detected (denomination mismatch)',
        meta: { source: 'denomCheck' }
      };
      await idbSet('transactions', adj);
      if ((el('reportDate').value || istDateKey()) === adj.dateKey) {
        await loadDayEntries();
      }
      await refreshTotals();
      toast('⚖️ Adjustment recorded');
    } catch (e) {
      console.error('Failed to record adjustment', e);
    }
  } else {
    el('reportDenomMatch').textContent = "✅ Denomination matches balance.";
    el('reportDenomMatch').className = "text-green-600 mt-1 text-sm";
  }

  // Always export after check
  setTimeout(async () => {
    // 🔥 Save today's denominations into DB AND create savedDenoms object
    const denoms = {};
    document.querySelectorAll("#reportDenomTbody tr").forEach(r => {
      const inp = r.querySelector("input");
      const v = Number(inp?.dataset?.val || 0);
      const c = Number(inp?.value || 0);
      if (c > 0) denoms[v] = c;
    });
    
    const savedDenoms = {
      dateKey: istDateKey(),
      values: denoms,
      total: denomTotal,
      savedAt: nowIST().toISOString()
    };

    // Save to database if it's today's date
    if ((el('reportDate').value || istDateKey()) === istDateKey()) {
      await idbSet("denoms", savedDenoms);
    }

    el('denomModal').classList.add('hidden');
    const date = el('reportDate').value || istDateKey();
    
    // 🔥 Pass savedDenoms to both export functions
    if (exportMode === "pdf") {
      await exportPDF(date, savedDenoms);
    } else {
      await exportExcel(date, savedDenoms);
    }
  }, 600);
});


  el('cancelDenom').addEventListener('click', () => el('denomModal').classList.add('hidden'));

  await showPinLock();
  await refreshTotals();
  await ensureTodayOpeningBalance();
  await loadDayEntries();
    // --- Auto shift closing → opening at midnight ---
  let currentDay = istDateKey();

  // Check every minute
  setInterval(async () => {
    const today = istDateKey();
    if (today !== currentDay) {
      currentDay = today;
      await ensureTodayOpeningBalance();
      await refreshTotals();
      await loadDayEntries();
      toast("🌙 New day started — Opening Balance created automatically.");
    }
  }, 60 * 1000); // check every 1 minute


// ✅ Handle correction checkbox (show open adjustments only)
el('txCorrection').addEventListener('change', async (e) => {
  const dropdown = el('txCorrectionAdjust');
  if (e.target.checked) {
    dropdown.innerHTML = ''; // 🔑 clear old entries first

    await refreshCorrectionDropdown();

    // 🔧 Add placeholder so first option can be selected properly
    const ph = new Option('— Select a correction —', '', true, true);
    ph.disabled = true;
    dropdown.insertBefore(ph, dropdown.firstChild);
    dropdown.value = ''; // make sure nothing is selected yet

    dropdown.classList.remove('hidden');
  } else {
    dropdown.classList.add('hidden');
    dropdown.innerHTML = '';
  }
});

})();

 // --- Auto set type + note when correction selected ---
function applyCorrectionFromSelected(selectEl) {
  const selected = selectEl.selectedOptions[0];
  if (!selected || !selected.dataset.kind) return;

  const kind = selected.dataset.kind;
  const amount = selected.dataset.amount;
  const date = istDisplayDate(selected.dataset.date);

  if (kind === "Shortage") {
    el('txType').value = "income";
    el('txType').disabled = true;
    el('txNote').value = `Correction: Shortage of ${rupeesForPDF(amount)} from ${date} resolved`;
  } else if (kind === "Excess") {
    el('txType').value = "expense";
    el('txType').disabled = true;
    el('txNote').value = `Correction: Excess of ${rupeesForPDF(amount)} from ${date} resolved`;
  }
}

el('txCorrectionAdjust').addEventListener('change', e => applyCorrectionFromSelected(e.target));
el('txCorrectionAdjust').addEventListener('click', e => applyCorrectionFromSelected(e.currentTarget));

// ✅ When correction box unticked → unlock fields
el('txCorrection').addEventListener('change', (e) => {
  if (!e.target.checked) {
    el('txType').disabled = false;
    el('txNote').value = ""; // clear auto note
  }
});
/* ====== Adjustment helpers (open balance) ====== */
async function getOpenAdjustments() {
  const all = await idbGetAll('transactions');

  // Originals = adjustments that are NOT reversals
  const originals = all.filter(t =>
    t.type === 'adjustment' && !(t.meta && t.meta.reversedAdjId)
  );

  // Sum of reversals per original
  const appliedMap = {};
  all.forEach(t => {
    if (t.type === 'adjustment' && t.meta && t.meta.reversedAdjId) {
      appliedMap[t.meta.reversedAdjId] = (appliedMap[t.meta.reversedAdjId] || 0) + t.amount;
    }
  });

  // openAmount = original.amount + sum(reversals)
  return originals
    .map(adj => {
      const applied = appliedMap[adj.id] || 0;
      const open = adj.amount + applied; // reversals carry sign
      return { ...adj, openAmount: open };
    })
    .filter(a => Math.round(a.openAmount) !== 0); // only show with remaining balance
}

async function refreshCorrectionDropdown() {
  const dropdown = el('txCorrectionAdjust');
  dropdown.innerHTML = '';
  const openList = await getOpenAdjustments();

  if (openList.length === 0) {
    dropdown.innerHTML = '<option>No open adjustments</option>';
    return;
  }

  openList.forEach(a => {
    const opt = document.createElement('option');
    opt.value = a.id;
    const kind = a.openAmount > 0 ? 'Excess' : 'Shortage';
    opt.textContent = `${istDisplayDate(a.dateKey)} → ${kind} ${rupeesForPDF(Math.abs(a.openAmount))}`;
    opt.dataset.kind   = kind;
    opt.dataset.amount = Math.abs(a.openAmount);
    opt.dataset.date   = a.dateKey;
    dropdown.appendChild(opt);
  });
}

// ✅ Suspense balance = all open adjustments not yet resolved
async function getSuspenseBalance() {
  const openList = await getOpenAdjustments();
  return openList.reduce((sum, a) => sum + a.openAmount, 0);
}


/* ====== Entry form ====== */
function clearForm() {
  // reset inputs
  el('txType').value = 'income';
  el('txAmount').value = '';
  el('amountInWords').textContent = '';
  el('txNote').value = '';

  // reset correction UI
  el('txCorrection').checked = false;
  const dd = el('txCorrectionAdjust');
  dd.classList.add('hidden');
  dd.innerHTML = '';
}

async function saveEntry() {
  try {
    const type = el('txType').value;
    const note = el('txNote').value.trim();
    const amount = Number(el('txAmount').value || 0);
    if (amount <= 0) {
      alert('Enter valid amount');
      return;
    }

    const now = nowIST();

    // --- If editing existing entry ---
if (editingId) {
  const oldTx = await idbGet("transactions", editingId);
  const newTx = { ...oldTx, type, amount, note };
  await idbSet("transactions", newTx);

  // Log edit
  await idbSet("edits", {
    id: uuid(),
    transactionId: editingId,
    txDateKey: oldTx.dateKey,   // 🔥 add this line
    oldValues: { type: oldTx.type, amount: oldTx.amount, note: oldTx.note },
    newValues: { type, amount, note },
    editedAt: now.toISOString()
  });

  editingId = null;
  clearForm();
  await refreshTotals();
  await loadDayEntries();
  toast("✅ Transaction updated.");
  return; // stop here
}


    if (el('txCorrection').checked) {
      // --- Correction flow: create ONLY the adjustment reversal entry
      const chosenId = el('txCorrectionAdjust').value;
      if (chosenId) {
        const openList = await getOpenAdjustments();
        const target = openList.find(a => a.id === chosenId);

        if (target) {
          const open = target.openAmount; // may be + (excess) or - (shortage)
          const reverseAbs = Math.min(Math.abs(open), amount);
          const reverseSigned = open > 0 ? -reverseAbs : +reverseAbs; // cancel the open

          const correction = {
            id: uuid(),
            dateKey: istDateKey(now),
            createdAt: now.toISOString(),
            type: "adjustment",
            amount: reverseSigned,
            note: note || `Correction via ${type}`,
            meta: {
              coveredBy: type,               // "income" or "expense"
              coveredAmount: amount,         // what user typed
              reversedAdjId: target.id,      // which original we’re covering
              reversedFrom: target.dateKey   // original date
            }
          };

          await idbSet('transactions', correction);
          toast('✅ Correction saved');
        }
      }
    } else {
      // --- Normal income / expense entry
      const data = {
        id: uuid(),
        dateKey: istDateKey(now),
        createdAt: now.toISOString(),
        type,
        amount,
        note
      };
      await idbSet('transactions', data);
      toast('✅ Entry saved');
    }

    // Reset form & refresh UI (instant)
    clearForm();
    await refreshTotals();
    await loadDayEntries();

    // If the correction box is open again, repopulate with fresh open balances
    if (el('txCorrection').checked) {
      await refreshCorrectionDropdown();
    }
  } catch (err) {
    console.error('Save failed:', err);
    alert('Save failed. Please try again.');
  }
}

/* ====== Totals ====== */
async function ensureTodayOpeningBalance() {
  const today = istDateKey();
  const all = await idbGetAll("transactions");

  // If today's opening already exists, do nothing
  if (all.some(t => t.dateKey === today && t.meta?.isOpening)) return;

  // Look at yesterday’s closing
  const yesterday = dayjs(today).subtract(1, "day").format("YYYY-MM-DD");
  const yList = all.filter(t => t.dateKey === yesterday);

  let openingAmt = 0;
  if (yList.length) {
    const totals = { income: 0, expense: 0, adjustment: 0 };
    yList.forEach(r => {
      if (r.type === "income") totals.income += r.amount;
      if (r.type === "expense") totals.expense += r.amount;
      if (r.type === "adjustment") totals.adjustment += r.amount;
    });
    openingAmt = totals.income - totals.expense + totals.adjustment;
  }

  // Create today’s opening
  const now = nowIST();
  const openingEntry = {
    id: uuid(),
    dateKey: today,
    createdAt: now.toISOString(),
    type: "income", // looks like income
    amount: openingAmt,
    note: "Opening Balance",
    meta: { isOpening: true }
  };
  await idbSet("transactions", openingEntry);
}

async function refreshTotals(forDate) {
  const dateKey = forDate || (el('reportDate')?.value || istDateKey());
  const all = await idbGetAll('transactions');
  const day = all.filter(t => t.dateKey === dateKey);

  const inc = day.filter(t => t.type === 'income').reduce((a, b) => a + b.amount, 0);
  const exp = day.filter(t => t.type === 'expense').reduce((a, b) => a + b.amount, 0);
  const adj = day.filter(t => t.type === 'adjustment').reduce((a, b) => a + b.amount, 0);

  const balance = inc - exp + adj;

  el('totalIncome').textContent  = rupeesForPDF(inc);
  el('totalExpense').textContent = rupeesForPDF(exp);
  el('currentBalance').textContent = rupeesForPDF(balance);

  // 🔥 Show suspense balance (open mismatches carry-forwarded)
const suspense = await getSuspenseBalance();
const adjEl = el('adjustmentCard');
if (adjEl) {
  if (suspense > 0) {
    adjEl.textContent = `Excess: ${rupeesForPDF(suspense)}`;
    adjEl.className = "text-xl font-bold text-green-600";
  } else if (suspense < 0) {
    adjEl.textContent = `Shortage: ${rupeesForPDF(Math.abs(suspense))}`;
    adjEl.className = "text-xl font-bold text-red-600";
  } else {
    adjEl.textContent = "No Suspense";
    adjEl.className = "text-xl font-bold text-gray-600";
  }
}

}

/* ====== Load Entries (missing earlier — now added) ====== */
async function loadDayEntries() {
  const date = el('reportDate').value || istDateKey();
  const { list } = await getDayData(date);
  renderList(list);
  await refreshTotals(date);

  // Show count of open adjustments as "mismatches"
  try {
    const openList = await getOpenAdjustments();
    el('mismatchBadge').textContent = `Mismatches: ${openList.length}`;
  } catch {
    // ignore badge update errors
  }
}

/* ====== Render List ====== */
function renderList(entries) {
  const tbody = el("listTbody");
  tbody.innerHTML = "";
  entries.forEach(tx => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="py-1">${tx.meta?.isOpening ? "--" : istDisplayTime(tx.createdAt)}</td>
      <td class="py-1">
        ${tx.type === "income" ? "💰 Income" : tx.type === "expense" ? "💸 Expense" : "⚖️ Adjustment"}
      </td>
      <td class="py-1">${rupeesForPDF(tx.amount)}</td>
      <td class="py-1">${tx.note || ""}</td>
      <td class="py-1 text-center">
        <button class="editBtn px-2 py-1 bg-blue-500 text-white rounded-md text-xs mr-1" data-id="${tx.id}">✏️</button>
        <button class="deleteBtn px-2 py-1 bg-red-500 text-white rounded-md text-xs" data-id="${tx.id}">🗑️</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// === Handle Edit / Delete button clicks (single listener) ===
document.addEventListener("click", async (e) => {
  const target = e.target;

  // Delete flow
  if (target.classList.contains("deleteBtn")) {
    const id = target.dataset.id;
    const pwd = prompt("Enter password to delete:");
    if (pwd !== "@Faruk123") {
      alert("❌ Incorrect password. Transaction not deleted.");
      return;
    }
    try {
      await idbDelete("transactions", id);
      await loadDayEntries();
      await refreshTotals();
      toast("🗑️ Transaction deleted.");
    } catch (err) {
      console.error("Delete failed:", err);
      alert("Failed to delete. Check console.");
    }
    return;
  }

  // Edit flow (prompt-based)
  if (target.classList.contains("editBtn")) {
    const id = target.dataset.id;
    const tx = await idbGet("transactions", id);
    if (!tx) {
      alert("Transaction not found.");
      return;
    }

    // Disallow editing for opening balance / adjustments / corrections
    if (tx.meta?.isOpening) {
      alert("Opening balance cannot be edited.");
      return;
    }
    if (tx.type !== "income" && tx.type !== "expense") {
      alert("Only income/expense entries can be edited. Adjustments/corrections are not editable.");
      return;
    }

    // Only allow editing of today's entries
    const today = istDateKey();
    const txDate = dayjs(tx.createdAt).tz(IST_TZ).format("YYYY-MM-DD");
    if (today !== txDate) {
      alert("You can only edit today's entries.");
      return;
    }

    // Prompts: get new amount and note (if canceled, do nothing)
    const newAmountStr = prompt("Enter new amount (₹):", tx.amount);
    if (newAmountStr === null) return;
    const newAmount = Number(newAmountStr);
    if (isNaN(newAmount) || newAmount <= 0) {
      alert("Invalid amount.");
      return;
    }

    const newNote = prompt("Enter new note:", tx.note || "") || "";

    try {
      // Update only amount and note (preserve dateKey, createdAt, type, meta, id)
      const newTx = { ...tx, amount: newAmount, note: newNote };
      await idbSet("transactions", newTx);

    
      // Log the edit
await idbSet("edits", {
  id: uuid(),
  transactionId: id,
  txDateKey: tx.dateKey,   // 🔥 link edit to the transaction’s original day
  oldValues: { type: tx.type, amount: tx.amount, note: tx.note },
  newValues: { type: tx.type, amount: newAmount, note: newNote },
  editedAt: nowIST().toISOString()
});


      await loadDayEntries();
      await refreshTotals();
      toast("✅ Transaction updated.");
    } catch (err) {
      console.error("Edit failed:", err);
      alert("Failed to update transaction. See console.");
    }
  }
});


/* ====== Report Data ====== */
async function getDayData(dateKey) {
  const rowsAll = await idbGetAll('transactions');
  const rows = rowsAll.filter(r => r.dateKey === dateKey);
  const list = rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const totals = { income: 0, expense: 0, adjustment: 0, balance: 0 };
  list.forEach(r => {
    if (r.type === 'income') totals.income += r.amount;
    if (r.type === 'expense') totals.expense += r.amount;
    if (r.type === 'adjustment') totals.adjustment += r.amount;
  });
  totals.balance = totals.income - totals.expense + totals.adjustment;
  return { list, totals };
}

/* ====== Denominations Helpers ====== */
function loadDefaultDenoms() {
  const denoms = [500, 200, 100, 50, 20, 10, 5, 2, 1];  // No ₹2000
  const tbody = el('reportDenomTbody');
  tbody.innerHTML = '';
  denoms.forEach(v => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="text-center">₹${v}</td>
      <td><input type="number" min="0" class="denomCount input w-20 text-center" value="0" data-val="${v}" /></td>
      <td class="denomSubtotal text-center">₹0</td>
    `;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('input').forEach(inp => {
    inp.addEventListener('input', updateDenoms);
  });
  updateDenoms();
}

function updateDenoms() {
  let total = 0;

  // Calculate denomination total
  document.querySelectorAll('#reportDenomTbody tr').forEach(r => {
    const v = Number(r.querySelector('input').dataset.val);
    const c = Number(r.querySelector('input').value || 0);
    const sub = v * c;
    r.querySelector('.denomSubtotal').textContent = rupeesForPDF(sub);
    total += sub;
  });

  el('reportDenomTotal').textContent = rupeesForPDF(total);

  // ✅ Always read latest balance from modal text
  const balanceStr = el('denomModalBalance').textContent || "0";
  const balance = parseINR(balanceStr);

  // Compare denomination total vs balance
  const diff = total - balance;

  if (diff === 0) {
    el('reportDenomMatch').textContent = "✅ Exact match";
    el('reportDenomMatch').className = "text-green-600 mt-1 text-sm text-center";
  } else if (diff < 0) {
    el('reportDenomMatch').textContent = `− ${rupeesForPDF(Math.abs(diff))} left`;
    el('reportDenomMatch').className = "text-yellow-600 mt-1 text-sm text-center";
  } else {
    el('reportDenomMatch').textContent = `+ ${rupeesForPDF(diff)} excess`;
    el('reportDenomMatch').className = "text-red-600 mt-1 text-sm text-center";
  }

  return total;
}

/* ====== Export PDF (Corporate Style with dinomination) ====== */
async function exportPDF(dateKey, savedDenoms = null) {
  const { list, totals } = await getDayData(dateKey);
  const rows = list;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  // --- Header ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Daily Cash Report", 105, 20, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`Date: ${istDisplayDate(dateKey)}`, 14, 32);
  const genTime = dayjs().tz(IST_TZ).format("DD-MM-YYYY hh:mm A");
  doc.text(`Generated on: ${genTime}`, 14, 39);

  let y = 50;

  // --- Income ---
  const incomes = rows.filter(r => r.type === "income");
  if (incomes.length) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Income Entries", 14, y);
    y += 8;

    doc.autoTable({
      head: [["Time", "Amount", "Note"]],
      body: incomes.map(r => [
        r.meta?.isOpening ? "--" : istDisplayTime(r.createdAt),
        rupeesForPDF(r.amount),
        r.note || ""
      ]),
      startY: y,
      theme: "grid",
      headStyles: { fillColor: [0, 100, 0] },
    });
    y = doc.lastAutoTable.finalY + 15;
  }

  // --- Expense ---
  const expenses = rows.filter(r => r.type === "expense");
  if (expenses.length) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Expense Entries", 14, y);
    y += 8;

    doc.autoTable({
      head: [["Time", "Amount", "Note"]],
      body: expenses.map(r => [
        istDisplayTime(r.createdAt),
        rupeesForPDF(r.amount),
        r.note || ""
      ]),
      startY: y,
      theme: "grid",
      headStyles: { fillColor: [139, 0, 0] },
    });
    y = doc.lastAutoTable.finalY + 15;
  }

  // --- Summary ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Summary", 14, y);
  y += 8;

 const suspenseBalance = await getSuspenseBalance();

const summaryRows = [
  ["Total Cash Deposit", rupeesForPDF(totals.income)],
  ["Total Expense", rupeesForPDF(totals.expense)],
  ["Closing Amount", rupeesForPDF(totals.balance)],
  ["Excess / Shortage (Today)", (totals.adjustment >= 0 ? "+" : "- ") + rupeesForPDF(Math.abs(totals.adjustment))],
  ["Suspense Balance (Unresolved)", rupeesForPDF(suspenseBalance)]
];


  doc.autoTable({
    head: [["Category", "Amount"]],
    body: summaryRows,
    startY: y,
    theme: "grid",
    headStyles: { fillColor: [0, 0, 120] },
    styles: { fontStyle: "bold" }
  });
  y = doc.lastAutoTable.finalY + 15;

  // --- Resolved Adjustments ---
  const resolved = rows.filter(r => r.type === "adjustment" && r.meta?.reversedAdjId);
  if (resolved.length) {
    y = doc.lastAutoTable ? doc.lastAutoTable.finalY + 15 : y + 15;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Resolved Adjustments", 14, y);
    y += 8;

    doc.autoTable({
      head: [["Original Date", "Resolved Amount", "Covered By", "Note"]],
      body: resolved.map(r => [
        istDisplayDate(r.meta.reversedFrom),
        rupeesForPDF(Math.abs(r.amount)),
        r.meta.coveredBy,
        r.note || ""
      ]),
      startY: y,
      theme: "grid",
      headStyles: { fillColor: [0, 80, 150] }
    });
    y = doc.lastAutoTable.finalY + 15;
  }

  // --- Denominations ---
let denomRows = [];
let denomTotal = 0;

if (savedDenoms) {
  // ✅ Use saved denominations (for past dates)
  Object.entries(savedDenoms.values).forEach(([v, c]) => {
    const sub = v * c;
    denomRows.push([`${v}`, c, rupeesForPDF(sub)]);
    denomTotal += sub;
  });
} else {
  // ✅ Use current modal input (for today)
  document.querySelectorAll("#reportDenomTbody tr").forEach(r => {
    const inp = r.querySelector("input");
    const v = Number(inp?.dataset?.val || 0);
    const c = Number(inp?.value || 0);
    if (c > 0) {
      const sub = v * c;
      denomRows.push([`${v}`, c, rupeesForPDF(sub)]);
      denomTotal += sub;
    }
  });
}


  if (denomRows.length) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Denominations", 14, y);
    y += 8;

    doc.autoTable({
      head: [["Denomination", "Count", "Subtotal"]],
      body: denomRows,
      startY: y,
      theme: "grid",
      headStyles: { fillColor: [100, 50, 0] },
    });
    y = doc.lastAutoTable.finalY + 15;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(`Denomination Total: ${rupeesForPDF(denomTotal)}`, 14, y);
    y += 8;
  }

  // --- Denomination Match Status ---
  const balanceStr = el('denomModalBalance').textContent || "0";
  const balance = parseINR(balanceStr);   // ✅ use modal balance instead of totals.balance
  const diff = denomTotal - balance;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  if (diff === 0) {
    doc.text(" Denomination matched with balance.", 14, y);
  } else if (diff > 0) {
    doc.text(` Denomination shows EXCESS of ${rupeesForPDF(diff)}`, 14, y);
  } else {
    doc.text(` Denomination shows SHORTAGE of ${rupeesForPDF(Math.abs(diff))}`, 14, y);
  }
  y += 12;


    // --- Edits Section ---
  const allEdits = await idbGetAll("edits");
const dayEdits = allEdits.filter(e => e.txDateKey === dateKey);

  if (dayEdits.length) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Edits", 14, y);
    y += 8;

    doc.autoTable({
      head: [["Time", "Old Entry", "New Entry"]],
      body: dayEdits.map(e => {
        const t = dayjs(e.editedAt).tz(IST_TZ).format("HH:mm");
        const oldStr = `${e.oldValues.type} ${rupeesForPDF(e.oldValues.amount)}\n"${e.oldValues.note || ""}"`;
        const newStr = `${e.newValues.type} ${rupeesForPDF(e.newValues.amount)}\n"${e.newValues.note || ""}"`;
        return [t, oldStr, newStr];
      }),
      startY: y,
      theme: "grid",
      headStyles: { fillColor: [80, 0, 80] },
      styles: { fontSize: 10, cellWidth: "wrap" },
      columnStyles: {
        0: { cellWidth: 25 }, // Time
        1: { cellWidth: 75 }, // Old
        2: { cellWidth: 75 }  // New
      }
    });
    y = doc.lastAutoTable.finalY + 15;
  }

  
  // --- Footer ---
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text("This is a system generated report. No manual alterations.", 105, 290, { align: "center" });



  doc.save(`report-${dateKey}.pdf`);
  toast("📄 Corporate PDF exported.");
}
// Export pdf without dinomination
// Export PDF without denomination
async function exportSimplePDF(dateKey) {
  const { list, totals } = await getDayData(dateKey);
  const rows = list;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  // --- Header ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Daily Cash Report", 105, 20, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`Date: ${istDisplayDate(dateKey)}`, 14, 32);
  const genTime = dayjs().tz(IST_TZ).format("DD-MM-YYYY hh:mm A");
  doc.text(`Generated on: ${genTime}`, 14, 39);

  let y = 50;

  // --- Income ---
  const incomes = rows.filter(r => r.type === "income");
  if (incomes.length) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Income Entries", 14, y);
    y += 8;

    doc.autoTable({
      head: [["Time", "Amount", "Note"]],
      body: incomes.map(r => [
        r.meta?.isOpening ? "--" : istDisplayTime(r.createdAt),
        rupeesForPDF(r.amount),
        r.note || ""
      ]),
      startY: y,
      theme: "grid",
      headStyles: { fillColor: [0, 100, 0] },
    });
    y = doc.lastAutoTable.finalY + 15;
  }

  // --- Expense ---
  const expenses = rows.filter(r => r.type === "expense");
  if (expenses.length) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Expense Entries", 14, y);
    y += 8;

    doc.autoTable({
      head: [["Time", "Amount", "Note"]],
      body: expenses.map(r => [
        istDisplayTime(r.createdAt),
        rupeesForPDF(r.amount),
        r.note || ""
      ]),
      startY: y,
      theme: "grid",
      headStyles: { fillColor: [139, 0, 0] },
    });
    y = doc.lastAutoTable.finalY + 15;
  }

  // --- Summary ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Summary", 14, y);
  y += 8;

  const summaryRows = [
    ["Total Cash Deposit", rupeesForPDF(totals.income)],
    ["Total Expense", rupeesForPDF(totals.expense)],
    ["Closing Amount", rupeesForPDF(totals.balance)],
    ["Excess / Shortage",
      (totals.adjustment >= 0 ? "+" : "- ") + rupeesForPDF(Math.abs(totals.adjustment))]
  ];

  doc.autoTable({
    head: [["Category", "Amount"]],
    body: summaryRows,
    startY: y,
    theme: "grid",
    headStyles: { fillColor: [0, 0, 120] },
    styles: { fontStyle: "bold" }
  });
  y = doc.lastAutoTable.finalY + 15;

  // --- Resolved Adjustments ---
  const resolved = rows.filter(r => r.type === "adjustment" && r.meta?.reversedAdjId);
  if (resolved.length) {
    y = doc.lastAutoTable ? doc.lastAutoTable.finalY + 15 : y + 15;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Resolved Adjustments", 14, y);
    y += 8;

    doc.autoTable({
      head: [["Original Date", "Resolved Amount", "Covered By", "Note"]],
      body: resolved.map(r => [
        istDisplayDate(r.meta.reversedFrom),
        rupeesForPDF(Math.abs(r.amount)),
        r.meta.coveredBy,
        r.note || ""
      ]),
      startY: y,
      theme: "grid",
      headStyles: { fillColor: [0, 80, 150] }
    });
    y = doc.lastAutoTable.finalY + 15;
  }

  // --- Edits Section ---
  const allEdits = await idbGetAll("edits");
  const dayEdits = allEdits.filter(e => e.txDateKey === dateKey);

  if (dayEdits.length) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Edits", 14, y);
    y += 8;

    doc.autoTable({
      head: [["Time", "Old Entry", "New Entry"]],
      body: dayEdits.map(e => {
        const t = dayjs(e.editedAt).tz(IST_TZ).format("HH:mm");
        const oldStr = `${e.oldValues.type} ${rupeesForPDF(e.oldValues.amount)}\n"${e.oldValues.note || ""}"`;
        const newStr = `${e.newValues.type} ${rupeesForPDF(e.newValues.amount)}\n"${e.newValues.note || ""}"`;
        return [t, oldStr, newStr];
      }),
      startY: y,
      theme: "grid",
      headStyles: { fillColor: [80, 0, 80] },
      styles: { fontSize: 10, cellWidth: "wrap" },
      columnStyles: {
        0: { cellWidth: 25 }, // Time
        1: { cellWidth: 75 }, // Old
        2: { cellWidth: 75 }  // New
      }
    });
    y = doc.lastAutoTable.finalY + 15;
  }

  // --- Footer ---
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text("This is a system generated report (no denomination section).", 105, 290, { align: "center" });

  doc.save(`report-simple-${dateKey}.pdf`);
  toast("📄 Simple PDF exported (no denomination).");
}

/* ====== Export Excel (Corporate Professional Style) ====== */
async function exportExcel(dateKey, savedDenoms = null) {
  const { list, totals } = await getDayData(dateKey);
  const wb = XLSX.utils.book_new();

  const wsData = [];

  // --- Title ---
  wsData.push(["Daily Cash Report"]);
  wsData.push([]);
  wsData.push([`Date: ${istDisplayDate(dateKey)}`]);
  wsData.push([`Generated on: ${dayjs().tz(IST_TZ).format("DD-MM-YYYY hh:mm A")}`]);
  wsData.push([]);

  // --- Income ---
  const incomes = list.filter(r => r.type === "income");
  if (incomes.length) {
    wsData.push(["Income Entries"]);
    wsData.push(["Time", "Amount", "Note"]);
    incomes.forEach(r => {
      wsData.push([
        r.meta?.isOpening ? "--" : istDisplayTime(r.createdAt),
        r.amount,
        r.note || ""
      ]);
    });
    wsData.push([]);
  }

  // --- Expense ---
  const expenses = list.filter(r => r.type === "expense");
  if (expenses.length) {
    wsData.push(["Expense Entries"]);
    wsData.push(["Time", "Amount", "Note"]);
    expenses.forEach(r => {
      wsData.push([
        istDisplayTime(r.createdAt),
        r.amount,
        r.note || ""
      ]);
    });
    wsData.push([]);
  }

  // --- Adjustments ---
  const adjustments = list.filter(r => r.type === "adjustment");
  if (adjustments.length) {
    wsData.push(["Adjustments"]);
    wsData.push(["Time", "Amount", "Note"]);
    adjustments.forEach(r => {
      wsData.push([
        istDisplayTime(r.createdAt),
        r.amount,
        r.note || ""
      ]);
    });
    wsData.push([]);
  }

  // --- Summary ---
  const suspenseBalance = await getSuspenseBalance();
  wsData.push(["Summary"]);
  wsData.push(["Total Income", totals.income]);
  wsData.push(["Total Expense", totals.expense]);
  wsData.push(["Adjustment", totals.adjustment]);
  wsData.push(["Closing Balance", totals.balance]);
  wsData.push(["Suspense Balance (Unresolved)", suspenseBalance]);
  wsData.push([]);

  // --- Denominations ---
  wsData.push(["Denominations"]);
  wsData.push(["Denomination", "Count", "Subtotal"]);
  
  let denomTotalExcel = 0;
  
  if (savedDenoms) {
    // ✅ Use saved denominations (for past dates)
    Object.entries(savedDenoms.values).forEach(([v, c]) => {
      const sub = v * c;
      denomTotalExcel += sub;
      wsData.push([v, c, sub]);
    });
  } else {
    // ✅ Use current modal input (for today)
    document.querySelectorAll("#reportDenomTbody tr").forEach(r => {
      const inp = r.querySelector("input");
      const v = Number(inp?.dataset?.val || 0);
      const c = Number(inp?.value || 0);
      if (c > 0) {
        const sub = v * c;
        denomTotalExcel += sub;
        wsData.push([v, c, sub]);
      }
    });
  }
  
  wsData.push(["Total", "", denomTotalExcel]);
  wsData.push([]);

  // --- Denomination Match Status ---
  const balanceStr = el('denomModalBalance').textContent || "0";
  const balance = parseINR(balanceStr);
  const diff = denomTotalExcel - balance;

  if (diff === 0) {
    wsData.push(["✅ Denomination matched with balance."]);
  } else if (diff > 0) {
    wsData.push([`⚠️ Denomination shows EXCESS of Rs${diff.toLocaleString('en-IN')}`]);
  } else {
    wsData.push([`⚠️ Denomination shows SHORTAGE of Rs${Math.abs(diff).toLocaleString('en-IN')}`]);
  }
  wsData.push([]);

  // --- Edits Section ---
  const allEdits = await idbGetAll("edits");
  const dayEdits = allEdits.filter(e => e.txDateKey === dateKey);

  if (dayEdits.length) {
    wsData.push(["Edits"]);
    wsData.push(["Time", "Old Entry", "New Entry"]);
    dayEdits.forEach(e => {
      const t = dayjs(e.editedAt).tz(IST_TZ).format("HH:mm");
      const oldStr = `${e.oldValues.type} Rs${e.oldValues.amount} "${e.oldValues.note || ""}"`;
      const newStr = `${e.newValues.type} Rs${e.newValues.amount} "${e.newValues.note || ""}"`;
      wsData.push([t, oldStr, newStr]);
    });
    wsData.push([]);
  }

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // --- Corporate Styling ---
  ws['!cols'] = [
    { wch: 20 }, // Time / label
    { wch: 18 }, // Amount
    { wch: 40 }  // Notes
  ];

  // Helper: apply style
  const setStyle = (cell, style) => {
    if (ws[cell]) {
      ws[cell].s = style;
    }
  };

  // Title style
  setStyle("A1", {
    font: { bold: true, sz: 16, color: { rgb: "1F497D" } },
    alignment: { horizontal: "center" }
  });

  // Find and style section headers
  Object.keys(ws).forEach(addr => {
    const val = ws[addr]?.v;
    if (["Income Entries", "Expense Entries", "Adjustments", "Summary", "Denominations", "Edits"].includes(val)) {
      ws[addr].s = {
        font: { bold: true, sz: 13, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: "4F81BD" } },
        alignment: { horizontal: "left" }
      };
    }
    // Table headers
    if (["Time", "Amount", "Note", "Denomination", "Count", "Subtotal", "Old Entry", "New Entry"].includes(val)) {
      ws[addr].s = {
        font: { bold: true, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: "1F497D" } },
        alignment: { horizontal: "center" }
      };
    }
  });

  // Currency format for amounts
  Object.keys(ws).forEach(addr => {
    if (addr.startsWith("B") || addr.startsWith("C")) {
      if (typeof ws[addr].v === "number") {
        ws[addr].t = "n";
        ws[addr].z = "₹#,##0";
        ws[addr].s = { alignment: { horizontal: "right" } };
      }
    }
  });

  // Footer
  const lastRow = wsData.length + 2;
  ws[`A${lastRow}`] = {
    v: "This is a system generated report. No manual alterations.",
    s: { font: { italic: true, color: { rgb: "808080" } } }
  };

  XLSX.utils.book_append_sheet(wb, ws, "Report");
  XLSX.writeFile(wb, `report-${dateKey}.xlsx`);
  toast("📊 Professional Excel exported.");
}
