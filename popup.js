document.addEventListener('DOMContentLoaded', async () => {
  const videoList = document.getElementById('videoList');
  const emailInput = document.getElementById('email');
  const passInput = document.getElementById('pass');
  const saveBtn = document.getElementById('saveBtn');
  const toggleCreds = document.getElementById('toggleCreds');
  const credSection = document.getElementById('credSection');

  // Load configured or empty credentials settings
  chrome.storage.local.get(['email', 'appPass'], (res) => {
    if (res.email) emailInput.value = res.email;
    if (res.appPass) passInput.value = res.appPass;
  });

  // Toggle settings panel view
  toggleCreds.addEventListener('click', () => {
    credSection.style.display = credSection.style.display === 'none' ? 'block' : 'none';
  });

  // Save manual inputs
  saveBtn.addEventListener('click', () => {
    chrome.storage.local.set({
      email: emailInput.value.trim(),
      appPass: passInput.value.trim()
    }, () => {
      alert("Credentials updated!");
    });
  });

  // Get active browser tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  // Run a quick query script inside the website page to see what video elements are there
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const urls = [];
      // Look for plain video sources, source tags, and common stream classes
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
      videoList.innerHTML = `<div class="status error">No accessible direct video links or streams detected on this page. Make sure the video has played or loaded.</div>`;
      return;
    }

    videoList.innerHTML = ''; // Clear scanning state text
    const videoUrls = results[0].result;

    videoUrls.forEach((url, index) => {
      const card = document.createElement('div');
      card.className = 'video-item';

      // Clean display name logic
      let extension = url.split('.').pop().split('?')[0] || 'mp4';
      if(extension.length > 4) extension = 'mp4';

      card.innerHTML = `
        <div class="video-url"><b>Video ${index + 1}:</b> ${url}</div>
        <button class="btn dl-btn" data-url="${url}">🚀 Save Stream to Koofr (.mp4)</button>
        <div class="status" id="status-${index}"></div>
      `;

      videoList.appendChild(card);

      // Handle individual upload clicks
      card.querySelector('.dl-btn').addEventListener('click', async (e) => {
        const btn = e.target;
        const statusDiv = document.getElementById(`status-${index}`);
        
        btn.disabled = true;
        btn.style.background = '#888';
        statusDiv.className = "status info";
        statusDiv.innerText = "Processing upload...";

        // Send URL packet to our background client script
        chrome.runtime.sendMessage({ type: "UPLOAD_TO_WEBDAV", videoUrl: url }, (response) => {
          if (response && response.success) {
            statusDiv.className = "status success";
            statusDiv.innerText = `✅ Successfully uploaded as: ${response.fileName}`;
            btn.style.background = '#4caf50';
          } else {
            statusDiv.className = "status error";
            statusDiv.innerText = `❌ Error: ${response?.error || 'Upload Blocked/Failed'}`;
            btn.disabled = false;
            btn.style.background = '#1e88e5';
          }
        });
      });
    });
  });
});
