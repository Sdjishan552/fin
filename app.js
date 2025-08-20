/* ====== Utilities ====== */
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
function parseINR(txt) {
  return Number(String(txt).replace(/[^\d.-]/g, '')) || 0; // strips everything except digits, dot, minus
}

function el(id) { return document.getElementById(id); }

function toast(msg, ms = 2000) {
  const t = document.createElement('div');
  t.className = 'fixed bottom-4 left-1/2 -translate-x-1/2 bg-black text-white text-sm px-3 py-2 rounded-lg z-[70]';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

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

/* ====== PIN lock (local) ====== */
async function sha256(str) {
  const enc = new TextEncoder().encode(str);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
async function showPinLock() {
  const pinOverlay = el('pinOverlay');
  const pinInput = el('pinInput');
  const pinSubmit = el('pinSubmit'); // ✅ Unlock button
  const pinReset = el('pinReset');
  const pinError = el('pinError');
  const saved = await idbGet('settings', 'pinHash');

  const isSetup = !!saved?.value;
  el('pinSubheading').textContent = isSetup ? 'This keeps data private on this device.' : 'Create a 4-digit PIN for this device.';

  pinOverlay.classList.remove('hidden');
  el('app').classList.add('hidden');

  pinReset.addEventListener('click', async () => {
    if (!confirm('This will erase all app data on this device. Continue?')) return;
    indexedDB.deleteDatabase('simple-accounting');
    localStorage.clear();
    location.reload();
  });

  pinSubmit.addEventListener('click', async () => {
    const val = pinInput.value.trim();
    pinError.classList.add('hidden');
    if (!/^\d{4}$/.test(val)) {
      pinError.textContent = 'PIN must be 4 digits.';
      pinError.classList.remove('hidden');
      return;
    }
    const hash = await sha256(val);
    if (isSetup) {
      if (hash === saved?.value) {
        pinOverlay.classList.add('hidden');
        el('app').classList.remove('hidden');
      } else {
        pinError.textContent = 'Incorrect PIN.';
        pinError.classList.remove('hidden');
      }
    } else {
      await idbSet('settings', { key: 'pinHash', value: hash });
      pinOverlay.classList.add('hidden');
      el('app').classList.remove('hidden');
      toast('PIN set. Keep it safe.');
    }
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
    await refreshTotals();
    await loadDayEntries();
    toast("🗑️ All accounting data erased.");
  });


  el('reportDate').addEventListener('change', loadDayEntries);
  el('loadDay').addEventListener('click', loadDayEntries);

  let exportMode = "pdf";
  el('btnPdf').addEventListener('click', async () => {
    exportMode = "pdf";
    el('confirmDenom').textContent = "Generate PDF";
    const date = el('reportDate').value || istDateKey();
    const { totals } = await getDayData(date);
    el('denomModalBalance').textContent = rupeesForPDF(totals.balance);
    loadDefaultDenoms();
    el('reportDenomMatch').textContent = "";
    el('denomModal').classList.remove('hidden');
  });

  el('btnExcel').addEventListener('click', async () => {
    exportMode = "excel";
    el('confirmDenom').textContent = "Generate Excel";
    const date = el('reportDate').value || istDateKey();
    const { totals } = await getDayData(date);
    el('denomModalBalance').textContent = rupeesForPDF(totals.balance);
    loadDefaultDenoms();
    el('reportDenomMatch').textContent = "";
    el('denomModal').classList.remove('hidden');
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
  id: crypto.randomUUID(),
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
    el('denomModal').classList.add('hidden');
    const date = el('reportDate').value || istDateKey();
    if (exportMode === "pdf") {
      await exportPDF(date);
    } else {
      await exportExcel(date);
    }
  }, 600);
});


  el('cancelDenom').addEventListener('click', () => el('denomModal').classList.add('hidden'));

  await showPinLock();
  await refreshTotals();
  await loadDayEntries();

   // ✅ Step 2: Handle correction checkbox (show open adjustments only)
el('txCorrection').addEventListener('change', async (e) => {
  const dropdown = el('txCorrectionAdjust');
  if (e.target.checked) {
    await refreshCorrectionDropdown();
    dropdown.classList.remove('hidden');
  } else {
    dropdown.classList.add('hidden');
    dropdown.innerHTML = '';
  }
});

})();

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
    // show OPEN amount, not original
    opt.textContent = `${istDisplayDate(a.dateKey)} → ${kind} ${rupeesForPDF(Math.abs(a.openAmount))} (open)`;
    dropdown.appendChild(opt);
  });
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
            id: crypto.randomUUID(),
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
        id: crypto.randomUUID(),
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
async function refreshTotals() {
  const all = await idbGetAll('transactions');
  const inc = all.filter(t => t.type === 'income').reduce((a, b) => a + b.amount, 0);
  const exp = all.filter(t => t.type === 'expense').reduce((a, b) => a + b.amount, 0);
  const adj = all.filter(t => t.type === 'adjustment').reduce((a, b) => a + b.amount, 0);

  const balance = inc - exp + adj;

  // Update main cards
  el('totalIncome').textContent = rupeesForPDF(inc);
  el('totalExpense').textContent = rupeesForPDF(exp);
  el('currentBalance').textContent = rupeesForPDF(balance);

  // Update Adjustment card
  const adjEl = el('adjustmentCard');
  if (adjEl) {
    if (adj > 0) {
      adjEl.textContent = `+${rupeesForPDF(adj)}`;
      adjEl.className = "font-bold text-lg text-green-600";
    } else if (adj < 0) {
      adjEl.textContent = `-${rupeesForPDF(Math.abs(adj))}`;
      adjEl.className = "font-bold text-lg text-red-600";
    } else {
      adjEl.textContent = rupeesForPDF(0);
      adjEl.className = "font-bold text-lg text-gray-600";
    }
  }
}



