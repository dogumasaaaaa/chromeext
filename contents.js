let detectedStreamUrl = null;

// Listen for stream URLs caught by the background sniffer
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "M3U8_DETECTED") {
    detectedStreamUrl = message.url;
    injectFloatingButton();
  }
});

function injectFloatingButton() {
  // Find visible video players on the page
  const videoElements = document.querySelectorAll("video");
  
  videoElements.forEach((video) => {
    // Prevent duplicate button injections
    if (video.parentElement.querySelector(".idm-webdav-bar")) return;

    // Create floating rectangular bar
    const bar = document.createElement("div");
    bar.className = "idm-webdav-bar";
    bar.innerText = "📥 Save Video to WebDAV";
    
    // Style the bar to sit neatly on top of the video player
    Object.assign(bar.style, {
      position: "absolute",
      top: "10px",
      right: "10px",
      zIndex: "2147483647", // Max z-index to stay on top of controls
      backgroundColor: "#1e88e5",
      color: "white",
      padding: "8px 12px",
      borderRadius: "4px",
      cursor: "pointer",
      fontWeight: "bold",
      fontSize: "13px",
      fontFamily: "Arial, sans-serif",
      boxShadow: "0px 2px 5px rgba(0,0,0,0.3)",
      transition: "background-color 0.2s"
    });

    bar.addEventListener("mouseover", () => bar.style.backgroundColor = "#1565c0");
    bar.addEventListener("mouseout", () => bar.style.backgroundColor = "#1e88e5");

    // Click handler to trigger background upload
    bar.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      
      const targetUrl = detectedStreamUrl || video.src;
      if (!targetUrl) {
        alert("Could not extract video source URL yet.");
        return;
      }

      bar.innerText = "⏳ Uploading...";
      bar.style.backgroundColor = "#ffb300";

      chrome.runtime.sendMessage({ type: "UPLOAD_TO_WEBDAV", videoUrl: targetUrl }, (response) => {
        if (response && response.success) {
          bar.innerText = "✅ Saved to Koofr!";
          bar.style.backgroundColor = "#4caf50";
          setTimeout(() => { bar.innerText = "📥 Save Video to WebDAV"; bar.style.backgroundColor = "#1e88e5"; }, 4000);
        } else {
          bar.innerText = "❌ Upload Failed";
          bar.style.backgroundColor = "#f44336";
          console.error(response?.error);
          setTimeout(() => { bar.innerText = "📥 Save Video to WebDAV"; bar.style.backgroundColor = "#1e88e5"; }, 4000);
        }
      });
    });

    // Handle relative positioning context for absolute button positioning
    if (window.getComputedStyle(video.parentElement).position === "static") {
      video.parentElement.style.position = "relative";
    }
    video.parentElement.appendChild(bar);
  });
}

// Continually poll the DOM for dynamically loaded video elements (AJAX/Single Page Apps)
setInterval(injectFloatingButton, 2000);
