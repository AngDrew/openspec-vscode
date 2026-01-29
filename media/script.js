(function() {
  'use strict';

  const OPENCODE_STATUS_POLL_MS = 2000;
  const OPENSPEC_TASKS_POLL_MS = 2000;

  // Click handler for section headers and task toggles
  document.addEventListener('click', function(event) {
    const openFileButton = event.target.closest('[data-open-file]');
    if (openFileButton) {
      event.preventDefault();
      const filepath = openFileButton.getAttribute('data-open-file');
      if (filepath) {
        vscode.postMessage({
          type: 'openFile',
          filepath,
          preview: true
        });
      }
      return;
    }

    const attachButton = event.target.closest('[data-opencode-attach]');
    if (attachButton) {
      event.preventDefault();
      const url = attachButton.getAttribute('data-opencode-attach') || 'http://localhost:4099';
      vscode.postMessage({
        type: 'opencodeAttachClicked',
        url
      });
      return;
    }

    const openCodeDot = event.target.closest('.opencode-dot');
    if (openCodeDot) {
      event.preventDefault();
      const status = openCodeDot.getAttribute('data-opencode-status');
      vscode.postMessage({
        type: 'opencodeDotClicked',
        status
      });
      return;
    }

    const openCodeStartButton = event.target.closest('[data-opencode-start]');
    if (openCodeStartButton) {
      event.preventDefault();
      const isDisabled = openCodeStartButton.disabled || openCodeStartButton.getAttribute('aria-disabled') === 'true';
      if (!isDisabled) {
        vscode.postMessage({
          type: 'opencodeStartClicked'
        });
      }
      return;
    }

    // Handle file section headers FIRST (they have both section-header and file-header classes)
    const fileHeader = event.target.closest('.file-header');
    if (fileHeader) {
      event.preventDefault();
      toggleFileSection(fileHeader);
      return;
    }

    // Handle general section header clicks
    const sectionHeader = event.target.closest('.section-header');
    if (sectionHeader) {
      event.preventDefault();
      toggleSection(sectionHeader);
      return;
    }


  });
  
  // Toggle function for sections
  function toggleSection(headerButton) {
    const section = headerButton.closest('.collapsible-section');
    const contentId = headerButton.getAttribute('aria-controls');
    const content = section.querySelector(`#${contentId}`);
    const isExpanded = headerButton.getAttribute('aria-expanded') === 'true';
    
    if (isExpanded) {
      // Collapse section
      headerButton.setAttribute('aria-expanded', 'false');
      content.classList.add('collapsed');
      sectionStates.set(headerButton.parentElement.dataset.section, false);
    } else {
      // Expand section
      headerButton.setAttribute('aria-expanded', 'true');
      content.classList.remove('collapsed');
      sectionStates.set(headerButton.parentElement.dataset.section, true);
    }
  }
  
  // Toggle function for file sections
  function toggleFileSection(headerButton) {
    const section = headerButton.closest('.collapsible-section');
    const contentId = headerButton.getAttribute('aria-controls');
    const content = section.querySelector(`#${contentId}`);
    const isExpanded = headerButton.getAttribute('aria-expanded') === 'true';
    const filePath = headerButton.dataset.filepath;
    
    if (isExpanded) {
      // Collapse section
      headerButton.setAttribute('aria-expanded', 'false');
      content.classList.add('collapsed');
      content.setAttribute('hidden', '');
      const expandIcon = headerButton.querySelector('.collapse-icon');
      expandIcon.textContent = '▶';
    } else {
      // Expand section
      headerButton.setAttribute('aria-expanded', 'true');
      content.classList.remove('collapsed');
      content.removeAttribute('hidden');
      const expandIcon = headerButton.querySelector('.collapse-icon');
      expandIcon.textContent = '▼';
      
      // Load content if not already loaded
      if (filePath && !content.dataset.loaded) {
        vscode.postMessage({
          type: 'loadFileContent',
          filepath: filePath
        });
      }
    }
  }
  

  
  // Store section states for session persistence
  const sectionStates = new Map();



  // Add keyboard navigation
  document.addEventListener('keydown', function(event) {
    const target = event.target;
    
    // Escape key closes the webview
    if (event.key === 'Escape') {
      vscode.postMessage({
        type: 'close'
      });
      return;
    }
    
    // Ctrl/Cmd + P focuses the search (if implemented)
    if ((event.ctrlKey || event.metaKey) && event.key === 'p') {
      event.preventDefault();
      vscode.postMessage({
        type: 'focusSearch'
      });
      return;
    }
    
    // Handle Enter or Space for collapsible elements
    if (event.key === 'Enter' || event.key === ' ') {
      // Handle section headers
      if (target.classList.contains('section-header')) {
        event.preventDefault();
        if (target.classList.contains('file-header')) {
          toggleFileSection(target);
        } else {
          toggleSection(target);
        }
        return;
      }
      

    }
    
    // Handle arrow navigation for sections
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (target.classList.contains('section-header')) {
        event.preventDefault();
        const isDown = event.key === 'ArrowDown';
        navigateToNextCollapsible(target, isDown);
        return;
      }
    }
  });
  
  // Navigate to next/previous collapsible element
  function navigateToNextCollapsible(currentElement, goForward) {
    const collapsibles = Array.from(document.querySelectorAll('.section-header'));
    const currentIndex = collapsibles.indexOf(currentElement);
    
    let nextIndex;
    if (goForward) {
      nextIndex = (currentIndex + 1) % collapsibles.length;
    } else {
      nextIndex = currentIndex === 0 ? collapsibles.length - 1 : currentIndex - 1;
    }
    
    collapsibles[nextIndex].focus();
  }

  // Initialize tooltips and link handling for better UX
  function initializeEnhancements() {
    const badges = document.querySelectorAll('.badge');
    badges.forEach(badge => {
      if (badge.classList.contains('active')) {
        badge.title = 'This change is currently in progress';
      } else if (badge.classList.contains('completed')) {
        badge.title = 'This change has been completed and archived';
      }
    });

    const specLinks = document.querySelectorAll('.spec-link');
    specLinks.forEach(link => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        const filepath = link.getAttribute('data-filepath');
        if (filepath) {
          vscode.postMessage({
            type: 'openFile',
            filepath
          });
        }
      });
    });
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeEnhancements);
  } else {
    initializeEnhancements();
  }

  // Handle messages from VS Code extension
  window.addEventListener('message', function(event) {
    const message = event.data;
    
    if (message.type === 'fileContentLoaded') {
      // Find the content div for this file - escape special characters in filepath
      const escapedPath = message.filepath.replace(/["\\]/g, '\\$&');
      const headerButton = document.querySelector(`[data-filepath="${escapedPath}"]`);
      if (headerButton) {
        const contentId = headerButton.getAttribute('aria-controls');
        const contentDiv = document.getElementById(contentId);
        if (contentDiv) {
          if (message.fileType === 'markdown') {
            contentDiv.innerHTML = message.content;
            contentDiv.classList.add('markdown-content');
          } else {
            contentDiv.innerHTML = `<pre class="file-preview"><code>${message.content}</code></pre>`;
          }
          contentDiv.dataset.loaded = 'true';
        }
      }

      maybeUpdateArtifactBodyFromFileContent(message);
    } else if (message.type === 'fileContentError') {
      // Find the content div for this file - escape special characters in filepath
      const escapedPath = message.filepath.replace(/["\\]/g, '\\$&');
      const headerButton = document.querySelector(`[data-filepath="${escapedPath}"]`);
      if (headerButton) {
        const contentId = headerButton.getAttribute('aria-controls');
        const contentDiv = document.getElementById(contentId);
        if (contentDiv) {
          contentDiv.innerHTML = `<div class="error-message">Error loading file: ${message.error}</div>`;
          contentDiv.dataset.loaded = 'true';
        }
      }
    } else if (message.type === 'themeChanged') {
      // Update CSS custom properties if needed
      document.documentElement.style.setProperty('--vscode-foreground', message.foreground);
      document.documentElement.style.setProperty('--vscode-background', message.background);
      // Add other theme properties as needed
    } else if (message.type === 'opencodeStatusResponse') {
      updateOpenCodeDotFromStatus(message);
    }
  });

  function maybeUpdateArtifactBodyFromFileContent(message) {
    const filepath = typeof message.filepath === 'string' ? message.filepath : '';
    if (!filepath) return;

    const escapedPath = filepath.replace(/["\\]/g, '\\$&');
    const container = document.querySelector(`[data-openspec-artifact-file="${escapedPath}"]`);
    if (!container) return;

    const body = container.querySelector('[data-openspec-artifact-body]');
    if (!body) return;

    const nextHtml = typeof message.content === 'string' ? message.content : '';
    if (!nextHtml) return;

    if (body.innerHTML !== nextHtml) {
      body.innerHTML = nextHtml;
    }
  }

  function requestTasksRefresh() {
    if (document.visibilityState === 'hidden') return;

    const tasksContainer = document.querySelector('[data-openspec-artifact-file]#tasks-content');
    if (!tasksContainer) return;

    const filepath = tasksContainer.getAttribute('data-openspec-artifact-file');
    if (!filepath) return;

    vscode.postMessage({
      type: 'loadFileContent',
      filepath
    });
  }

  function updateOpenCodeDotFromStatus(message) {
    const dot = document.querySelector('.opencode-dot');
    if (!dot) return;

    const isListening = !!message.isListening;
    dot.classList.toggle('is-started', isListening);
    dot.classList.toggle('is-stopped', !isListening);

    const tooltip = isListening ? 'OpenCode started' : 'OpenCode not started';
    dot.setAttribute('data-opencode-status', isListening ? 'started' : 'stopped');
    dot.setAttribute('title', tooltip);
    dot.setAttribute('aria-label', tooltip);

    const startButton = document.querySelector('[data-opencode-start]');
    if (startButton) {
      startButton.textContent = isListening ? 'OpenCode Running' : 'Start OpenCode';
      startButton.disabled = isListening;
      startButton.setAttribute('aria-disabled', isListening ? 'true' : 'false');
      const startTooltip = isListening
        ? 'OpenCode already started'
        : 'Start OpenCode server on port 4099';
      startButton.setAttribute('title', startTooltip);
      startButton.setAttribute('aria-label', startTooltip);
    }
  }

  function requestOpenCodeStatus() {
    vscode.postMessage({
      type: 'opencodeStatusRequest'
    });
  }

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

  // Periodically refresh OpenCode listening state
  requestOpenCodeStatus();
  setInterval(requestOpenCodeStatus, OPENCODE_STATUS_POLL_MS);

  // Periodically refresh tasks content so the webview reflects runner progress
  requestTasksRefresh();
  setInterval(requestTasksRefresh, OPENSPEC_TASKS_POLL_MS);

})();
