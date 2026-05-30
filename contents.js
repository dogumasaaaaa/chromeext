// Inject network interceptor directly into the webpage window context
const interceptScript = document.createElement('script');
interceptScript.textContent = `
  (function() {
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
      const url = args[0];
      if (typeof url === 'string' && (url.includes('.m3u8') || url.includes('.mp4'))) {
        window.dispatchEvent(new CustomEvent('VideoGrabberStreamFound', { detail: url }));
      }
      return originalFetch.apply(this, args);
    };

    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
      if (typeof url === 'string' && (url.includes('.m3u8') || url.includes('.mp4'))) {
        window.dispatchEvent(new CustomEvent('VideoGrabberStreamFound', { detail: url }));
      }
      return originalOpen.apply(this, arguments);
    };
  })();
`;
document.documentElement.appendChild(interceptScript);
interceptScript.remove();

let latestStreamUrl = null;

// Catch stream URLs broadcasted from our injected interceptor script
window.addEventListener('VideoGrabberStreamFound', (e) => {
  latestStreamUrl = e.detail;
  injectFloatingButton();
});

function injectFloatingButton() {
  // Target video tags, or video wrapper elements
  const videoElements = document.querySelectorAll("video, .video-stream, .html5-main-video");
  
  videoElements.forEach((video) => {
    // Find the closest relative parent container so the button overlays neatly
    let parent = video.parentElement;
    if (!parent) return;

    // Avoid duplicating the button overlay
    if (parent.querySelector(".idm-webdav-bar")) return;

    const bar = document.createElement("div");
    bar.className = "idm-webdav-bar";
    bar.innerHTML = `<span style="margin-right:6px;">📥</span> Save Video to WebDAV`;
    
    // Industrial grade IDM-style layout properties
    Object.assign(bar.style, {
      position: "absolute",
      top: "12px",
      right: "12px",
      zIndex: "2147483647", 
      backgroundColor: "#1e88e5",
      color: "white",
      padding: "8px 14px",
      borderRadius: "4px",
      cursor: "pointer",
      fontWeight: "bold",
      fontSize: "13px",
      fontFamily: "Segoe UI, Arial, sans-serif",
      boxShadow: "0px 3px 6px rgba(0,0,0,0.4)",
      display: "flex",
      alignItems: "center",
      userSelect: "none",
      pointerEvents: "auto",
      transition: "transform 0.1s, background-color 0.2s"
    });

    bar.addEventListener("mouseover", () => {
      bar.style.backgroundColor = "#1565c0";
      bar.style.transform = "scale(1.03)";
    });
    bar.addEventListener("mouseout", () => {
      bar.style.backgroundColor = "#1e88e5";
      bar.style.transform = "scale(1)";
    });

    bar.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      
      const downloadTarget = latestStreamUrl || video.src || video.currentSrc;
      if (!downloadTarget || downloadTarget.startsWith('blob:')) {
        // Fallback trace to look for media page sources
        const sourceTag = video.querySelector('source');
        if (sourceTag && sourceTag.src) {
          triggerUpload(sourceTag.src, bar);
        } else {
          bar.innerText = "⚠ Stream URL Lost";
          setTimeout(() => { bar.innerHTML = `<span>📥</span> Save Video to WebDAV`; }, 2000);
        }
        return;
      }

      triggerUpload(downloadTarget, bar);
    });

    // Make sure container has a position boundary context
    if (window.getComputedStyle(parent).position === "static") {
      parent.style.position = "relative";
    }
    parent.appendChild(bar);
  });
}

function triggerUpload(url, element) {
  element.innerText = "⏳ Uploading to Koofr...";
  element.style.backgroundColor = "#ffb300";

  chrome.runtime.sendMessage({ type: "UPLOAD_TO_WEBDAV", videoUrl: url }, (response) => {
    if (response && response.success) {
      element.innerText = "✅ Saved Successfully!";
      element.style.backgroundColor = "#4caf50";
      setTimeout(() => { 
        element.innerHTML = `<span>📥</span> Save Video to WebDAV`; 
        element.style.backgroundColor = "#1e88e5"; 
      }, 4000);
    } else {
      element.innerText = "❌ Upload Error";
      element.style.backgroundColor = "#f44336";
      setTimeout(() => { 
        element.innerHTML = `<span>📥</span> Save Video to WebDAV`; 
        element.style.backgroundColor = "#1e88e5"; 
      }, 4000);
    }
  });
}

// Aggressive DOM scraping to ensure dynamically rendered pages get the button
setInterval(injectFloatingButton, 1500);
