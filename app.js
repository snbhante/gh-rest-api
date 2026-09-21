const MAX_ITEMS_PER_FILE = 500;
const DATA_FOLDER = "data";
const PAGE_SIZE = 10;

let rawAllFiles = [];
let globalFlatItems = [];
let filteredItems = [];
let favoriteIds = new Set();
let currentPage = 1;
let currentSortDir = "asc";
let myChart = null;

/* ==================================================
   📦 INDEXEDDB IMPLEMENTATION (IndexedDB Cache)
================================================== */
const DB_NAME = "BabyNamesCacheDB";
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("files")) {
        db.createObjectStore("files", { keyPath: "fileName" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveToIDB(files) {
  const db = await openDB();
  const tx = db.transaction("files", "readwrite");
  const store = tx.objectStore("files");
  store.clear();
  files.forEach((f) => store.put(f));
  return tx.complete;
}

async function getFromIDB() {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction("files", "readonly");
    const store = tx.objectStore("files");
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
  });
}

/* ==================================================
   🚀 INITIALIZATION & THEME LOGIC
================================================== */
window.addEventListener("DOMContentLoaded", () => {
  loadSavedConfig();
  initTheme();
  loadFavorites();
  initChart();
});

function log(msg, isError = false) {
  const logEl = document.getElementById("logOutput");
  const time = new Date().toLocaleTimeString();
  logEl.innerText =
    `[${time}] ${isError ? "❌ ERROR:" : "✅ SUCCESS:"} ${msg}\n` +
    logEl.innerText;
}

function updateThemeButtonText(isDark) {
  const iconEl = document.querySelector("#themeBtn .theme-icon");
  const textEl = document.querySelector("#themeBtn .theme-text");
  if (iconEl && textEl) {
    iconEl.innerText = isDark ? "☀️" : "🌙";
    textEl.innerText = isDark ? "লাইট মোড" : "ডার্ক মোড";
  }
}

function toggleDarkMode() {
  document.body.classList.toggle("dark-mode");
  const isDark = document.body.classList.contains("dark-mode");
  localStorage.setItem("theme", isDark ? "dark" : "light");
  updateThemeButtonText(isDark);
}

function initTheme() {
  const isDark = localStorage.getItem("theme") === "dark";
  if (isDark) {
    document.body.classList.add("dark-mode");
  }
  updateThemeButtonText(isDark);
}

/* ==================================================
   🔐 PAT ENCRYPTION & CONFIGURATION
================================================== */
function getConfig() {
  return {
    token: document.getElementById("token").value.trim(),
    owner: document.getElementById("owner").value.trim(),
    repo: document.getElementById("repo").value.trim(),
  };
}

function saveConfigIfNeeded() {
  const remember = document.getElementById("rememberConfig").checked;
  const pass = document.getElementById("encryptPass").value.trim();
  const { token, owner, repo } = getConfig();

  if (remember) {
    if (token && pass) {
      const encryptedToken = CryptoJS.AES.encrypt(token, pass).toString();
      localStorage.setItem("gh_token_enc", encryptedToken);
    } else if (token) {
      localStorage.setItem("gh_token", token);
    }
    localStorage.setItem("gh_owner", owner);
    localStorage.setItem("gh_repo", repo);
  } else {
    localStorage.removeItem("gh_token");
    localStorage.removeItem("gh_token_enc");
    localStorage.removeItem("gh_owner");
    localStorage.removeItem("gh_repo");
  }
}

function loadSavedConfig() {
  const savedOwner = localStorage.getItem("gh_owner");
  const savedRepo = localStorage.getItem("gh_repo");
  const savedPlainToken = localStorage.getItem("gh_token");

  if (savedOwner) document.getElementById("owner").value = savedOwner;
  if (savedRepo) document.getElementById("repo").value = savedRepo;
  if (savedPlainToken) document.getElementById("token").value = savedPlainToken;

  if (savedOwner || savedPlainToken) {
    document.getElementById("rememberConfig").checked = true;
  }
}

function decryptPAT() {
  const pass = document.getElementById("encryptPass").value.trim();
  const encToken = localStorage.getItem("gh_token_enc");
  if (encToken && pass) {
    try {
      const bytes = CryptoJS.AES.decrypt(encToken, pass);
      const originalToken = bytes.toString(CryptoJS.enc.Utf8);
      if (originalToken) {
        document.getElementById("token").value = originalToken;
        log("টোকেন সফলভাবে ডিক্রিপ্ট করা হয়েছে।");
      }
    } catch (e) {
      log("পাসওয়ার্ড ভুল বা ডিক্রিপ্ট করতে ব্যর্থ!", true);
    }
  }
}

document.getElementById("encryptPass").addEventListener("blur", decryptPAT);

/* ==================================================
   🎨 DROPDOWNS & NAVIGATION
================================================== */
function toggleDropdown(dropdownId) {
  const dropdown = document.getElementById(dropdownId);
  const isOpen = dropdown.classList.contains("active");
  document
    .querySelectorAll(".custom-dropdown")
    .forEach((d) => d.classList.remove("active"));
  if (!isOpen) dropdown.classList.add("active");
}

function selectOption(dropdownId, value, labelText) {
  const dropdown = document.getElementById(dropdownId);
  const hiddenInput = dropdown.querySelector('input[type="hidden"]');
  const selectedText = dropdown.querySelector(".selected-text");

  hiddenInput.value = value;
  selectedText.innerText = labelText;

  dropdown.querySelectorAll(".dropdown-item").forEach((item) => {
    item.classList.remove("selected");
    if (item.getAttribute("data-value") === value)
      item.classList.add("selected");
  });

  dropdown.classList.remove("active");
}

function selectFilterOption(dropdownId, value, labelText) {
  selectOption(dropdownId, value, labelText);
  applyFilters();
}

document.addEventListener("click", function (e) {
  if (!e.target.closest(".custom-dropdown")) {
    document
      .querySelectorAll(".custom-dropdown")
      .forEach((d) => d.classList.remove("active"));
  }
});

function resetCustomDropdowns() {
  selectOption("dropdownLanguage", "", "ভাষা নির্বাচন করুন");
  selectOption("dropdownGender", "unisex", "উভয় (Unisex)");
  selectOption("dropdownStatus", "", "স্ট্যাটাস নির্বাচন করুন");
}

/* ==================================================
   ⭐ FAVORITES (BOOKMARK) SYSTEM
================================================== */
function loadFavorites() {
  const favs = localStorage.getItem("baby_favs");
  if (favs) favoriteIds = new Set(JSON.parse(favs));
}

function toggleFavorite(id) {
  if (favoriteIds.has(id)) {
    favoriteIds.delete(id);
  } else {
    favoriteIds.add(id);
  }
  localStorage.setItem("baby_favs", JSON.stringify([...favoriteIds]));
  updateAnalytics(globalFlatItems, rawAllFiles.length);
  renderTablePage();
}

/* ==================================================
   🌐 GITHUB DB & CACHE LOGIC
================================================== */
function toBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}
function fromBase64(str) {
  return decodeURIComponent(escape(atob(str)));
}

