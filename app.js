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
  return "Rs. " + Number(n || 0).toLocaleString("en-IN");
}

function el(id) { return document.getElementById(id); }
function toast(msg) {
  el('statusLine').textContent = msg;
  setTimeout(() => el('statusLine').textContent = 'Offline-first • Data stays on this device', 3000);
}

/* ====== IndexedDB ====== */
const DB_NAME = 'acc_pwa_db';
const DB_VER = 3;
let db;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = e => {
      const dbn = e.target.result;
      if (!dbn.objectStoreNames.contains('transactions')) {
        dbn.createObjectStore('transactions', { keyPath: 'id' });
      }
      if (!dbn.objectStoreNames.contains('settings')) {
        dbn.createObjectStore('settings', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGetAll(store) {
  return new Promise((res, rej) => {
    const req = db.transaction(store, 'readonly').objectStore(store).getAll();
    req.onsuccess = () => res(req.result || []);
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
function idbDelete(store, key) {
  return new Promise((res, rej) => {
    const req = db.transaction(store, 'readwrite').objectStore(store).delete(key);
    req.onsuccess = () => res(true);
    req.onerror = () => rej(req.error);
  });
}
function idbClear(store) {
  return new Promise((res, rej) => {
    const req = db.transaction(store, 'readwrite').objectStore(store).clear();
    req.onsuccess = () => res(true);
    req.onerror = () => rej(req.error);
  });
}

/* ====== PIN Lock ====== */
async function sha256(text) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function showPinLock() {
  const pinOverlay = el('pinOverlay');
  const pinInput = el('pinInput');
  const pinSubmit = el('pinSubmit');
  const pinError = el('pinError');
  const pinReset = el('pinReset');
  const pinSub = el('pinSubheading');

  const saved = await new Promise((res) => {
    const tx = db.transaction('settings', 'readonly').objectStore('settings').get('pinHash');
    tx.onsuccess = () => res(tx.result);
  });

  const isSetup = !!saved;
  pinSub.textContent = isSetup ? 'Enter your 4-digit PIN.' : 'Set a 4-digit PIN.';
  pinSubmit.textContent = isSetup ? 'Unlock' : 'Set PIN';
  pinOverlay.classList.remove('hidden');

  pinSubmit.onclick = async () => {
    const val = pinInput.value.trim();
    if (!/^\d{4}$/.test(val)) {
      pinError.textContent = 'Enter 4 digits.';
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
      toast('PIN set.');
    }
    pinInput.value = '';
  };

  pinReset.onclick = async () => {
    if (confirm('Reset PIN only? Transactions will remain.')) {
      await idbClear('settings');   // clear only PIN
      location.reload();
    }
  };
}

/* ====== Number to Words ====== */
function numberToWords(num) {
  if (num === 0) return "zero";
  const ones = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
    "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
  const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

  function helper(n) {
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
    if (n < 1000) return ones[Math.floor(n / 100)] + " hundred" + (n % 100 ? " " + helper(n % 100) : "");
    if (n < 100000) return helper(Math.floor(n / 1000)) + " thousand" + (n % 1000 ? " " + helper(n % 1000) : "");
    if (n < 10000000) return helper(Math.floor(n / 100000)) + " lakh" + (n % 100000 ? " " + helper(n % 100000) : "");
    return helper(Math.floor(n / 10000000)) + " crore" + (n % 10000000 ? " " + helper(n % 10000000) : "");
  }
  return helper(num);
}

/* ====== Save Entry ====== */
function resetForm() {
  el('txType').value = 'income';
  el('txAmount').value = '';
  el('txNote').value = '';
  el('amountInWords').textContent = '';
}

async function saveEntry() {
  const type = el('txType').value;
  const note = el('txNote').value.trim();
  const amount = Number(el('txAmount').value || 0);
  if (amount <= 0) { alert('Enter valid amount'); return; }

  const now = nowIST();
  const data = {
    id: crypto.randomUUID(),
    type, amount, note,
    createdAt: now.toISOString(),
    dateKey: istDateKey(now)
  };
  await idbSet('transactions', data);
  toast('Saved.');
  resetForm();
  refreshTotals();
  if (el('reportDate').value === data.dateKey) loadDayEntries();
}

/* ====== Totals (global header cards) ====== */
async function refreshTotals() {
  const all = await idbGetAll('transactions');
  const inc = all.filter(t => t.type === 'income').reduce((a, b) => a + b.amount, 0);
  const exp = all.filter(t => t.type === 'expense').reduce((a, b) => a + b.amount, 0);
  el('totalIncome').textContent = rupeesForPDF(inc);
  el('totalExpense').textContent = rupeesForPDF(exp);
  el('currentBalance').textContent = rupeesForPDF(inc - exp);
}

/* ====== Load Entries (selected day) ====== */
async function loadDayEntries() {
  const date = el('reportDate').value || istDateKey();
  const list = await idbGetAll('transactions');
  const filtered = list.filter(t => t.dateKey === date).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  renderList(filtered);
}
function renderList(arr) {
  const tbody = el('listTbody');
  tbody.innerHTML = '';

  arr.forEach(tx => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${istDisplayTime(tx.createdAt)}</td>
      <td>${tx.type === 'income' ? 'Income 💰' : 'Expense 💸'}</td>
      <td>${rupees(tx.amount)}</td>
      <td>${tx.note || '-'}</td>
      <td>
        <button data-id="${tx.id}" 
                class="editEntry bg-blue-600 text-white px-2 py-1 rounded-md text-xs hover:bg-blue-700">
          Edit
        </button>
        <button data-id="${tx.id}" 
                class="deleteEntry bg-rose-600 text-white px-2 py-1 rounded-md text-xs hover:bg-rose-700">
          Delete
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // delete
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
        toast("✅ Entry deleted");
      }
    });
  });

  // edit
  tbody.querySelectorAll('button.editEntry').forEach(btn => {
    btn.addEventListener('click', async () => {
      const all = await idbGetAll('transactions');
      const tx = all.find(t => t.id === btn.dataset.id);
      if (!tx) return;

      const newAmount = prompt("Edit Amount:", tx.amount);
      const newNote = prompt("Edit Note:", tx.note || "");

      if (newAmount !== null && newNote !== null) {
        const oldData = { amount: tx.amount, note: tx.note };
        tx.amount = Number(newAmount);
        tx.note = newNote;
        tx.edits = tx.edits || [];
        tx.edits.push({
          time: nowIST().toISOString(),
          old: oldData,
          new: { amount: tx.amount, note: tx.note }
        });

        await idbSet('transactions', tx);
        loadDayEntries();
        refreshTotals();
        toast("✅ Entry updated");
      }
    });
  });
}

/* ====== Report Data (selected day only) ====== */
async function getDayData(dateKey) {
  const rowsAll = await idbGetAll('transactions');
  const rows = rowsAll.filter(r => r.dateKey === dateKey).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const incomes = rows.filter(r => r.type === 'income');
  const expenses = rows.filter(r => r.type === 'expense');
  const totals = {
    income: incomes.reduce((a, b) => a + b.amount, 0),
    expense: expenses.reduce((a, b) => a + b.amount, 0),
    balance: incomes.reduce((a, b) => a + b.amount, 0) - expenses.reduce((a, b) => a + b.amount, 0) // <-- FIXED (date-scoped)
  };
  return { rows, totals };
}

/* ====== Export PDF ====== */
async function exportPDF(dateKey) {
  const { rows, totals } = await getDayData(dateKey);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });

  // Header
  doc.setFontSize(14);
  doc.text('\u200BSimple Accounting Report', 40, 40);
  doc.setFontSize(10);
  doc.text(`\u200BDate: ${dateKey}`, 40, 58);
  const genTime = dayjs().tz(IST_TZ).format('DD-MM-YYYY hh:mm A');
  doc.text(`\u200BGenerated on: ${genTime}`, 40, 72);

  let y = 90;

  // Income
  const incomes = rows.filter(r => r.type === 'income');
  if (incomes.length) {
    doc.setFontSize(12);
    doc.setTextColor(0, 150, 0); // green
    doc.text('\u200BIncome Entries', 40, y);
    doc.setTextColor(0, 0, 0); // reset
    doc.autoTable({
      head: [['Time', 'Amount', 'Note']],
      body: incomes.map(r => [istDisplayTime(r.createdAt), rupeesForPDF(r.amount), r.note || '']),
      startY: y + 10
    });
    y = doc.lastAutoTable.finalY + 25;
  }

  // Expense
  const expenses = rows.filter(r => r.type === 'expense');
  if (expenses.length) {
    doc.setFontSize(12);
    doc.setTextColor(200, 0, 0); // red
    doc.text('\u200BExpense Entries', 40, y);
    doc.setTextColor(0, 0, 0); // reset
    doc.autoTable({
      head: [['Time', 'Amount', 'Note']],
      body: expenses.map(r => [istDisplayTime(r.createdAt), rupeesForPDF(r.amount), r.note || '']),
      startY: y + 10
    });
    y = doc.lastAutoTable.finalY + 25;
  }

  // Summary
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0); // black
  doc.text('\u200BSummary', 40, y);
  doc.setFontSize(11);
  y += 18;
  doc.text(`\u200BTotal Income: ${rupeesForPDF(totals.income)}`, 40, y);
  y += 16;
  doc.text(`\u200BTotal Expense: ${rupeesForPDF(totals.expense)}`, 40, y);
  y += 16;
  doc.text(`\u200BBalance: ${rupeesForPDF(totals.balance)}`, 40, y);
  y += 30;

  // Denominations (keep raw numbers, format on display)
  const denomRows = [];
  document.querySelectorAll('#reportDenomTbody tr').forEach(r => {
    const inp = r.querySelector('input');
    const v = Number(inp?.dataset?.val || 0);
    const c = Number(inp?.value || 0);
    if (c > 0) denomRows.push([v, c, v * c]);
  });

  if (denomRows.length) {
    doc.setFontSize(12);
    doc.setTextColor(150, 75, 0); // brown
    doc.text('\u200BDenominations', 40, y);
    doc.setTextColor(0, 0, 0); // reset
    doc.autoTable({
      head: [['Denom', 'Count', 'Subtotal']],
      body: denomRows.map(([v, c, sub]) => [`${v}`, c, rupeesForPDF(sub)]),
      startY: y + 10
    });
    y = doc.lastAutoTable.finalY + 20;

    const denomTotal = denomRows.reduce((a, [, , sub]) => a + sub, 0);
    doc.setFontSize(11);
    doc.text(`\u200BDenomination Total: ${rupeesForPDF(denomTotal)}`, 40, y);
    y += 16;

    if (denomTotal === totals.balance) {
      doc.setTextColor(0, 150, 0);
      doc.text("\u200B✅ Denomination matches Balance", 40, y);
    } else if (denomTotal < totals.balance) {
      doc.setTextColor(200, 150, 0);
      doc.text(`\u200B⚠ Short by ${rupeesForPDF(totals.balance - denomTotal)}`, 40, y);
    } else {
      doc.setTextColor(200, 0, 0);
      doc.text(`\u200B⚠ Excess by ${rupeesForPDF(denomTotal - totals.balance)}`, 40, y);
    }
    doc.setTextColor(0, 0, 0); // reset
    y += 25;
  }

  // Edited Entries (at the end)
  const edited = rows.filter(r => r.edits && r.edits.length);
  if (edited.length) {
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 200); // blue
    doc.text('\u200BEdited Entries', 40, y);
    doc.setTextColor(0, 0, 0); // reset
    doc.autoTable({
      head: [['Time of Edit', 'Type', 'Old Amount', 'New Amount', 'Old Note', 'New Note']],
      body: edited.flatMap(r =>
        r.edits.map(e => [
          istDisplayTime(e.time),
          r.type === 'income' ? 'Income ' : 'Expense ',
          rupeesForPDF(e.old.amount), rupeesForPDF(e.new.amount),
          e.old.note || '-', e.new.note || '-'
        ])
      ),
      startY: y + 10
    });
  }

  doc.save(`report-${dateKey}.pdf`);
  toast('PDF exported.');
}


