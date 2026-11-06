let people = []; // [{id, name}]
let selected = new Set(); // set of person ids

const listEl = document.getElementById('list');
const searchEl = document.getElementById('search');
const countLabel = document.getElementById('countLabel');
const toast = document.getElementById('toast');
const addRow = document.getElementById('addRow');
const newNameInput = document.getElementById('newNameInput');

// Runs a server call; on failure shows the reason and returns null.
async function callApi(fn) {
  try {
    return await fn();
  } catch (e) {
    const msg = String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
    alert('Could not reach the server: ' + msg);
    return null;
  }
}

async function loadPeople() {
  listEl.innerHTML = '<div class="empty">Loading names from server… (first load can take up to a minute)</div>';
  const result = await callApi(() => window.api.getAllPeople());
  if (!result) {
    listEl.innerHTML = '<div class="empty">Could not load names. Check your internet connection and restart the app.</div>';
    return;
  }
  people = result;
  renderList();
}

function renderList() {
  const q = searchEl.value.trim().toLowerCase();
  listEl.innerHTML = '';
  const filtered = people.filter((p) => !q || p.name.toLowerCase().includes(q));

  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = people.length === 0 ? 'No names yet. Use "+ Add a name" to get started.' : 'No matches.';
    listEl.appendChild(empty);
    updateCount();
    return;
  }

  filtered.forEach((person, idx) => {
    const row = document.createElement('div');
    row.className = 'row';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.id = 'p' + person.id;
    cb.checked = selected.has(person.id);
    cb.onchange = () => {
      if (cb.checked) selected.add(person.id);
      else selected.delete(person.id);
      updateCount();
    };

    const label = document.createElement('label');
    label.htmlFor = 'p' + person.id;
    label.innerHTML = '<span class="num">' + (idx + 1) + '.</span>' + escapeHtml(person.name);

    const delBtn = document.createElement('button');
    delBtn.className = 'row-delete';
    delBtn.textContent = 'Remove';
    delBtn.onclick = async () => {
      if (!confirm('Remove "' + person.name + '" from the list?')) return;
      const result = await callApi(() => window.api.deletePerson(person.id));
      if (!result) return;
      selected.delete(person.id);
      people = result;
      renderList();
    };

    row.appendChild(cb);
    row.appendChild(label);
    row.appendChild(delBtn);
    listEl.appendChild(row);
  });

  updateCount();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function updateCount() {
  countLabel.textContent = selected.size + ' selected';
}

function visibleIds() {
  const q = searchEl.value.trim().toLowerCase();
  return people.filter((p) => !q || p.name.toLowerCase().includes(q)).map((p) => p.id);
}

document.getElementById('selectAllBtn').onclick = () => {
  visibleIds().forEach((id) => selected.add(id));
  renderList();
};

document.getElementById('clearAllBtn').onclick = () => {
  visibleIds().forEach((id) => selected.delete(id));
  renderList();
};

searchEl.addEventListener('input', renderList);

document.getElementById('addNameBtn').onclick = () => {
  addRow.classList.remove('hidden');
  newNameInput.value = '';
  newNameInput.focus();
};

document.getElementById('cancelAddBtn').onclick = () => {
  addRow.classList.add('hidden');
};

document.getElementById('confirmAddBtn').onclick = confirmAddName;
newNameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') confirmAddName();
});

async function confirmAddName() {
  const name = newNameInput.value.trim();
  if (!name) return;
  const result = await callApi(() => window.api.addPerson(name));
  if (!result) return;
  people = result;
  addRow.classList.add('hidden');
  searchEl.value = '';
  renderList();
}

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2200);
}

function buildExportPayload() {
  const title = document.getElementById('examTitle').value.trim() || 'Exam Attendance';
  const dateVal = document.getElementById('examDate').value || localIsoDate(new Date());
  const dateDisplay = new Date(dateVal + 'T00:00:00').toLocaleDateString('en-GB');

  const present = people.filter((p) => selected.has(p.id));

  return {
    title,
    date: dateVal,
    dateDisplay,
    presentIds: present.map((p) => p.id),
    presentNames: present.map((p) => p.name),
    totalCount: people.length
  };
}

function localIsoDate(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// Saves this attendance to the server so there is a record of every exam.
// The file is still generated even if saving fails.
async function saveToServer(payload) {
  try {
    await window.api.saveExam(payload);
    return true;
  } catch (e) {
    return false;
  }
}

async function runExport(exportFn, label) {
  if (selected.size === 0) {
    alert('Please tick at least one name before generating the document.');
    return;
  }
  const payload = buildExportPayload();
  const result = await exportFn(payload);
  if (!result.saved) return;
  const synced = await saveToServer(payload);
  showToast(label + ' saved' + (synced ? ' and recorded on server' : ' (server record failed)'));
}

document.getElementById('exportDocxBtn').onclick = () => runExport(window.api.exportDocx, 'Word file');
document.getElementById('exportXlsxBtn').onclick = () => runExport(window.api.exportXlsx, 'Excel file');

loadPeople();
