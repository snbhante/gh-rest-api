const MAX_ITEMS_PER_FILE = 500; 
const DATA_FOLDER = 'data';
const PAGE_SIZE = 10;

let rawAllFiles = [];       
let globalFlatItems = [];   
let filteredItems = [];     
let currentPage = 1;
let currentSortDir = 'asc';

// Page Load Setup
window.addEventListener('DOMContentLoaded', () => {
  loadSavedConfig();
  initTheme();
});

function log(msg, isError = false) {
  const logEl = document.getElementById('logOutput');
  const time = new Date().toLocaleTimeString();
  logEl.innerText = `[${time}] ${isError ? '❌ ERROR:' : '✅ SUCCESS:'} ${msg}\n` + logEl.innerText;
}

/* ==================================================
   🌙 DARK MODE & CONFIG LOCALSTORAGE
================================================== */
function toggleDarkMode() {
  document.body.classList.toggle('dark-mode');
  const isDark = document.body.classList.contains('dark-mode');
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
  document.getElementById('themeBtn').innerText = isDark ? '☀️ লাইট মোড' : '🌙 ডার্ক মোড';
}

function initTheme() {
  if (localStorage.getItem('theme') === 'dark') {
    document.body.classList.add('dark-mode');
    document.getElementById('themeBtn').innerText = '☀️ লাইট মোড';
  }
}

function loadSavedConfig() {
  const savedToken = localStorage.getItem('gh_token');
  const savedOwner = localStorage.getItem('gh_owner');
  const savedRepo = localStorage.getItem('gh_repo');

  if (savedToken && savedOwner && savedRepo) {
    document.getElementById('token').value = savedToken;
    document.getElementById('owner').value = savedOwner;
    document.getElementById('repo').value = savedRepo;
    document.getElementById('rememberConfig').checked = true;
  }
}

function saveConfigIfNeeded() {
  const remember = document.getElementById('rememberConfig').checked;
  const { token, owner, repo } = getConfig();

  if (remember) {
    localStorage.setItem('gh_token', token);
    localStorage.setItem('gh_owner', owner);
    localStorage.setItem('gh_repo', repo);
  } else {
    localStorage.removeItem('gh_token');
    localStorage.removeItem('gh_owner');
    localStorage.removeItem('gh_repo');
  }
}

/* ==================================================
   🎨 CUSTOM DROPDOWN LOGIC
================================================== */
function toggleDropdown(dropdownId) {
  const dropdown = document.getElementById(dropdownId);
  const isOpen = dropdown.classList.contains('active');
  document.querySelectorAll('.custom-dropdown').forEach(d => d.classList.remove('active'));
  if (!isOpen) dropdown.classList.add('active');
}

function selectOption(dropdownId, value, labelText) {
  const dropdown = document.getElementById(dropdownId);
  const hiddenInput = dropdown.querySelector('input[type="hidden"]');
  const selectedText = dropdown.querySelector('.selected-text');

  hiddenInput.value = value;
  selectedText.innerText = labelText;

  dropdown.querySelectorAll('.dropdown-item').forEach(item => {
    item.classList.remove('selected');
    if (item.getAttribute('data-value') === value) item.classList.add('selected');
  });

  dropdown.classList.remove('active');
}

// ফিল্টারের ড্রপডাউন সিলেক্ট করলে ডাটা ফিল্টার হওয়া
function selectFilterOption(dropdownId, value, labelText) {
  selectOption(dropdownId, value, labelText);
  applyFilters();
}

document.addEventListener('click', function(e) {
  if (!e.target.closest('.custom-dropdown')) {
    document.querySelectorAll('.custom-dropdown').forEach(d => d.classList.remove('active'));
  }
});

function resetCustomDropdowns() {
  selectOption('dropdownLanguage', '', 'ভাষা নির্বাচন করুন');
  selectOption('dropdownStatus', '', 'স্ট্যাটাস নির্বাচন করুন');
}

