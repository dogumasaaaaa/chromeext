document.addEventListener('DOMContentLoaded', async () => {
  const videoList = document.getElementById('videoList');
  const emailInput = document.getElementById('email');
  const passInput = document.getElementById('pass');
  const saveBtn = document.getElementById('saveBtn');
  const toggleCreds = document.getElementById('toggleCreds');
  const credSection = document.getElementById('credSection');
  
  // Manual Input Elements
  const manualUrlInput = document.getElementById('manualUrl');
  const manualUploadBtn = document.getElementById('manualUploadBtn');
  const manualStatus = document.getElementById('manualStatus');

  // Load configuration accounts profiles
  chrome.storage.local.get(['email', 'appPass'], (res) => {
    if (res.email) emailInput.value = res.email;
    if (res.appPass) passInput.value = res.appPass;
  });

  toggleCreds.addEventListener('click', () => {
    credSection.style.display = credSection.style.display === 'none' ? 'block' : 'none';
  });

  saveBtn.addEventListener('click', () => {
    chrome.storage.local.set({
      email: emailInput.value.trim(),
      appPass: passInput.value.trim()
    }, () => {
      alert("Credentials updated!");
    });
  });

  // Action for manual link uploads
  manualUploadBtn.addEventListener('click', () => {
    const targetUrl = manualUrlInput.value.trim();
    if (!targetUrl) {
      manualStatus.className = "status error";
      manualStatus.innerText = "Please paste a valid URL first!";
      return;
    }

    manualUploadBtn.disabled = true;
    manualUploadBtn.style.background = '#888';
    manualStatus.className = "status info";
    manualStatus.innerText = "Streaming upload active...";

    chrome.runtime.sendMessage({ type: "UPLOAD_TO_WEBDAV", videoUrl: targetUrl }, (response) => {
      manualUploadBtn.disabled = false;
      manualUploadBtn.style.background = '#2e7d32';
      
      if (response && response.success) {
        manualStatus.className = "status success";
        manualStatus.innerText = `✅ Saved as: ${response.fileName}`;
        manualUrlInput.value = ''; 
      } else {
        manualStatus.className = "status error";
        manualStatus.innerText = `❌ Error: ${response?.error || 'Upload failed'}`;
      }
    });
  });

  // Fallback scanner to read regular elements on background tab windows
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const urls = [];
      document.querySelectorAll('video, source').forEach(el => {
        const src = el.src || el.currentSrc;
        if (src && !src.startsWith('blob:') && !urls.includes(src)) {
          urls.push(src);
        }
      });
      return urls;
    }
  }, (results) => {
    if (!results || !results[0] || results[0].result.length === 0) {
      videoList.innerHTML = `<div class="status error" style="font-size:11px;">No standard embed tags found. Paste the URL into the top bar!</div>`;
      return;
    }

    videoList.innerHTML = '';
    results[0].result.forEach((url, index) => {
      const card = document.createElement('div');
      card.className = 'video-item';
      card.innerHTML = `
        <div class="video-url"><b>Detected Target:</b> ${url}</div>
        <button class="btn dl-btn" data-url="${url}">🚀 Save to Koofr (.mp4)</button>
        <div class="status" id="status-${index}"></div>
      `;
      videoList.appendChild(card);

      card.querySelector('.dl-btn').addEventListener('click', (e) => {
        const btn = e.target;
        const statusDiv = document.getElementById(`status-${index}`);
        btn.disabled = true;
        btn.style.background = '#888';
        statusDiv.innerText = "Processing...";

        chrome.runtime.sendMessage({ type: "UPLOAD_TO_WEBDAV", videoUrl: url }, (response) => {
          if (response && response.success) {
            statusDiv.className = "status success";
            statusDiv.innerText = "✅ Uploaded!";
          } else {
            statusDiv.className = "status error";
            statusDiv.innerText = "❌ Error";
            btn.disabled = false;
            btn.style.background = '#1e88e5';
          }
        });
      });
    });
  });
});
