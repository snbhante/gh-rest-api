// প্রতি ফাইলে সর্বোচ্চ কয়টি এন্ট্রি রাখা হবে
const MAX_ITEMS_PER_FILE = 5; 
const DATA_FOLDER = 'db_data';

// সিস্টেমে মেসেজ দেখানোর ফাংশন
function log(msg, isError = false) {
  const logEl = document.getElementById('logOutput');
  const time = new Date().toLocaleTimeString();
  logEl.innerText = `[${time}] ${isError ? '❌ ERROR:' : '✅ SUCCESS:'} ${msg}\n` + logEl.innerText;
}

// ইনপুট ভ্যালুসমূহ পাওয়া
function getConfig() {
  return {
    token: document.getElementById('token').value.trim(),
    owner: document.getElementById('owner').value.trim(),
    repo: document.getElementById('repo').value.trim()
  };
}

// Helper Functions for Unicode Base64
function toBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

function fromBase64(str) {
  return decodeURIComponent(escape(atob(str)));
}

// -----------------------------------------------------------------
// ১. GitHub API-তে ফাইল ক্রিয়েট/আপডেট ফাংশন
// -----------------------------------------------------------------
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

// -----------------------------------------------------------------
// ২. সব ফাইল ডাইনামিকালি স্ক্যান ও ফেচ করা (READ)
// -----------------------------------------------------------------
async function fetchAllFiles() {
  const { token, owner, repo } = getConfig();
  let fileIndex = 1;
  let allFilesData = [];

  while (true) {
    const filePath = `${DATA_FOLDER}/data_${fileIndex}.json`;
    try {
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.status === 404) {
        break; // আর কোনো নতুন ফাইল নেই
      }

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

// UI-তে ডাটা রেন্ডার করা
async function loadAllData() {
  const { token, owner, repo } = getConfig();
  if (!token || !owner || !repo) {
    alert("অনুগ্রহ করে টোকেন, ওনার এবং রেপোজিটরির নাম প্রদান করুন!");
    return;
  }

  log("সবগুলো ডেটাবেজ ফাইল লোড করা হচ্ছে...");
  const files = await fetchAllFiles();
  const tableBody = document.getElementById('dataTable');
  tableBody.innerHTML = '';

  let totalRecords = 0;

  files.forEach(file => {
    file.items.forEach((item, index) => {
      totalRecords++;
      
      // টিক চিহ্ন নির্বাচন
      let statusIcon = '➖';
      if (item.status === 'kept') {
        statusIcon = '<span class="status-icon status-kept" title="রেখে দেওয়া হয়েছে">✔</span>';
      } else if (item.status === 'selected') {
        statusIcon = '<span class="status-icon status-selected" title="পছন্দ করা হয়েছে">✔</span>';
      }

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${statusIcon}</td>
        <td><strong>${item.name}</strong></td>
        <td>${item.meaning}</td>
        <td>${item.category}</td>
        <td><small>${file.fileName}</small></td>
        <td>
          <button class="btn btn-yellow" onclick="setupEdit('${file.fileName}', ${index}, '${item.name}', '${item.meaning}', '${item.category}', '${item.status}')">এডিট</button>
          <button class="btn btn-red" onclick="deleteItem('${file.fileName}', ${index})">ডিলিট</button>
        </td>
      `;
      tableBody.appendChild(tr);
    });
  });

  if (totalRecords === 0) {
    tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center;">কোনো ডেটা পাওয়া যায়নি। প্রথম নাম যোগ করুন।</td></tr>`;
  }

  log(`মোট ${files.length} টি ফাইল থেকে ${totalRecords} টি রেকর্ড লোড হয়েছে।`);
}

// -----------------------------------------------------------------
// ৩. নতুন নাম যোগ করা (CREATE) - ডাইনামিক ফাইল হ্যান্ডলিং সহ
// -----------------------------------------------------------------
async function handleSave(e) {
  e.preventDefault();
  const editFile = document.getElementById('editFile').value;
  const editIndex = document.getElementById('editIndex').value;

  const newItem = {
    id: Date.now(),
    name: document.getElementById('babyName').value.trim(),
    meaning: document.getElementById('babyMeaning').value.trim(),
    category: document.getElementById('babyCategory').value,
    status: document.getElementById('babyStatus').value
  };

  if (editFile !== "") {
    // এটি এডিট অপারেশন
    await updateItemInFile(editFile, parseInt(editIndex), newItem);
  } else {
    // এটি নতুন ক্রিয়েট অপারেশন
    await insertNewItem(newItem);
  }

  // ফর্ম রিসেট
  document.getElementById('nameForm').reset();
  document.getElementById('editFile').value = "";
  document.getElementById('editIndex').value = "";
  document.getElementById('saveBtn').innerText = "সংরক্ষণ করুন";
  
  loadAllData();
}

async function insertNewItem(newItem) {
  log("নতুন ডেটা সেভ করার জায়গা খোঁজা হচ্ছে...");
  const files = await fetchAllFiles();

  if (files.length === 0) {
    // প্রথমবার কোনো ফাইলই নেই, data_1.json তৈরি করা হচ্ছে
    const firstFilePath = `${DATA_FOLDER}/data_1.json`;
    log(`প্রথম ফাইল তৈরি করা হচ্ছে: ${firstFilePath}`);
    await saveFileToGithub(firstFilePath, [newItem]);
  } else {
    // শেষ ফাইলটিতে জায়গা আছে কিনা তা পরীক্ষা করা
    const lastFile = files[files.length - 1];

    if (lastFile.items.length < MAX_ITEMS_PER_FILE) {
      // শেষ ফাইলেই নতুন ডেটা যুক্ত করা যাবে
      lastFile.items.push(newItem);
      log(`বিদ্যমান ফাইলে (${lastFile.fileName}) ডেটা যুক্ত হচ্ছে...`);
      await saveFileToGithub(lastFile.fileName, lastFile.items, lastFile.sha);
    } else {
      // ফাইল ফুল হয়ে গেছে! ডাইনামিকালি নতুন ফাইল (যেমন data_2.json) তৈরি করা হবে
      const newFileNumber = lastFile.fileNumber + 1;
      const newFilePath = `${DATA_FOLDER}/data_${newFileNumber}.json`;
      log(`ফাইল সীমা অতিক্রম করায় নতুন ফাইল খোলা হচ্ছে: ${newFilePath}`);
      await saveFileToGithub(newFilePath, [newItem]);
    }
  }
}

// -----------------------------------------------------------------
// ৪. ফাইল থেকে ডেটা এডিট ও আপডেট করা (UPDATE)
// -----------------------------------------------------------------
function setupEdit(fileName, index, name, meaning, category, status) {
  document.getElementById('editFile').value = fileName;
  document.getElementById('editIndex').value = index;
  document.getElementById('babyName').value = name;
  document.getElementById('babyMeaning').value = meaning;
  document.getElementById('babyCategory').value = category;
  document.getElementById('babyStatus').value = status;

  document.getElementById('saveBtn').innerText = "আপডেট সম্পন্ন করুন";
}

async function updateItemInFile(fileName, index, updatedItem) {
  log(`${fileName} ফাইল আপডেট করা হচ্ছে...`);
  const { token, owner, repo } = getConfig();

  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${fileName}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await res.json();
  const items = JSON.parse(fromBase64(data.content));

  items[index] = updatedItem; // আপডেট করা হলো

  await saveFileToGithub(fileName, items, data.sha);
  log(`সফলভাবে আপডেট করা হয়েছে!`);
}

// -----------------------------------------------------------------
// ৫. ফাইল থেকে ডেটা ডিলিট করা (DELETE)
// -----------------------------------------------------------------
async function deleteItem(fileName, index) {
  if (!confirm("আপনি কি নিশ্চিত যে এই নাম টি মুছে ফেলতে চান?")) return;

  log(`${fileName} থেকে ডেটা মুছে ফেলা হচ্ছে...`);
  const { token, owner, repo } = getConfig();

  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${fileName}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await res.json();
  let items = JSON.parse(fromBase64(data.content));

  items.splice(index, 1); // আইটেমটি বাদ দেওয়া হলো

  await saveFileToGithub(fileName, items, data.sha);
  log(`আইটেম মুছে ফেলা হয়েছে!`);
  loadAllData();
}