/* ==================================================
   GITHUB DB API LOGIC
================================================== */
function getConfig() {
  return {
    token: document.getElementById('token').value.trim(),
    owner: document.getElementById('owner').value.trim(),
    repo: document.getElementById('repo').value.trim()
  };
}

function toBase64(str) { return btoa(unescape(encodeURIComponent(str))); }
function fromBase64(str) { return decodeURIComponent(escape(atob(str))); }

async function saveFileToGithub(filePath, contentArray, sha = null) {
  const { token, owner, repo } = getConfig();
  const body = {
    message: `Database updated: ${filePath}`,
    content: toBase64(JSON.stringify(contentArray, null, 2))
  };
  if (sha) body.sha = sha;

  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  return await res.json();
}

async function fetchAllFiles() {
  const { token, owner, repo } = getConfig();
  let fileIndex = 1;
  let allFilesData = [];

  while (true) {
    const filePath = `${DATA_FOLDER}/names_${fileIndex}.json`;
    try {
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.status === 404) break;

      const data = await res.json();
      if (res.ok) {
        const parsedContent = JSON.parse(fromBase64(data.content));
        allFilesData.push({
          fileName: filePath,
          sha: data.sha,
          fileNumber: fileIndex,
          items: parsedContent
        });
        fileIndex++;
      } else {
        break;
      }
    } catch (err) {
      break;
    }
  }

  return allFilesData;
}

async function loadAllData() {
  const { token, owner, repo } = getConfig();
  if (!token || !owner || !repo) {
    alert("অনুগ্রহ করে টোকেন, ওনার এবং রেপোজিটরির নাম প্রদান করুন!");
    return;
  }

  saveConfigIfNeeded();
  log("সবগুলো ডেটাবেজ ফাইল লোড করা হচ্ছে...");

  rawAllFiles = await fetchAllFiles();
  globalFlatItems = [];

  rawAllFiles.forEach(file => {
    file.items.forEach((item, index) => {
      globalFlatItems.push({
        ...item,
        _fileName: file.fileName,
        _indexInFile: index
      });
    });
  });

  updateAnalytics(globalFlatItems, rawAllFiles.length);
  applyFilters();
  log(`মোট ${rawAllFiles.length} টি ফাইল থেকে ${globalFlatItems.length} টি রেকর্ড লোড হয়েছে।`);
}

/* ==================================================
   ANALITYCS, FILTERS, SEARCH & PAGINATION
================================================== */
function updateAnalytics(items, totalFiles) {
  document.getElementById('statTotal').innerText = items.length;
  document.getElementById('statSelected').innerText = items.filter(i => i.status === 'selected').length;
  document.getElementById('statKept').innerText = items.filter(i => i.status === 'kept').length;
  document.getElementById('statFiles').innerText = totalFiles;
}

function applyFilters() {
  const searchValue = document.getElementById('searchInput').value.toLowerCase().trim();
  const categoryValue = document.getElementById('filterCategoryVal').value;
  const statusValue = document.getElementById('filterStatusVal').value;

  filteredItems = globalFlatItems.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchValue) || 
                          item.meaning.toLowerCase().includes(searchValue);
    const matchesCategory = categoryValue === "" || item.category === categoryValue;
    const matchesStatus = statusValue === "" || item.status === statusValue;

    return matchesSearch && matchesCategory && matchesStatus;
  });

  currentPage = 1;
  renderTablePage();
}

function toggleSort(field) {
  currentSortDir = (currentSortDir === 'asc') ? 'desc' : 'asc';
  document.getElementById('sortNameIcon').innerText = (currentSortDir === 'asc') ? '▲' : '▼';

  filteredItems.sort((a, b) => {
    return currentSortDir === 'asc' 
      ? a.name.localeCompare(b.name, 'bn')
      : b.name.localeCompare(a.name, 'bn');
  });

  renderTablePage();
}