/* ====== Export Excel ====== */
async function exportExcel(dateKey) {
  const { rows, totals } = await getDayData(dateKey);

  const wb = XLSX.utils.book_new();
  const sheetData = [];

  // Header
  sheetData.push(["Simple Accounting Report"]);
  sheetData.push([`Date: ${dateKey}`]);
  const genTime = dayjs().tz(IST_TZ).format('DD-MM-YYYY hh:mm A');
  sheetData.push([`Generated on: ${genTime}`]);
  sheetData.push([]);

  // Income
  const incomes = rows.filter(r => r.type === 'income');
  if (incomes.length) {
    sheetData.push(["Income Entries"]);
    sheetData.push(["Time", "Amount", "Note"]);
    incomes.forEach(r => sheetData.push([istDisplayTime(r.createdAt), r.amount, r.note || ""]));
    sheetData.push(["Total Income", totals.income]);
    sheetData.push([]);
  }

  // Expense
  const expenses = rows.filter(r => r.type === 'expense');
  if (expenses.length) {
    sheetData.push(["Expense Entries"]);
    sheetData.push(["Time", "Amount", "Note"]);
    expenses.forEach(r => sheetData.push([istDisplayTime(r.createdAt), r.amount, r.note || ""]));
    sheetData.push(["Total Expense", totals.expense]);
    sheetData.push([]);
  }

  // Summary
  sheetData.push(["Summary"]);
  sheetData.push(["Total Income", totals.income]);
  sheetData.push(["Total Expense", totals.expense]);
  sheetData.push(["Balance", totals.balance]);
  sheetData.push([]);

  // Denominations (raw numbers)
  sheetData.push(["Denominations"]);
  sheetData.push(["Denom", "Count", "Subtotal"]);
  const denomRows = [];
  document.querySelectorAll('#reportDenomTbody tr').forEach(r => {
    const inp = r.querySelector('input');
    const v = Number(inp?.dataset?.val || 0);
    const c = Number(inp?.value || 0);
    if (c > 0) denomRows.push([v, c, v * c]);
  });
  denomRows.forEach(r => sheetData.push(r));

  const denomTotal = denomRows.reduce((a, [, , sub]) => a + sub, 0);
  sheetData.push([]);
  sheetData.push(["Denomination Total", denomTotal]);
  if (denomTotal === totals.balance) sheetData.push(["✅ Denomination matches Balance"]);
  else if (denomTotal < totals.balance) sheetData.push([`⚠ Short by ${totals.balance - denomTotal}`]);
  else sheetData.push([`⚠ Excess by ${denomTotal - totals.balance}`]);
  sheetData.push([]);

  // Edited Entries (AT THE END ONLY)
  const edited = rows.filter(r => r.edits && r.edits.length);
  if (edited.length) {
    sheetData.push(["Edited Entries"]);
    sheetData.push(["Time of Edit", "Type", "Old Amount", "New Amount", "Old Note", "New Note"]);
    edited.forEach(r => {
      r.edits.forEach(e => {
        sheetData.push([
          istDisplayTime(e.time),
          r.type === 'income' ? 'Income' : 'Expense',
          e.old.amount, e.new.amount,
          e.old.note || "", e.new.note || ""
        ]);
      });
    });
    sheetData.push([]);
  }

  const ws = XLSX.utils.aoa_to_sheet(sheetData);

  // Auto column width
  const colWidths = [];
  sheetData.forEach(row => {
    row.forEach((val, i) => {
      const len = String(val || "").length;
      colWidths[i] = Math.max(colWidths[i] || 10, len + 4);
    });
  });
  ws['!cols'] = colWidths.map(w => ({ wch: w }));

  XLSX.utils.book_append_sheet(wb, ws, "Report");
  XLSX.writeFile(wb, `report-${dateKey}.xlsx`);
  toast("Excel exported.");
}