async function saveFileToGithub(filePath, contentArray, sha = null) {
  const { token, owner, repo } = getConfig();
  const body = {
    message: `Database update: ${filePath}`,
    content: toBase64(JSON.stringify(contentArray, null, 2)),
  };
  if (sha) body.sha = sha;

  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  return await res.json();
}

async function fetchAllFilesFromGitHub() {
  const { token, owner, repo } = getConfig();
  let fileIndex = 1;
  let allFilesData = [];

  while (true) {
    const filePath = `${DATA_FOLDER}/names_${fileIndex}.json`;
    try {
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.status === 404) break;

      const data = await res.json();
      if (res.ok) {
        const parsedContent = JSON.parse(fromBase64(data.content));
        allFilesData.push({
          fileName: filePath,
          sha: data.sha,
          fileNumber: fileIndex,
          items: parsedContent,
        });
        fileIndex++;
      } else break;
    } catch (err) {
      break;
    }
  }
  return allFilesData;
}

async function loadAllData(forceSync = false) {
  const { token, owner, repo } = getConfig();

  if (!forceSync) {
    const cachedFiles = await getFromIDB();
    if (cachedFiles && cachedFiles.length > 0) {
      log("IndexedDB ক্যাশ থেকে দ্রুত ডেটা লোড করা হয়েছে।");
      processLoadedFiles(cachedFiles);
      return;
    }
  }

  if (!token || !owner || !repo) {
    alert("অনুগ্রহ করে টোকেন, ওনার এবং রেপোজিটরির নাম প্রদান করুন!");
    return;
  }

  saveConfigIfNeeded();
  log("GitHub API থেকে সর্বশেষ ডেটা লোড করা হচ্ছে...");

  rawAllFiles = await fetchAllFilesFromGitHub();
  await saveToIDB(rawAllFiles);
  processLoadedFiles(rawAllFiles);
  log(`GitHub থেকে ${rawAllFiles.length}টি ফাইল সিঙ্ক করা সম্পন্ন।`);
}

