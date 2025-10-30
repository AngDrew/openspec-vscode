(function() {
  'use strict';

  // Click handler for section headers and task toggles
  document.addEventListener('click', function(event) {
    // Handle section header clicks
    const sectionHeader = event.target.closest('.section-header');
    if (sectionHeader) {
      event.preventDefault();
      toggleSection(sectionHeader);
      return;
    }
    
    // Handle file toggle buttons
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
      return;
    }
    
    // Handle task toggle clicks
    const taskToggle = event.target.closest('.task-toggle');
    if (taskToggle) {
      event.preventDefault();
      toggleTask(taskToggle);
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
  
  // Toggle function for tasks
  function toggleTask(toggleButton) {
    const taskItem = toggleButton.closest('.task-item');
    const taskId = taskItem.dataset.taskId;
    const childrenId = `${taskId}-children`;
    const childrenContainer = document.getElementById(childrenId);
    const isExpanded = toggleButton.getAttribute('aria-expanded') === 'true';
    
    if (isExpanded) {
      // Collapse task
      toggleButton.setAttribute('aria-expanded', 'false');
      toggleButton.textContent = '▶';
      if (childrenContainer) {
        childrenContainer.classList.add('collapsed');
      }
      taskStates.set(taskId, false);
    } else {
      // Expand task
      toggleButton.setAttribute('aria-expanded', 'true');
      toggleButton.textContent = '▼';
      if (childrenContainer) {
        childrenContainer.classList.remove('collapsed');
      }
      taskStates.set(taskId, true);
    }
  }
  
  // Store section and task states for session persistence
  const sectionStates = new Map();
  const taskStates = new Map();

  // Handle task checkbox interactions (read-only)
  document.addEventListener('change', function(event) {
    if (event.target.type === 'checkbox') {
      event.preventDefault();
      return false;
    }
  });

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
        toggleSection(target);
        return;
      }
      
      // Handle task toggles
      if (target.classList.contains('task-toggle')) {
        event.preventDefault();
        toggleTask(target);
        return;
      }
    }
    
    // Handle arrow navigation for sections
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (target.classList.contains('section-header') || target.classList.contains('task-toggle')) {
        event.preventDefault();
        const isDown = event.key === 'ArrowDown';
        navigateToNextCollapsible(target, isDown);
        return;
      }
    }
  });
  
  // Navigate to next/previous collapsible element
  function navigateToNextCollapsible(currentElement, goForward) {
    const collapsibles = Array.from(document.querySelectorAll('.section-header, .task-toggle'));
    const currentIndex = collapsibles.indexOf(currentElement);
    
    let nextIndex;
    if (goForward) {
      nextIndex = (currentIndex + 1) % collapsibles.length;
    } else {
      nextIndex = currentIndex === 0 ? collapsibles.length - 1 : currentIndex - 1;
    }
    
    collapsibles[nextIndex].focus();
  }

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