/* ====== Denomination Helpers (modal) ====== */
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
  el('reportDenomTotal').textContent = rupees(total);

  // Compare with balance and show +/- (modal display only)
  const balanceText = el('denomModalBalance').textContent.replace(/[₹,]/g, '');
  const balance = Number(balanceText) || 0;
  const diff = total - balance;

  if (diff === 0) {
    el('reportDenomMatch').textContent = "✅ Exact match";
    el('reportDenomMatch').className = "text-green-600 mt-1 text-sm text-center";
  } else if (diff < 0) {
    el('reportDenomMatch').textContent = `− ${rupees(Math.abs(diff))} left`;
    el('reportDenomMatch').className = "text-yellow-600 mt-1 text-sm text-center";
  } else {
    el('reportDenomMatch').textContent = `+ ${rupees(diff)} excess`;
    el('reportDenomMatch').className = "text-red-600 mt-1 text-sm text-center";
  }

  return total;
}

/* ====== Init ====== */
let exportMode = "pdf"; // default

(async function init() {
  db = await openDB();
  el('reportDate').value = istDateKey();

  el('saveEntry').addEventListener('click', saveEntry);
  el('clearForm').addEventListener('click', resetForm);
  el('loadDay').addEventListener('click', loadDayEntries);

  // secure wipeAll with password
  el('wipeAll').addEventListener('click', async () => {
    const pwd = prompt('Enter password to erase all data:');
    if (pwd !== '@Faruk123') {
      alert('❌ Incorrect password. Data not erased.');
      return;
    }
    const sure = confirm('⚠️ This will ERASE ALL transactions permanently. Continue?');
    if (!sure) return;
    await idbClear('transactions');
    await refreshTotals();
    await loadDayEntries();
    toast('All data erased.');
  });

  el('txAmount').addEventListener('input', () => {
    const val = Number(el('txAmount').value || 0);
    el('amountInWords').textContent = val > 0 ? numberToWords(val) + " rupees" : "";
  });

  /* ====== Denomination Modal Bindings (DATE-SCOPED BALANCE) ====== */
  el('btnPdf').addEventListener('click', async () => {
    exportMode = "pdf";
    el('confirmDenom').textContent = "Generate PDF";

    const date = el('reportDate').value || istDateKey();
    const { totals } = await getDayData(date);     // <-- FIX: date-scoped
    el('denomModalBalance').textContent = rupees(totals.balance);

    loadDefaultDenoms();
    el('reportDenomMatch').textContent = "";
    el('denomModal').classList.remove('hidden');
  });

  el('btnExcel').addEventListener('click', async () => {
    exportMode = "excel";
    el('confirmDenom').textContent = "Generate Excel";

    const date = el('reportDate').value || istDateKey();
    const { totals } = await getDayData(date);     // <-- FIX: date-scoped
    el('denomModalBalance').textContent = rupees(totals.balance);

    loadDefaultDenoms();
    el('reportDenomMatch').textContent = "";
    el('denomModal').classList.remove('hidden');
  });

  el('confirmDenom').addEventListener('click', async () => {
    const denomTotal = updateDenoms();

    // (Modal uses date-scoped balance already shown on screen)
    // We don't block export; we just inform and continue.
    const balanceText = el('denomModalBalance').textContent.replace(/[₹,]/g, '');
    const balance = Number(balanceText) || 0;

    if (denomTotal !== balance) {
      el('reportDenomMatch').textContent = `❌ Denomination does not match balance. Still exporting...`;
      el('reportDenomMatch').className = "text-red-600 mt-1 text-sm";
    } else {
      el('reportDenomMatch').textContent = "✅ Denomination matches balance.";
      el('reportDenomMatch').className = "text-green-600 mt-1 text-sm";
    }

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
})();
