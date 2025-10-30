(function() {
  'use strict';

  // Click handler for file toggle buttons
  document.addEventListener('click', function(event) {
    const fileToggle = event.target.closest('.file-toggle');
    if (fileToggle) {
      event.preventDefault();
      const contentDiv = fileToggle.nextElementSibling;
      const expandIcon = fileToggle.querySelector('.expand-icon');
      
      if (contentDiv.hasAttribute('hidden')) {
        // Request content if not loaded
        if (!contentDiv.dataset.loaded) {
          vscode.postMessage({
            type: 'loadFileContent',
            filepath: fileToggle.dataset.filepath
          });
        }
        contentDiv.removeAttribute('hidden');
        fileToggle.setAttribute('aria-expanded', 'true');
        expandIcon.textContent = '▼';
      } else {
        contentDiv.setAttribute('hidden', '');
        fileToggle.setAttribute('aria-expanded', 'false');
        expandIcon.textContent = '▶';
      }
    }
  });

  // Handle task checkbox interactions (read-only)
  document.addEventListener('change', function(event) {
    if (event.target.type === 'checkbox') {
      event.preventDefault();
      return false;
    }
  });

  // Add keyboard navigation
  document.addEventListener('keydown', function(event) {
    // Escape key closes the webview
    if (event.key === 'Escape') {
      vscode.postMessage({
        type: 'close'
      });
    }
    
    // Ctrl/Cmd + P focuses the search (if implemented)
    if ((event.ctrlKey || event.metaKey) && event.key === 'p') {
      event.preventDefault();
      vscode.postMessage({
        type: 'focusSearch'
      });
    }
  });

  // Initialize tooltips for better UX
  function initializeTooltips() {
    const fileToggles = document.querySelectorAll('.file-toggle');
    fileToggles.forEach(toggle => {
      toggle.title = 'Click to expand/collapse file preview';
    });

    const badges = document.querySelectorAll('.badge');
    badges.forEach(badge => {
      if (badge.classList.contains('active')) {
        badge.title = 'This change is currently in progress';
      } else if (badge.classList.contains('completed')) {
        badge.title = 'This change has been completed and archived';
      }
    });
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeTooltips);
  } else {
    initializeTooltips();
  }

  // Handle messages from VS Code extension
  window.addEventListener('message', function(event) {
    const message = event.data;
    
    if (message.type === 'fileContentLoaded') {
      // Find the content div for this file - escape special characters in filepath
      const escapedPath = message.filepath.replace(/["\\]/g, '\\$&');
      const contentDiv = document.querySelector(`[data-filepath="${escapedPath}"] + .file-content`);
      if (contentDiv) {
        contentDiv.innerHTML = `<pre class="file-preview">${message.content}</pre>`;
        contentDiv.dataset.loaded = 'true';
      }
    } else if (message.type === 'fileContentError') {
      // Find the content div for this file - escape special characters in filepath
      const escapedPath = message.filepath.replace(/["\\]/g, '\\$&');
      const contentDiv = document.querySelector(`[data-filepath="${escapedPath}"] + .file-content`);
      if (contentDiv) {
        contentDiv.innerHTML = `<div class="error-message">Error loading file: ${message.error}</div>`;
        contentDiv.dataset.loaded = 'true';
      }
    } else if (message.type === 'themeChanged') {
      // Update CSS custom properties if needed
      document.documentElement.style.setProperty('--vscode-foreground', message.foreground);
      document.documentElement.style.setProperty('--vscode-background', message.background);
      // Add other theme properties as needed
    }
  });

  // Smooth scroll for anchor links
  document.addEventListener('click', function(event) {
    const anchor = event.target.closest('a[href^="#"]:not(.file-toggle)');
    if (anchor) {
      event.preventDefault();
      const targetId = anchor.getAttribute('href').substring(1);
      const targetElement = document.getElementById(targetId);
      
      if (targetElement) {
        targetElement.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }
    }
  });

  // Add loading state for external resources
  function showLoadingState() {
    const container = document.querySelector('.container');
    if (container) {
      container.style.opacity = '0.7';
      container.style.pointerEvents = 'none';
    }
  }

  function hideLoadingState() {
    const container = document.querySelector('.container');
    if (container) {
      container.style.opacity = '1';
      container.style.pointerEvents = 'auto';
    }
  }

  // Initialize VS Code API
  const vscode = acquireVsCodeApi();

})();