/* ====== Load Entries ====== */
async function loadDayEntries() {
  const date = el('reportDate').value || istDateKey();
  const list = await idbGetAll('transactions');
  const filtered = list
    .filter(t => t.dateKey === date)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  renderList(filtered);

  // If correction mode is on, keep its dropdown fresh
  if (el('txCorrection').checked) {
    await refreshCorrectionDropdown();
  }
}

function renderList(arr) {
  const tbody = el('listTbody');
  tbody.innerHTML = '';
  arr.forEach(tx => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${istDisplayTime(tx.createdAt)}</td>
      <td>${tx.type === 'income' ? 'Income 💰' : (tx.type === 'expense' ? 'Expense 💸' : 'Adjustment ⚖️')}</td>
      <td>${rupeesForPDF(tx.amount)}</td>
      <td>${tx.note || '-'}</td>
      <td>
        <button data-id="${tx.id}" class="editEntry bg-blue-600 text-white px-2 py-1 rounded-md text-xs hover:bg-blue-700">Edit</button>
        <button data-id="${tx.id}" class="deleteEntry bg-rose-600 text-white px-2 py-1 rounded-md text-xs hover:bg-rose-700">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('button.deleteEntry').forEach(btn => {
    btn.addEventListener('click', async () => {
      const pass = prompt("Enter password to delete:");
      if (pass !== "@Faruk123") {
        toast("❌ Incorrect password. Cannot delete.", 4000);
        return;
      }
      if (confirm('Are you sure you want to delete this entry?')) {
        await idbDelete('transactions', btn.dataset.id);
        loadDayEntries();
        refreshTotals();
        toast("🗑️ Deleted");
      }
    });
  });

  tbody.querySelectorAll('button.editEntry').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const list = await idbGetAll('transactions');
      const tx = list.find(x => x.id === id);
      if (!tx) return;
      const amount = prompt('Edit amount (₹):', tx.amount);
      if (amount === null) return;
      const amt = Number(amount || 0);
      if (!Number.isFinite(amt) || amt <= 0) { alert('Invalid amount'); return; }
      const note = prompt('Edit note:', tx.note || '') ?? tx.note;
      const oldData = { amount: tx.amount, note: tx.note };
      tx.amount = amt;
      tx.note = (note || '').trim();
      await idbSet('edits', {
        id: crypto.randomUUID(),
        txId: tx.id,
        dateKey: tx.dateKey,
        time: nowIST().toISOString(),
        old: oldData,
        new: { amount: tx.amount, note: tx.note }
      });
      await idbSet('transactions', tx);
      loadDayEntries();
      refreshTotals();
      toast("✅ Entry updated");
    });
  });
}

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
  document.querySelectorAll('#reportDenomTbody tr').forEach(r => {
    const v = Number(r.querySelector('input').dataset.val);
    const c = Number(r.querySelector('input').value || 0);
    const sub = v * c;
    r.querySelector('.denomSubtotal').textContent = rupeesForPDF(sub);
    total += sub;
  });
  el('reportDenomTotal').textContent = rupeesForPDF(total);

  // Compare with balance and show +/- (modal display only)
  const balance = parseINR(el('denomModalBalance').textContent);

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