function processLoadedFiles(files) {
  rawAllFiles = files;
  globalFlatItems = [];
  rawAllFiles.forEach((file) => {
    file.items.forEach((item, index) => {
      globalFlatItems.push({
        ...item,
        _fileName: file.fileName,
        _indexInFile: index,
      });
    });
  });

  updateAnalytics(globalFlatItems, rawAllFiles.length);
  updateChartData(globalFlatItems);
  applyFilters();
}

/* ==================================================
   📊 ANALYTICS & GRAPH CHART
================================================== */
function updateAnalytics(items, totalFiles) {
  const activeItems = items.filter((i) => !i.isDeleted);
  document.getElementById("statTotal").innerText = activeItems.length;
  document.getElementById("statSelected").innerText = activeItems.filter(
    (i) => i.status === "selected",
  ).length;
  document.getElementById("statKept").innerText = activeItems.filter(
    (i) => i.status === "kept",
  ).length;
  document.getElementById("statFiles").innerText = totalFiles;
  document.getElementById("statFavs").innerText = favoriteIds.size;
  document.getElementById("statTrash").innerText = items.filter(
    (i) => i.isDeleted,
  ).length;
}

function initChart() {
  const ctx = document.getElementById("categoryChart").getContext("2d");
  myChart = new Chart(ctx, {
    type: "pie",
    data: {
      labels: ["বাংলা", "ইংরেজি", "চাকমা", "পালি"],
      datasets: [
        {
          data: [0, 0, 0, 0],
          backgroundColor: ["#3498db", "#2ecc71", "#f1c40f", "#e74c3c"],
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
    },
  });
}

function updateChartData(items) {
  const activeItems = items.filter((i) => !i.isDeleted);
  const counts = { বাংলা: 0, ইংরেজি: 0, চাকমা: 0, পালি: 0 };
  activeItems.forEach((i) => {
    if (counts[i.category] !== undefined) counts[i.category]++;
  });

  if (myChart) {
    myChart.data.datasets[0].data = [
      counts["বাংলা"],
      counts["ইংরেজি"],
      counts["চাকমা"],
      counts["পালি"],
    ];
    myChart.update();
  }
}

/* ==================================================
   🔍 FILTERS & PAGINATION
================================================== */
function applyFilters() {
  const searchValue = document
    .getElementById("searchInput")
    .value.toLowerCase()
    .trim();
  const categoryValue = document.getElementById("filterCategoryVal").value;
  const genderValue = document.getElementById("filterGenderVal").value;
  const viewMode = document.getElementById("filterViewVal").value;

  filteredItems = globalFlatItems.filter((item) => {
    if (viewMode === "trash") {
      if (!item.isDeleted) return false;
    } else {
      if (item.isDeleted) return false;
    }

    if (viewMode === "favs" && !favoriteIds.has(item.id)) return false;

    const matchesSearch =
      item.name.toLowerCase().includes(searchValue) ||
      item.meaning.toLowerCase().includes(searchValue);
    const matchesCategory =
      categoryValue === "" || item.category === categoryValue;
    const matchesGender =
      genderValue === "" || (item.gender || "unisex") === genderValue;

    return matchesSearch && matchesCategory && matchesGender;
  });

  currentPage = 1;
  renderTablePage();
}

function toggleSort(field) {
  currentSortDir = currentSortDir === "asc" ? "desc" : "asc";
  document.getElementById("sortNameIcon").innerText =
    currentSortDir === "asc" ? "▲" : "▼";

  filteredItems.sort((a, b) =>
    currentSortDir === "asc"
      ? a.name.localeCompare(b.name, "bn")
      : b.name.localeCompare(a.name, "bn"),
  );

  renderTablePage();
}

function renderTablePage() {
  const tableBody = document.getElementById("dataTable");
  tableBody.innerHTML = "";

  const totalPages = Math.ceil(filteredItems.length / PAGE_SIZE) || 1;
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const pageItems = filteredItems.slice(startIndex, startIndex + PAGE_SIZE);

  pageItems.forEach((item) => {
    let statusIcon = "➖";
    if (item.status === "kept") {
      statusIcon = '<span class="status-icon status-kept-color" title="রেখে দেওয়া হয়েছে">✔</span>';
    } else if (item.status === "selected") {
      statusIcon = '<span class="status-icon status-selected-color" title="পছন্দ করা হয়েছে">✔</span>';
    }

    const isFav = favoriteIds.has(item.id);
    const favStar = isFav ? "⭐" : "☆";

    let genderBadge = "👫";
    if (item.gender === "boy") genderBadge = "👦";
    if (item.gender === "girl") genderBadge = "👧";

    const tr = document.createElement("tr");

    if (item.isDeleted) {
      tr.innerHTML = `
        <td class="sticky-col-left">${statusIcon}</td>
        <td><strong>${item.name}</strong></td>
        <td>${item.meaning}</td>
        <td>${item.category} ${genderBadge}</td>
        <td class="sticky-col-right">
          <div class="btn-action-group">
            <button class="btn btn-green btn-sm" onclick="restoreItem('${item._fileName}', ${item._indexInFile})">♻️ রিস্টোর</button>
            <button class="btn btn-red btn-sm" onclick="permanentDeleteItem('${item._fileName}', ${item._indexInFile})">❌ চিরতরে মুছুন</button>
          </div>
        </td>
      `;
    } else {
      tr.innerHTML = `
        <td class="sticky-col-left">${statusIcon}</td>
        <td>
          <span style="cursor:pointer;" onclick="toggleFavorite(${item.id})">${favStar}</span>
          <strong>${item.name}</strong>
        </td>
        <td>${item.meaning}</td>
        <td>${item.category} ${genderBadge}</td>
        <td class="sticky-col-right">
          <div class="btn-action-group">
            <button class="btn btn-blue btn-sm" onclick="copyOrShare('${item.name}', '${item.meaning}')" title="কপি/ শেয়ার">📋</button>
            <button class="btn btn-yellow btn-sm" onclick="setupEdit('${item._fileName}', ${item._indexInFile}, '${item.name}', '${item.meaning}', '${item.category}', '${item.gender}', '${item.status}')">✏️</button>
            <button class="btn btn-red btn-sm" onclick="deleteItem('${item._fileName}', ${item._indexInFile})">🗑️</button>
          </div>
        </td>
      `;
    }
    tableBody.appendChild(tr);
  });

  if (filteredItems.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;">কোনো মিল পাওয়া যায়নি।</td></tr>`;
  }

  document.getElementById("pageInfo").innerText = `পৃষ্ঠা ${currentPage} এর ${totalPages}`;
  document.getElementById("btnPrevPage").disabled = currentPage === 1;
  document.getElementById("btnNextPage").disabled = currentPage >= totalPages;
}

function changePage(direction) {
  currentPage += direction;
  renderTablePage();
}

/* ==================================================
   💾 SAVE, EDIT, TRASH, RESTORE & PERMANENT DELETE
================================================== */
async function handleSave(e) {
  e.preventDefault();

  const nameInput = document.getElementById("babyName").value.trim();
  const meaningInput = document.getElementById("babyMeaning").value.trim();
  const categoryInput = document.getElementById("babyCategory").value;
  const genderInput = document.getElementById("babyGender").value;

  if (!nameInput || !meaningInput || !categoryInput) {
    alert("অনুগ্রহ করে নাম, অর্থ এবং ভাষা নির্বাচন করুন।");
    return;
  }

  const editFile = document.getElementById("editFile").value;
  const editIndex = document.getElementById("editIndex").value;

  const newItem = {
    id: editFile ? globalFlatItems[editIndex].id : Date.now(),
    name: nameInput,
    meaning: meaningInput,
    category: categoryInput,
    gender: genderInput,
    status: document.getElementById("babyStatus").value || "none",
    isDeleted: false,
  };

  const saveBtn = document.getElementById("saveBtn");
  saveBtn.innerText = "সংরক্ষণ হচ্ছে...";
  saveBtn.disabled = true;

  try {
    if (editFile !== "") {
      await updateItemInFile(editFile, parseInt(editIndex), newItem);
    } else {
      await insertNewItem(newItem);
    }

    document.getElementById("nameForm").reset();
    resetCustomDropdowns();
    document.getElementById("editFile").value = "";
    document.getElementById("editIndex").value = "";
    saveBtn.innerText = "সংরক্ষণ করুন";

    await loadAllData(true);
  } catch (err) {
    log("ডাটা সংরক্ষণ করতে সমস্যা হয়েছে: " + err.message, true);
    saveBtn.innerText = "সংরক্ষণ করুন";
  } finally {
    saveBtn.disabled = false;
  }
}

async function insertNewItem(newItem) {
  if (rawAllFiles.length === 0) {
    const firstFilePath = `${DATA_FOLDER}/names_1.json`;
    await saveFileToGithub(firstFilePath, [newItem]);
  } else {
    const lastFile = rawAllFiles[rawAllFiles.length - 1];
    if (lastFile.items.length < MAX_ITEMS_PER_FILE) {
      lastFile.items.push(newItem);
      await saveFileToGithub(lastFile.fileName, lastFile.items, lastFile.sha);
    } else {
      const newFilePath = `${DATA_FOLDER}/names_${lastFile.fileNumber + 1}.json`;
      await saveFileToGithub(newFilePath, [newItem]);
    }
  }
}

function setupEdit(fileName, index, name, meaning, category, gender, status) {
  document.getElementById("editFile").value = fileName;
  document.getElementById("editIndex").value = index;
  document.getElementById("babyName").value = name;
  document.getElementById("babyMeaning").value = meaning;

  selectOption("dropdownLanguage", category, category || "ভাষা নির্বাচন করুন");
  selectOption("dropdownGender", gender || "unisex", gender === "boy" ? "ছেলে (Boy)" : gender === "girl" ? "মেয়ে (Girl)" : "উভয় (Unisex)");

  let statusText = "স্ট্যাটাস নির্বাচন করুন";
  if (status === "kept") statusText = "রেখে দেওয়া হয়েছে";
  else if (status === "selected") statusText = "পছন্দ করা হয়েছে";

  selectOption("dropdownStatus", status, statusText);
  document.getElementById("saveBtn").innerText = "আপডেট সম্পন্ন করুন";
}

async function updateItemInFile(fileName, index, updatedItem) {
  const fileObj = rawAllFiles.find((f) => f.fileName === fileName);
  if (fileObj) {
    fileObj.items[index] = updatedItem;
    await saveFileToGithub(fileName, fileObj.items, fileObj.sha);
  }
}

async function deleteItem(fileName, index) {
  if (!confirm("আপনি কি নিশ্চিত এটি রিসাইকেল বিন-এ পাঠাতে চান?")) return;
  const fileObj = rawAllFiles.find((f) => f.fileName === fileName);
  if (fileObj) {
    fileObj.items[index].isDeleted = true;
    await saveFileToGithub(fileName, fileObj.items, fileObj.sha);
    log(`আইটেমটি রিসাইকেল বিন-এ সরানো হয়েছে।`);
    await loadAllData(true);
  }
}

async function restoreItem(fileName, index) {
  const fileObj = rawAllFiles.find((f) => f.fileName === fileName);
  if (fileObj) {
    fileObj.items[index].isDeleted = false;
    await saveFileToGithub(fileName, fileObj.items, fileObj.sha);
    log(`আইটেমটি পুনরুদ্ধার করা হয়েছে।`);
    await loadAllData(true);
  }
}

async function permanentDeleteItem(fileName, index) {
  if (!confirm("আপনি কি নিশ্চিত এটি চিরতরে মুছে ফেলতে চান? এই অ্যাকশনটি ফেরত নেওয়া সম্ভব নয়!")) return;

  const fileObj = rawAllFiles.find((f) => f.fileName === fileName);
  if (fileObj) {
    fileObj.items.splice(index, 1);
    try {
      await saveFileToGithub(fileName, fileObj.items, fileObj.sha);
      log(`আইটেমটি চিরতরে মুছে ফেলা হয়েছে।`);
      await loadAllData(true);
    } catch (err) {
      log("ডাটা চিরতরে মুছতে সমস্যা হয়েছে: " + err.message, true);
    }
  }
}


/* ==================================================
   📲 SHARE / COPY FEATURE
================================================== */
function copyOrShare(name, meaning) {
  const shareText = `👶 নাম: ${name}\n📖 অর্থ: ${meaning}`;
  if (navigator.share) {
    navigator
      .share({ title: "নবজাতকের নাম", text: shareText })
      .catch(() => {});
  } else {
    navigator.clipboard.writeText(shareText);
    alert("নাম ও অর্থ ক্লিপবোর্ডে কপি করা হয়েছে!");
  }
}

/* ==================================================
   📁 BULK UPLOAD SYSTEM
================================================== */
function toggleBulkModal() {
  const modal = document.getElementById("bulkModal");
  modal.style.display = modal.style.display === "flex" ? "none" : "flex";
}

async function processBulkUpload() {
  const fileInput = document.getElementById("bulkFileInput");
  if (!fileInput.files.length) {
    alert("অনুগ্রহ করে একটি JSON বা CSV ফাইল সিলেক্ট করুন।");
    return;
  }

  const file = fileInput.files[0];
  const reader = new FileReader();

  reader.onload = async (e) => {
    try {
      let newItems = [];
      if (file.name.endsWith(".json")) {
        newItems = JSON.parse(e.target.result);
      } else if (file.name.endsWith(".csv")) {
        const lines = e.target.result.split("\n");
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(",");
          if (cols.length >= 2) {
            newItems.push({
              id: Date.now() + i,
              name: cols[0].replace(/"/g, "").trim(),
              meaning: cols[1].replace(/"/g, "").trim(),
              category: cols[2] ? cols[2].replace(/"/g, "").trim() : "বাংলা",
              gender: "unisex",
              status: "none",
            });
          }
        }
      }

      log(`${newItems.length} টি নতুন রেকর্ড বাল্ক প্রসেসিং করা হচ্ছে...`);
      for (const item of newItems) {
        await insertNewItem({
          id: item.id || Date.now(),
          name: item.name,
          meaning: item.meaning,
          category: item.category || "বাংলা",
          gender: item.gender || "unisex",
          status: item.status || "none",
          isDeleted: false,
        });
      }

      toggleBulkModal();
      await loadAllData(true);
      log("বাল্ক ইমপোর্ট সফলভাবে সম্পন্ন হয়েছে!");
    } catch (err) {
      alert("ফাইল প্রসেস করতে ব্যর্থ! সঠিক ফরম্যাট চেক করুন।");
    }
  };

  reader.readAsText(file);
}

/* ==================================================
   📤 EXPORT CSV & JSON
================================================== */
function exportToCSV() {
  if (globalFlatItems.length === 0) return alert("কোনো ডাটা নেই!");
  let csv = "data:text/csv;charset=utf-8,\uFEFFনাম,অর্থ,ভাষা,লিঙ্গ,স্ট্যাটাস\n";
  globalFlatItems
    .filter((i) => !i.isDeleted)
    .forEach((i) => {
      csv += `"${i.name}","${i.meaning}","${i.category}","${i.gender || "unisex"}","${i.status}"\n`;
    });
  const link = document.createElement("a");
  link.href = encodeURI(csv);
  link.download = `baby_names_${Date.now()}.csv`;
  link.click();
}

function exportToJSON() {
  if (globalFlatItems.length === 0) return alert("কোনো ডাটা নেই!");
  const cleanData = globalFlatItems
    .filter((i) => !i.isDeleted)
    .map(({ _fileName, _indexInFile, ...rest }) => rest);
  const blob = new Blob([JSON.stringify(cleanData, null, 2)], {
    type: "application/json",
  });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `baby_names_${Date.now()}.json`;
  link.click();
}