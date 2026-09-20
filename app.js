// ইনপুট ফিল্ড থেকে ডেটা সংগ্রহ করা
function getFormConfig() {
  return {
    token: document.getElementById('token').value.trim(),
    owner: document.getElementById('owner').value.trim(),
    repo: document.getElementById('repo').value.trim(),
    path: document.getElementById('filePath').value.trim(),
    content: document.getElementById('content').value
  };
}

// UTF-8 String কে Base64 এ রূপান্তর (GitHub API Base64 গ্রহণ করে)
function toBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

// Base64 কে UTF-8 String এ ডিকোড করা
function fromBase64(str) {
  return decodeURIComponent(escape(atob(str)));
}

// আউটপুট পেজে প্রিন্ট করা
function logOutput(message, isError = false) {
  const outputEl = document.getElementById('output');
  const timestamp = new Date().toLocaleTimeString();
  const status = isError ? '[ERROR]' : '[SUCCESS]';
  outputEl.innerText = `${timestamp} ${status}\n${message}`;
}

// ১. READ / ডাটা লোড করা
async function readFile() {
  const { token, owner, repo, path } = getFormConfig();
  if (!token || !owner || !repo || !path) {
    alert("সবগুলো তথ্য সঠিকভাবে পূরণ করুন!");
    return;
  }

  logOutput("ফাইল লোড হচ্ছে...");

  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json'
      }
    });

    const data = await response.json();

    if (response.ok) {
      const decodedContent = fromBase64(data.content);
      document.getElementById('content').value = decodedContent;
      logOutput(`File Loaded Successfully!\nSHA: ${data.sha}\n\nContent:\n${decodedContent}`);
    } else {
      logOutput(data.message, true);
    }
  } catch (err) {
    logOutput(err.message, true);
  }
}

// ২. CREATE / ফাইল নতুন তৈরি করা
async function createFile() {
  const { token, owner, repo, path, content } = getFormConfig();
  if (!token || !owner || !repo || !path) {
    alert("সবগুলো তথ্য পূরণ করুন!");
    return;
  }

  logOutput("নতুন ফাইল তৈরি হচ্ছে...");

  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: `Create ${path} via GitHub Page`,
        content: toBase64(content)
      })
    });

    const data = await response.json();

    if (response.ok) {
      logOutput(`File Created Successfully!\nPath: ${data.content.path}\nHTML URL: ${data.content.html_url}`);
    } else {
      logOutput(data.message, true);
    }
  } catch (err) {
    logOutput(err.message, true);
  }
}

// ৩. UPDATE / ফাইলের ডেটা আপডেট করা
async function updateFile() {
  const { token, owner, repo, path, content } = getFormConfig();
  if (!token || !owner || !repo || !path) {
    alert("সবগুলো তথ্য পূরণ করুন!");
    return;
  }

  logOutput("ফাইল আপডেটের পূর্বে SHA সংগ্রহ করা হচ্ছে...");

  try {
    // আপডেটের জন্য ফাইলের বর্তমান SHA সংগ্রহ করতে হয়
    const getRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const getData = await getRes.json();

    if (!getRes.ok) {
      logOutput(`ফাইলটি খুঁজে পাওয়া যায়নি! আপডেট করার আগে ফাইলটি তৈরি থাকতে হবে।`, true);
      return;
    }

    const sha = getData.sha;

    // ফাইল আপডেট রিকোয়েস্ট
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: `Update ${path} via GitHub Page`,
        content: toBase64(content),
        sha: sha
      })
    });

    const data = await response.json();

    if (response.ok) {
      logOutput(`File Updated Successfully!\nNew SHA: ${data.content.sha}`);
    } else {
      logOutput(data.message, true);
    }
  } catch (err) {
    logOutput(err.message, true);
  }
}

// ৪. DELETE / ফাইল মুছে ফেলা
async function deleteFile() {
  const { token, owner, repo, path } = getFormConfig();
  if (!token || !owner || !repo || !path) {
    alert("সবগুলো তথ্য পূরণ করুন!");
    return;
  }

  if (!confirm(`আপনি কি নিশ্চিত যে ${path} ফাইলটি মুছে ফেলতে চান?`)) return;

  logOutput("ডিলিট করার জন্য ফাইলের SHA আনা হচ্ছে...");

  try {
    const getRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const getData = await getRes.json();

    if (!getRes.ok) {
      logOutput(`ফাইলটি পাওয়া যায়নি: ${getData.message}`, true);
      return;
    }

    const sha = getData.sha;

    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: `Delete ${path} via GitHub Page`,
        sha: sha
      })
    });

    const data = await response.json();

    if (response.ok) {
      logOutput(`File Deleted Successfully!`);
      document.getElementById('content').value = '';
    } else {
      logOutput(data.message, true);
    }
  } catch (err) {
    logOutput(err.message, true);
  }
}