/* ====== Export PDF ====== */
// (keeping your corporate PDF export unchanged)
/* ====== Export PDF (Corporate Style) ====== */
/* ====== Export PDF (Corporate Style) ====== */
async function exportPDF(dateKey) {
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
    doc.text("Cash Deposit", 14, y);
    y += 8;

    doc.autoTable({
      head: [["Time", "Amount", "Note"]],
      body: incomes.map(r => [
        istDisplayTime(r.createdAt),
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


  // --- Denominations ---
  const denomRows = [];
  document.querySelectorAll("#reportDenomTbody tr").forEach(r => {
    const inp = r.querySelector("input");
    const v = Number(inp?.dataset?.val || 0);
    const c = Number(inp?.value || 0);
    if (c > 0) denomRows.push([`${v}`, c, rupeesForPDF(v * c)]);
  });

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

    const denomTotal = denomRows.reduce((a, [, , sub]) => a + parseINR(sub), 0);


    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(`Denomination Total: ${rupeesForPDF(denomTotal)}`, 14, y);
    y += 8;
  }

// --- Denomination Match Status ---
const denomTotal = Array.from(document.querySelectorAll("#reportDenomTbody tr")).reduce((sum, r) => {
  const inp = r.querySelector("input");
  const v = Number(inp?.dataset?.val || 0);
  const c = Number(inp?.value || 0);
  return sum + (v * c);
}, 0);

const balance = parseINR(el('denomModalBalance').textContent);

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


  // --- Footer ---
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text("This is a system generated report. No manual alterations.", 105, 290, { align: "center" });

  doc.save(`report-${dateKey}.pdf`);
  toast("📄 Corporate PDF exported.");
}


/* ====== Export Excel ====== */
async function exportExcel(dateKey) {
  const { list, totals } = await getDayData(dateKey);
  const wb = XLSX.utils.book_new();
  const sheetData = [];

  sheetData.push(["Simple Accounting Report"]);
  sheetData.push(["Date:", istDisplayDate(dateKey)]);
  sheetData.push([]);

  sheetData.push(["Time", "Type", "Amount", "Note"]);
  list.forEach(tx => {
    sheetData.push([istDisplayTime(tx.createdAt), tx.type, tx.amount, tx.note || ""]);
  });

  sheetData.push([]);
  sheetData.push(["Summary"]);
  sheetData.push(["Total Income", totals.income]);
  sheetData.push(["Total Expense", totals.expense]);
  sheetData.push(["Adjustment", totals.adjustment]);
  sheetData.push(["Closing Balance", totals.balance]);

  // ✅ Add denomination rows
  sheetData.push([]);
  sheetData.push(["Denominations"]);
  sheetData.push(["Denomination", "Count", "Subtotal"]);
  document.querySelectorAll("#reportDenomTbody tr").forEach(r => {
    const inp = r.querySelector("input");
    const v = Number(inp?.dataset?.val || 0);
    const c = Number(inp?.value || 0);
    if (c > 0) sheetData.push([v, c, v * c]);
  });
  
  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  XLSX.utils.book_append_sheet(wb, ws, "Report");
  XLSX.writeFile(wb, `Report_${dateKey}.xlsx`);
}