function renderTablePage() {
  const tableBody = document.getElementById('dataTable');
  tableBody.innerHTML = '';

  const totalPages = Math.ceil(filteredItems.length / PAGE_SIZE) || 1;
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const pageItems = filteredItems.slice(startIndex, startIndex + PAGE_SIZE);

  pageItems.forEach(item => {
    let statusIcon = '➖';
    if (item.status === 'kept') {
      statusIcon = '<span class="status-icon status-kept-color" title="রেখে দেওয়া হয়েছে">✔</span>';
    } else if (item.status === 'selected') {
      statusIcon = '<span class="status-icon status-selected-color" title="পছন্দ করা হয়েছে">✔</span>';
    } else {
      statusIcon = '<span style="color:#ccc;">—</span>';
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="sticky-col-left">${statusIcon}</td>
      <td><strong>${item.name}</strong></td>
      <td>${item.meaning}</td>
      <td>${item.category}</td>
      <td class="sticky-col-right">
        <div class="btn-action-group">
          <button class="btn btn-yellow btn-sm" onclick="setupEdit('${item._fileName}', ${item._indexInFile}, '${item.name}', '${item.meaning}', '${item.category}', '${item.status}')" title="এডিট করুন">
            <span>✏️</span><span class="btn-text">এডিট</span>
          </button>
          <button class="btn btn-red btn-sm" onclick="deleteItem('${item._fileName}', ${item._indexInFile})" title="ডিলিট করুন">
            <span>🗑️</span><span class="btn-text">ডিলিট</span>
          </button>
        </div>
      </td>
    `;
    tableBody.appendChild(tr);
  });

  if (filteredItems.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;">কোনো মিল পাওয়া যায়নি।</td></tr>`;
  }

  document.getElementById('pageInfo').innerText = `পৃষ্ঠা ${currentPage} এর ${totalPages}`;
  document.getElementById('btnPrevPage').disabled = (currentPage === 1);
  document.getElementById('btnNextPage').disabled = (currentPage >= totalPages);
}

function changePage(direction) {
  currentPage += direction;
  renderTablePage();
}

/* ==================================================
   SAVE & EDIT LOGIC
================================================== */
async function handleSave(e) {
  e.preventDefault();

  const nameInput = document.getElementById('babyName').value.trim();
  const meaningInput = document.getElementById('babyMeaning').value.trim();
  const categoryInput = document.getElementById('babyCategory').value;

  if (!nameInput || !meaningInput || !categoryInput) {
    alert("অনুগ্রহ করে নাম, অর্থ এবং ভাষা নির্বাচন করুন।");
    return;
  }

  const editFile = document.getElementById('editFile').value;
  const editIndex = document.getElementById('editIndex').value;

  if (editFile === "") {
    const isDuplicate = globalFlatItems.some(item => item.name.toLowerCase() === nameInput.toLowerCase());
    if (isDuplicate) {
      if (!confirm(`"${nameInput}" নাম টি ডাটাবেজে আগে থেকেই আছে! আপনি কি নিশ্চিত পুনরায় যোগ করতে চান?`)) {
        return;
      }
    }
  }

  const newItem = {
    id: Date.now(),
    name: nameInput,
    meaning: meaningInput,
    category: categoryInput,
    status: document.getElementById('babyStatus').value || 'none'
  };

  const saveBtn = document.getElementById('saveBtn');
  const originalBtnText = saveBtn.innerText;
  saveBtn.innerText = "সংরক্ষণ হচ্ছে...";
  saveBtn.disabled = true;

  try {
    if (editFile !== "") {
      await updateItemInFile(editFile, parseInt(editIndex), newItem);
    } else {
      await insertNewItem(newItem);
    }

    document.getElementById('nameForm').reset();
    resetCustomDropdowns();
    document.getElementById('editFile').value = "";
    document.getElementById('editIndex').value = "";
    saveBtn.innerText = "সংরক্ষণ করুন";
    
    await loadAllData();
  } catch (err) {
    log("ডাটা সংরক্ষণ করতে সমস্যা হয়েছে: " + err.message, true);
    saveBtn.innerText = originalBtnText;
  } finally {
    saveBtn.disabled = false;
  }
}

async function insertNewItem(newItem) {
  log("নতুন ডেটা সেভ করার উপযুক্ত ফাইল খোঁজা হচ্ছে...");
  if (rawAllFiles.length === 0) {
    const firstFilePath = `${DATA_FOLDER}/names_1.json`;
    log(`প্রথম ডাইনামিক ফাইল তৈরি হচ্ছে: ${firstFilePath}`);
    await saveFileToGithub(firstFilePath, [newItem]);
  } else {
    const lastFile = rawAllFiles[rawAllFiles.length - 1];
    if (lastFile.items.length < MAX_ITEMS_PER_FILE) {
      lastFile.items.push(newItem);
      log(`বিদ্যমান ফাইলে (${lastFile.fileName}) যুক্ত হচ্ছে...`);
      await saveFileToGithub(lastFile.fileName, lastFile.items, lastFile.sha);
    } else {
      const newFileNumber = lastFile.fileNumber + 1;
      const newFilePath = `${DATA_FOLDER}/names_${newFileNumber}.json`;
      log(`সীমা অতিক্রম করায় নতুন ফাইল খোলা হচ্ছে: ${newFilePath}`);
      await saveFileToGithub(newFilePath, [newItem]);
    }
  }
}

function setupEdit(fileName, index, name, meaning, category, status) {
  document.getElementById('editFile').value = fileName;
  document.getElementById('editIndex').value = index;
  document.getElementById('babyName').value = name;
  document.getElementById('babyMeaning').value = meaning;

  selectOption('dropdownLanguage', category, category || 'ভাষা নির্বাচন করুন');
  
  let statusText = 'স্ট্যাটাস নির্বাচন করুন';
  if (status === 'kept') statusText = 'রেখে দেওয়া হয়েছে';
  else if (status === 'selected') statusText = 'পছন্দ করা হয়েছে';
  else if (status === 'none') statusText = 'কোনোটিই নয়';
  
  selectOption('dropdownStatus', status, statusText);
  document.getElementById('saveBtn').innerText = "আপডেট সম্পন্ন করুন";
}

async function updateItemInFile(fileName, index, updatedItem) {
  log(`${fileName} আপডেট করা হচ্ছে...`);
  const { token, owner, repo } = getConfig();

  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${fileName}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await res.json();
  const items = JSON.parse(fromBase64(data.content));

  items[index] = updatedItem;
  await saveFileToGithub(fileName, items, data.sha);
  log(`সফলভাবে আপডেট করা হয়েছে!`);
}

async function deleteItem(fileName, index) {
  if (!confirm("আপনি কি নিশ্চিত যে এই নাম টি মুছে ফেলতে চান?")) return;

  log(`${fileName} থেকে ডাটা মোছা হচ্ছে...`);
  const { token, owner, repo } = getConfig();

  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${fileName}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await res.json();
  let items = JSON.parse(fromBase64(data.content));

  items.splice(index, 1);

  await saveFileToGithub(fileName, items, data.sha);
  log(`আইটেম মুছে ফেলা হয়েছে!`);
  loadAllData();
}

/* ==================================================
   EXPORT TO CSV & JSON
================================================== */
function exportToCSV() {
  if (globalFlatItems.length === 0) {
    alert("ডাউনলোড করার মতো কোনো ডাটা নেই!");
    return;
  }

  let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
  csvContent += "নাম,অর্থ,ভাষা,স্ট্যাটাস\n";

  globalFlatItems.forEach(i => {
    csvContent += `"${i.name}","${i.meaning}","${i.category}","${i.status}"\n`;
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `baby_names_backup_${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function exportToJSON() {
  if (globalFlatItems.length === 0) {
    alert("ডাউনলোড করার মতো কোনো ডাটা নেই!");
    return;
  }

  const cleanData = globalFlatItems.map(({ _fileName, _indexInFile, ...rest }) => rest);
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(cleanData, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `baby_names_db_${Date.now()}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}
