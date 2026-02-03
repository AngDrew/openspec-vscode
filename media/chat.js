(function() {
  const vscode = acquireVsCodeApi();

  // DOM Elements
  const messagesContainer = document.getElementById('messagesContainer');
  const messageInput = document.getElementById('messageInput');
  const sendBtn = document.getElementById('sendBtn');
  const clearBtn = document.getElementById('clearBtn');
  const emptyState = document.getElementById('emptyState');
  const typingIndicator = document.getElementById('typingIndicator');
  const cancelBtn = document.getElementById('cancelBtn');
  const toolCallsPanel = document.getElementById('toolCallsPanel');
  const toolCallsHeader = document.getElementById('toolCallsHeader');
  const toolCallsToggle = document.getElementById('toolCallsToggle');
  const toolCallsContent = document.getElementById('toolCallsContent');
  const toolCallsList = document.getElementById('toolCallsList');
  const toolCallsEmpty = document.getElementById('toolCallsEmpty');
  const toolCallsCount = document.getElementById('toolCallsCount');
  const phaseTracker = document.getElementById('phaseTracker');
  const phaseTrackerContainer = document.getElementById('phaseTrackerContainer');
  const connectionErrorBanner = document.getElementById('connectionErrorBanner');
  const connectionErrorMessage = document.getElementById('connectionErrorMessage');
  const connectionErrorRetryBtn = document.getElementById('connectionErrorRetryBtn');
  const connectionErrorCloseBtn = document.getElementById('connectionErrorCloseBtn');
  const offlineIndicatorBanner = document.getElementById('offlineIndicatorBanner');
  const offlineIndicatorMessage = document.getElementById('offlineIndicatorMessage');
  const offlineIndicatorCount = document.getElementById('offlineIndicatorCount');
  const offlineIndicatorCloseBtn = document.getElementById('offlineIndicatorCloseBtn');

  // State
  let messages = [];
  let isUserScrolling = false;
  let scrollTimeout = null;
  let isStreaming = false;
  let toolCalls = [];
  let isToolCallsCollapsed = false;
  let currentPhases = [];
  let currentPhaseId = null;

  // Throttling state for performance optimization
  let pendingUpdate = null;
  let updateTimeout = null;
  let updateRafId = null;
  const UPDATE_THROTTLE_MS = 50; // Throttle updates to max 20fps during streaming

  // Streaming optimization state
  let streamingState = {
    isActive: false,
    lastContent: '',
    lastUpdateTime: 0,
    updateCount: 0,
    skippedUpdates: 0,
    batchSize: 0
  };
  const STREAMING_BATCH_SIZE = 100; // Characters to batch before updating
  const STREAMING_MAX_UPDATES_PER_SECOND = 15; // Limit updates during streaming

  // Virtual scrolling state
  let virtualScrollState = {
    enabled: false,
    itemHeight: 80, // Estimated average message height
    bufferSize: 5, // Number of items to render above/below viewport
    visibleStart: 0,
    visibleEnd: 0,
    totalHeight: 0,
    scrollTop: 0
  };
  const VIRTUAL_SCROLL_THRESHOLD = 50; // Enable virtual scrolling after 50 messages

  // Script output state
  let scriptOutputLines = [];
  let scriptOutputContainer = null;

  // Initialize
  function init() {
    setupEventListeners();
    requestSessionData();
    focusInput();
    createScriptOutputContainer();
  }

  // Create script output container
  function createScriptOutputContainer() {
    scriptOutputContainer = document.createElement('div');
    scriptOutputContainer.className = 'script-output-container collapsed';
    scriptOutputContainer.id = 'scriptOutputContainer';

    const header = document.createElement('div');
    header.className = 'script-output-header';
    header.innerHTML = `
      <span class="script-output-title">Script Output</span>
      <span class="script-output-status" id="scriptOutputStatus">Idle</span>
      <span class="script-output-toggle">▶</span>
    `;
    header.addEventListener('click', toggleScriptOutputPanel);

    const content = document.createElement('div');
    content.className = 'script-output-content';
    content.id = 'scriptOutputContent';

    const outputList = document.createElement('div');
    outputList.className = 'script-output-list';
    outputList.id = 'scriptOutputList';

    content.appendChild(outputList);
    scriptOutputContainer.appendChild(header);
    scriptOutputContainer.appendChild(content);

    // Insert after tool calls panel
    const toolCallsPanel = document.getElementById('toolCallsPanel');
    if (toolCallsPanel && toolCallsPanel.parentNode) {
      toolCallsPanel.parentNode.insertBefore(scriptOutputContainer, toolCallsPanel.nextSibling);
    } else {
      // Fallback: insert after messages container
      const messagesContainer = document.getElementById('messagesContainer');
      if (messagesContainer && messagesContainer.parentNode) {
        messagesContainer.parentNode.insertBefore(scriptOutputContainer, messagesContainer);
      }
    }
  }

  // Toggle script output panel
  function toggleScriptOutputPanel() {
    if (!scriptOutputContainer) return;
    scriptOutputContainer.classList.toggle('collapsed');
    const toggle = scriptOutputContainer.querySelector('.script-output-toggle');
    if (toggle) {
      toggle.textContent = scriptOutputContainer.classList.contains('collapsed') ? '▶' : '▼';
    }
  }

  // Add script output line
  function addScriptOutput(output) {
    if (!scriptOutputContainer) {
      createScriptOutputContainer();
    }

    scriptOutputLines.push(output);

    const outputList = document.getElementById('scriptOutputList');
    if (!outputList) return;

    const lineEl = document.createElement('div');
    lineEl.className = `script-output-line script-output-${output.type}`;

    const timestamp = document.createElement('span');
    timestamp.className = 'script-output-timestamp';
    timestamp.textContent = formatTimestamp(output.timestamp);

    const content = document.createElement('span');
    content.className = 'script-output-text';
    content.textContent = output.content;

    lineEl.appendChild(timestamp);
    lineEl.appendChild(content);
    outputList.appendChild(lineEl);

    // Auto-scroll to bottom
    const contentContainer = document.getElementById('scriptOutputContent');
    if (contentContainer) {
      contentContainer.scrollTop = contentContainer.scrollHeight;
    }

    // Auto-expand on first output
    if (scriptOutputLines.length === 1) {
      scriptOutputContainer.classList.remove('collapsed');
      const toggle = scriptOutputContainer.querySelector('.script-output-toggle');
      if (toggle) {
        toggle.textContent = '▼';
      }
    }
  }

  // Update script execution status
  function updateScriptExecutionStatus(status, message) {
    const statusEl = document.getElementById('scriptOutputStatus');
    if (!statusEl) return;

    statusEl.className = `script-output-status script-output-status-${status}`;
    statusEl.textContent = message || status;

    // Auto-expand when running
    if (status === 'running' && scriptOutputContainer) {
      scriptOutputContainer.classList.remove('collapsed');
      const toggle = scriptOutputContainer.querySelector('.script-output-toggle');
      if (toggle) {
        toggle.textContent = '▼';
      }
    }
  }

  // Clear script output
  function clearScriptOutput() {
    scriptOutputLines = [];
    const outputList = document.getElementById('scriptOutputList');
    if (outputList) {
      outputList.innerHTML = '';
    }
    updateScriptExecutionStatus('idle', 'Idle');
  }

  // Setup event listeners
  function setupEventListeners() {
    // Send button click
    sendBtn.addEventListener('click', sendMessage);

    // Enter key in textarea (but allow Shift+Enter for new line)
    messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    // Auto-resize textarea on input
    messageInput.addEventListener('input', adjustTextareaHeight);

    // Clear button
    clearBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'clearChat' });
    });

    // Cancel button
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'cancelStreaming' });
      });
    }

    // Listen for messages from extension
    window.addEventListener('message', handleExtensionMessage);

    // Track user scrolling to prevent auto-scroll when user is reading history
    messagesContainer.addEventListener('scroll', handleScroll);

    // Tool calls panel toggle
    if (toolCallsHeader) {
      toolCallsHeader.addEventListener('click', toggleToolCallsPanel);
    }

    // Phase tracker click handlers
    if (phaseTrackerContainer) {
      const phaseItems = phaseTrackerContainer.querySelectorAll('.phase-item');
      phaseItems.forEach(item => {
        item.addEventListener('click', () => {
          const phaseId = item.getAttribute('data-phase');
          if (phaseId) {
            vscode.postMessage({
              type: 'phaseClicked',
              phaseId: phaseId
            });
          }
        });
      });
    }

    // Action buttons click handlers
    const actionButtons = document.getElementById('actionButtons');
    if (actionButtons) {
      const actionBtns = actionButtons.querySelectorAll('.action-btn');
      actionBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          const action = btn.getAttribute('data-action');
          if (action) {
            switch (action) {
              case 'newChange':
                vscode.postMessage({ type: 'newChange' });
                break;
              case 'fastForward':
                vscode.postMessage({ type: 'fastForward' });
                break;
              case 'apply':
                vscode.postMessage({ type: 'apply' });
                break;
              case 'archive':
                vscode.postMessage({ type: 'archive' });
                break;
            }
          }
        });
      });
    }

    // Connection error banner handlers
    if (connectionErrorRetryBtn) {
      connectionErrorRetryBtn.addEventListener('click', handleConnectionRetry);
    }
    if (connectionErrorCloseBtn) {
      connectionErrorCloseBtn.addEventListener('click', hideConnectionError);
    }
  }

  // Handle connection retry button click
  function handleConnectionRetry() {
    if (connectionErrorRetryBtn) {
      connectionErrorRetryBtn.classList.add('retrying');
      connectionErrorRetryBtn.disabled = true;
    }

    vscode.postMessage({
      type: 'retryConnection'
    });

    // Reset button state after a delay (will be updated by extension response)
    setTimeout(() => {
      if (connectionErrorRetryBtn) {
        connectionErrorRetryBtn.classList.remove('retrying');
        connectionErrorRetryBtn.disabled = false;
      }
    }, 3000);
  }

  // Show connection error banner
  function showConnectionError(error, canRetry = true) {
    if (!connectionErrorBanner || !connectionErrorMessage) {
      console.error('Connection error elements not found');
      return;
    }

    connectionErrorMessage.textContent = error;
    connectionErrorBanner.style.display = 'flex';

    if (connectionErrorRetryBtn) {
      connectionErrorRetryBtn.style.display = canRetry ? 'flex' : 'none';
    }
  }

  // Hide connection error banner
  function hideConnectionError() {
    if (connectionErrorBanner) {
      connectionErrorBanner.style.display = 'none';
    }
  }

  // Show offline indicator banner
  function showOfflineIndicator(pendingCount = 0, offlineSince = null) {
    if (!offlineIndicatorBanner) {
      return;
    }

    offlineIndicatorBanner.style.display = 'flex';

    if (offlineIndicatorCount) {
      if (pendingCount > 0) {
        offlineIndicatorCount.textContent = `(${pendingCount} pending)`;
      } else {
        offlineIndicatorCount.textContent = '';
      }
    }

    if (offlineIndicatorMessage && offlineSince) {
      const offlineDuration = Math.floor((Date.now() - offlineSince) / 1000);
      const minutes = Math.floor(offlineDuration / 60);
      const seconds = offlineDuration % 60;
      const durationStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
      offlineIndicatorMessage.textContent = `Offline for ${durationStr}. Messages are queued and will be sent when connection is restored.`;
    }

    // Add click handler to close button
    if (offlineIndicatorCloseBtn) {
      offlineIndicatorCloseBtn.onclick = hideOfflineIndicator;
    }
  }

  // Hide offline indicator banner
  function hideOfflineIndicator() {
    if (offlineIndicatorBanner) {
      offlineIndicatorBanner.style.display = 'none';
    }
  }

  // Toggle tool calls panel collapsed state
  function toggleToolCallsPanel() {
    if (!toolCallsPanel) {
      return;
    }

    isToolCallsCollapsed = !isToolCallsCollapsed;
    toolCallsPanel.classList.toggle('collapsed', isToolCallsCollapsed);

    // Update toggle icon
    if (toolCallsToggle) {
      toolCallsToggle.textContent = isToolCallsCollapsed ? '▶' : '▼';
    }
  }

  // Add a tool call to the panel
  function addToolCall(toolCall) {
    if (!toolCallsList || !toolCallsEmpty || !toolCallsCount) {
      return;
    }

    toolCalls.push(toolCall);
    updateToolCallsCount();

    // Hide empty state
    toolCallsEmpty.style.display = 'none';

    // Create tool call element
    const toolCallEl = createToolCallElement(toolCall);
    toolCallsList.appendChild(toolCallEl);

    // Auto-expand panel on first tool call
    if (toolCalls.length === 1 && isToolCallsCollapsed) {
      toggleToolCallsPanel();
    }
  }

  // Update tool call status
  function updateToolCallStatus(toolCallId, status, result) {
    const toolCallIndex = toolCalls.findIndex(tc => tc.id === toolCallId);
    if (toolCallIndex === -1) {
      return;
    }

    toolCalls[toolCallIndex].status = status;
    if (result !== undefined) {
      toolCalls[toolCallIndex].result = result;
    }

    // Update UI
    const toolCallEl = document.getElementById(`toolcall-${toolCallId}`);
    if (toolCallEl) {
      const statusEl = toolCallEl.querySelector('.tool-call-status');
      if (statusEl) {
        statusEl.className = `tool-call-status ${status}`;
      }

      // Add or update result details
      let resultDetails = toolCallEl.querySelector('.tool-call-result');
      if (status === 'completed' && result !== undefined) {
        if (!resultDetails) {
          resultDetails = document.createElement('details');
          resultDetails.className = 'tool-call-details tool-call-result';
          toolCallEl.appendChild(resultDetails);
        }
        resultDetails.style.display = 'block';
        resultDetails.innerHTML = `<summary>Result</summary><pre>${escapeHtml(JSON.stringify(result, null, 2))}</pre>`;
      } else if (status === 'failed' && result !== undefined) {
        if (!resultDetails) {
          resultDetails = document.createElement('details');
          resultDetails.className = 'tool-call-details tool-call-result';
          toolCallEl.appendChild(resultDetails);
        }
        resultDetails.style.display = 'block';
        resultDetails.innerHTML = `<summary>Error</summary><pre class="error-result">${escapeHtml(JSON.stringify(result, null, 2))}</pre>`;
      }
    }
  }

  // Create tool call element
  function createToolCallElement(toolCall) {
    const el = document.createElement('div');
    el.id = `toolcall-${toolCall.id}`;
    el.className = 'tool-call-item';

    // Create header row with status, name, and time
    const header = document.createElement('div');
    header.className = 'tool-call-header';

    const status = document.createElement('span');
    status.className = `tool-call-status ${toolCall.status || 'pending'}`;

    const name = document.createElement('span');
    name.className = 'tool-call-name';
    name.textContent = toolCall.name;

    const time = document.createElement('span');
    time.className = 'tool-call-time';
    time.textContent = formatTimestamp(toolCall.timestamp);

    header.appendChild(status);
    header.appendChild(name);
    header.appendChild(time);
    el.appendChild(header);

    // Add parameters details in expandable section
    if (toolCall.parameters) {
      const details = document.createElement('details');
      details.className = 'tool-call-details';
      details.innerHTML = `<summary>Parameters</summary><pre>${escapeHtml(JSON.stringify(toolCall.parameters, null, 2))}</pre>`;
      el.appendChild(details);
    }

    // Add placeholder for result details (will be populated when completed)
    const resultDetails = document.createElement('details');
    resultDetails.id = `toolcall-result-${toolCall.id}`;
    resultDetails.className = 'tool-call-details tool-call-result';
    resultDetails.style.display = 'none';
    el.appendChild(resultDetails);

    return el;
  }

  // Update tool calls count badge
  function updateToolCallsCount() {
    if (toolCallsCount) {
      const count = toolCalls.length;
      toolCallsCount.textContent = count > 0 ? count.toString() : '';
      toolCallsCount.setAttribute('data-count', count.toString());
    }
  }

  // Clear tool calls
  function clearToolCalls() {
    toolCalls = [];
    if (toolCallsList) {
      toolCallsList.innerHTML = '';
    }
    if (toolCallsEmpty) {
      toolCallsEmpty.style.display = 'block';
    }
    updateToolCallsCount();
  }

  // Update phase tracker with new phase data
  function updatePhaseTracker(phases) {
    if (!phases || !Array.isArray(phases)) {
      return;
    }

    currentPhases = phases;

    if (!phaseTrackerContainer) {
      return;
    }

    phases.forEach(phase => {
      const phaseEl = phaseTrackerContainer.querySelector(`[data-phase="${phase.id}"]`);
      if (phaseEl) {
        phaseEl.setAttribute('data-status', phase.status);
      }
    });
  }

  // Set the current active phase
  function setCurrentPhase(phaseId) {
    currentPhaseId = phaseId;

    if (!phaseTrackerContainer) {
      return;
    }

    // Reset all phases to pending first
    const allPhases = phaseTrackerContainer.querySelectorAll('.phase-item');
    allPhases.forEach(phaseEl => {
      phaseEl.setAttribute('data-status', 'pending');
    });

    // Update phases based on current phase
    const phaseOrder = ['new', 'drafting', 'implementation'];
    const currentIndex = phaseOrder.indexOf(phaseId);

    if (currentIndex === -1) {
      return;
    }

    // Mark previous phases as completed
    for (let i = 0; i < currentIndex; i++) {
      const phaseEl = phaseTrackerContainer.querySelector(`[data-phase="${phaseOrder[i]}"]`);
      if (phaseEl) {
        phaseEl.setAttribute('data-status', 'completed');
      }
    }

    // Mark current phase as active
    const currentPhaseEl = phaseTrackerContainer.querySelector(`[data-phase="${phaseId}"]`);
    if (currentPhaseEl) {
      currentPhaseEl.setAttribute('data-status', 'active');
    }
  }

  // Handle scroll events to detect user scrolling
  function handleScroll() {
    isUserScrolling = true;

    // Clear existing timeout
    if (scrollTimeout) {
      clearTimeout(scrollTimeout);
    }

    // Reset after scroll stops
    scrollTimeout = setTimeout(() => {
      isUserScrolling = false;
    }, 150);
  }

  // Check if user is near bottom (within 100px)
  function isNearBottom() {
    const threshold = 100;
    const position = messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight;
    return position <= threshold;
  }

  // Handle messages from extension
  function handleExtensionMessage(event) {
    const message = event.data;

    switch (message.type) {
      case 'addMessage':
        addMessageToUI(message.message);
        focusInput();
        break;
      case 'updateMessage':
        updateMessageInUI(message.messageId, message.content, message.isStreaming);
        break;
      case 'clearChat':
        clearMessages();
        focusInput();
        break;
      case 'sessionData':
        loadSessionData(message.session);
        focusInput();
        break;
      case 'error':
        showEnhancedError(message.message, message.retryable, message.retryAction);
        focusInput();
        break;
      case 'connectionError':
        showConnectionError(message.error, message.canRetry);
        break;
      case 'connectionErrorResolved':
        hideConnectionError();
        break;
      case 'focusInput':
        focusInput();
        break;
      case 'showTypingIndicator':
        showTypingIndicator();
        break;
      case 'hideTypingIndicator':
        hideTypingIndicator();
        break;
      case 'streamingState':
        isStreaming = message.isStreaming;
        if (isStreaming) {
          showTypingIndicator();
        } else {
          hideTypingIndicator();
        }
        break;
      case 'streamingCancelled':
        isStreaming = false;
        hideTypingIndicator();
        if (message.messageId) {
          markMessageAsPartial(message.messageId, message.partialContent);
        }
        break;
      case 'addToolCall':
        addToolCall(message.toolCall);
        break;
      case 'updateToolCall':
        updateToolCallStatus(message.toolCallId, message.status, message.result);
        break;
      case 'clearToolCalls':
        clearToolCalls();
        break;
      case 'updatePhaseTracker':
        updatePhaseTracker(message.phases);
        break;
      case 'setCurrentPhase':
        setCurrentPhase(message.phaseId);
        break;
      case 'displayArtifact':
        displayArtifact(message.artifact);
        break;
      case 'offlineState':
        if (message.isOffline) {
          showOfflineIndicator(message.pendingMessageCount, message.offlineSince);
        } else {
          hideOfflineIndicator();
          if (message.pendingMessageCount > 0) {
            showSystemMessage(`Connection restored. ${message.pendingMessageCount} queued message(s) sent.`);
          }
        }
        break;
      case 'showOfflineIndicator':
        showOfflineIndicator();
        break;
      case 'hideOfflineIndicator':
        hideOfflineIndicator();
        break;
      case 'scriptOutput':
        addScriptOutput(message.output);
        break;
      case 'scriptExecutionStatus':
        updateScriptExecutionStatus(message.status, message.message);
        break;
      case 'clearScriptOutput':
        clearScriptOutput();
        break;
      default:
        console.log('Unknown message type:', message.type);
    }
  }

  // Display artifact in chat
  function displayArtifact(artifact) {
    if (!artifact) {
      return;
    }

    const artifactEl = createArtifactElement(artifact);
    messagesContainer.appendChild(artifactEl);

    updateEmptyState();
    scrollToBottom();
  }

  // Create artifact element
  function createArtifactElement(artifact) {
    const el = document.createElement('div');
    el.className = 'artifact-message';
    el.id = `artifact-${artifact.type}-${artifact.changeId}`;

    const header = document.createElement('div');
    header.className = 'artifact-header';

    const icon = document.createElement('span');
    icon.className = 'artifact-icon';
    icon.textContent = getArtifactIcon(artifact.type);

    const title = document.createElement('span');
    title.className = 'artifact-title';
    title.textContent = artifact.title || `${artifact.type.charAt(0).toUpperCase() + artifact.type.slice(1)}`;

    const type = document.createElement('span');
    type.className = 'artifact-type';
    type.textContent = artifact.type;

    header.appendChild(icon);
    header.appendChild(title);
    header.appendChild(type);

    el.appendChild(header);

    // Add content or sections based on artifact type
    if (artifact.type === 'tasks' && artifact.progress) {
      const progressEl = createTaskProgressElement(artifact.progress);
      el.appendChild(progressEl);
    }

    if (artifact.type === 'specs' && artifact.specs && artifact.specs.length > 0) {
      const specsListEl = createSpecsListElement(artifact.specs, artifact.changeId);
      el.appendChild(specsListEl);
    }

    if (artifact.sections && artifact.sections.length > 0) {
      const sectionsContainer = document.createElement('div');
      sectionsContainer.className = 'artifact-sections';

      artifact.sections.forEach((section, index) => {
        const sectionEl = createCollapsibleSection(section.title, section.content, index);
        sectionsContainer.appendChild(sectionEl);
      });

      el.appendChild(sectionsContainer);
    } else if (artifact.content) {
      // Check if content is long (more than 2000 chars or has multiple headers)
      const isLongDocument = artifact.content.length > 2000 ||
                            (artifact.content.match(/^#{1,3}\s+/gm) || []).length > 2;

      if (isLongDocument && artifact.type !== 'tasks') {
        // For long documents, create collapsible sections from headers
        const sectionsContainer = document.createElement('div');
        sectionsContainer.className = 'artifact-sections';

        const contentSections = parseMarkdownSections(artifact.content);

        if (contentSections.length > 0) {
          contentSections.forEach((section, index) => {
            const sectionEl = createCollapsibleSection(section.title, section.content, index);
            sectionsContainer.appendChild(sectionEl);
          });

          el.appendChild(sectionsContainer);

          // Add a "View Full Document" button for long documents
          const viewFullBtn = document.createElement('button');
          viewFullBtn.className = 'artifact-view-full-btn';
          viewFullBtn.textContent = 'View Full Document';
          viewFullBtn.addEventListener('click', () => {
            vscode.postMessage({
              type: 'openArtifact',
              artifactType: artifact.type,
              changeId: artifact.changeId
            });
          });

          const viewFullContainer = document.createElement('div');
          viewFullContainer.className = 'artifact-view-full';
          viewFullContainer.appendChild(viewFullBtn);
          el.appendChild(viewFullContainer);
        } else {
          // No headers found, render as regular content
          const contentEl = document.createElement('div');
          contentEl.className = 'artifact-content';
          contentEl.innerHTML = renderMarkdown(artifact.content);
          el.appendChild(contentEl);
        }
      } else {
        // Short document or tasks - render as regular content
        const contentEl = document.createElement('div');
        contentEl.className = 'artifact-content';
        contentEl.innerHTML = renderMarkdown(artifact.content);
        el.appendChild(contentEl);
      }
    }

    // Add "Open in Editor" link
    const actionsEl = document.createElement('div');
    actionsEl.className = 'artifact-actions';

    const openLink = document.createElement('a');
    openLink.className = 'artifact-link';
    openLink.href = '#';
    openLink.textContent = 'Open in Editor';
    openLink.addEventListener('click', (e) => {
      e.preventDefault();
      vscode.postMessage({
        type: 'openArtifact',
        artifactType: artifact.type,
        changeId: artifact.changeId
      });
    });

    actionsEl.appendChild(openLink);
    el.appendChild(actionsEl);

    return el;
  }

  // Parse markdown content into sections based on headers
  function parseMarkdownSections(content) {
    if (!content) {
      return [];
    }

    const sections = [];
    const lines = content.split('\n');
    let currentSection = null;
    let currentContent = [];

    for (const line of lines) {
      const headerMatch = line.match(/^(#{1,3})\s+(.+)$/);

      if (headerMatch) {
        // Save previous section if exists
        if (currentSection) {
          sections.push({
            level: currentSection.level,
            title: currentSection.title,
            content: currentContent.join('\n').trim()
          });
        }

        // Start new section
        currentSection = {
          level: headerMatch[1].length,
          title: headerMatch[2].trim()
        };
        currentContent = [];
      } else if (currentSection) {
        currentContent.push(line);
      }
    }

    // Don't forget the last section
    if (currentSection) {
      sections.push({
        level: currentSection.level,
        title: currentSection.title,
        content: currentContent.join('\n').trim()
      });
    }

    return sections;
  }

  // Render spec content with proper headers and collapsible sections
  function renderSpecContent(content) {
    if (!content) {
      return '';
    }

    const sections = parseMarkdownSections(content);

    if (sections.length === 0) {
      // No headers found, render as plain markdown
      return renderMarkdown(content);
    }

    // Create collapsible sections for each header section
    const container = document.createElement('div');
    container.className = 'spec-content-container';

    sections.forEach((section, index) => {
      const details = document.createElement('details');
      details.className = 'spec-content-section';

      // First section expanded by default, others collapsed
      if (index === 0) {
        details.open = true;
      }

      // Create summary with proper header styling
      const summary = document.createElement('summary');
      summary.className = `spec-content-header spec-content-h${section.level}`;
      summary.textContent = section.title;

      // Create content area
      const contentDiv = document.createElement('div');
      contentDiv.className = 'spec-content-body';
      contentDiv.innerHTML = renderMarkdown(section.content);

      details.appendChild(summary);
      details.appendChild(contentDiv);
      container.appendChild(details);
    });

    return container.outerHTML;
  }

  // Create specs list element with expandable items
  function createSpecsListElement(specs, changeId) {
    const container = document.createElement('div');
    container.className = 'specs-list';

    const header = document.createElement('div');
    header.className = 'specs-list-header';
    header.innerHTML = `
      <span class="specs-count">${specs.length} specification${specs.length !== 1 ? 's' : ''}</span>
    `;
    container.appendChild(header);

    specs.forEach((spec, index) => {
      const specItem = document.createElement('details');
      specItem.className = 'spec-item';
      if (index === 0) {
        specItem.open = true;
      }

      const summary = document.createElement('summary');
      summary.className = 'spec-item-header';
      summary.innerHTML = `
        <span class="spec-item-icon">📋</span>
        <span class="spec-item-name">${escapeHtml(spec.name)}</span>
        <span class="spec-item-filename">${escapeHtml(spec.fileName)}</span>
      `;

      const content = document.createElement('div');
      content.className = 'spec-item-content';

      // Render spec content with proper formatting and collapsible sections
      if (spec.content) {
        const specContentDiv = document.createElement('div');
        specContentDiv.className = 'spec-rendered-content';
        specContentDiv.innerHTML = renderSpecContent(spec.content);
        content.appendChild(specContentDiv);

        // Apply syntax highlighting to code blocks in the spec content
        setTimeout(() => {
          applySyntaxHighlighting(specContentDiv);
        }, 0);
      } else if (spec.description) {
        const description = document.createElement('p');
        description.className = 'spec-item-description';
        description.textContent = spec.description;
        content.appendChild(description);
      }

      // Add "Open in Editor" button for this spec
      const openBtn = document.createElement('button');
      openBtn.className = 'spec-open-btn';
      openBtn.textContent = 'Open in Editor';
      openBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        vscode.postMessage({
          type: 'openArtifact',
          artifactType: 'specs',
          changeId: changeId,
          fileName: spec.fileName
        });
      });
      content.appendChild(openBtn);

      specItem.appendChild(summary);
      specItem.appendChild(content);
      container.appendChild(specItem);
    });

    return container;
  }

  // Get icon for artifact type
  function getArtifactIcon(type) {
    switch (type) {
      case 'proposal':
        return '📄';
      case 'design':
        return '🏗️';
      case 'tasks':
        return '✓';
      case 'spec':
        return '📋';
      case 'specs':
        return '📚';
      default:
        return '📄';
    }
  }

  // Create task progress element
  function createTaskProgressElement(progress) {
    const container = document.createElement('div');
    container.className = 'task-progress';

    const header = document.createElement('div');
    header.className = 'task-progress-header';
    header.innerHTML = `
      <span class="task-progress-stats">${progress.completed}/${progress.total} completed</span>
      <span class="task-progress-percentage">${Math.round((progress.completed / progress.total) * 100) || 0}%</span>
    `;

    const bar = document.createElement('div');
    bar.className = 'task-progress-bar';

    const fill = document.createElement('div');
    fill.className = 'task-progress-fill';
    fill.style.width = `${(progress.completed / progress.total) * 100 || 0}%`;
    fill.setAttribute('data-completed', progress.completed);
    fill.setAttribute('data-total', progress.total);

    bar.appendChild(fill);
    container.appendChild(header);
    container.appendChild(bar);

    return container;
  }

  // Create collapsible section
  function createCollapsibleSection(title, content, index) {
    const details = document.createElement('details');
    details.className = 'artifact-section';
    if (index === 0) {
      details.open = true;
    }

    const summary = document.createElement('summary');
    summary.className = 'artifact-section-title';
    summary.textContent = title;

    const contentEl = document.createElement('div');
    contentEl.className = 'artifact-section-content';
    contentEl.innerHTML = renderMarkdown(content);

    details.appendChild(summary);
    details.appendChild(contentEl);

    return details;
  }

  // Send message to extension
  function sendMessage() {
    const content = messageInput.value.trim();
    if (!content) {
      focusInput();
      return;
    }

    vscode.postMessage({
      type: 'sendMessage',
      content: content
    });

    messageInput.value = '';
    adjustTextareaHeight();
    focusInput();
  }

  // Adjust textarea height based on content
  function adjustTextareaHeight() {
    messageInput.style.height = 'auto';
    const newHeight = Math.min(messageInput.scrollHeight, 120);
    messageInput.style.height = newHeight + 'px';
  }

  // Request session data from extension
  function requestSessionData() {
    vscode.postMessage({
      type: 'getSession'
    });
  }

  // Add message to UI
  function addMessageToUI(message) {
    messages.push(message);

    // Check if we should enable virtual scrolling
    if (shouldEnableVirtualScroll() && !virtualScrollState.enabled) {
      enableVirtualScrolling();
    }

    if (virtualScrollState.enabled) {
      // For virtual scrolling, just update the viewport
      updateVirtualScrollOnMessageChange();
      scrollToBottom();
    } else {
      const messageEl = createMessageElement(message);
      messagesContainer.appendChild(messageEl);
      updateEmptyState();
      scrollToBottom();
    }
  }

  // Update existing message in UI with throttling for performance
  function updateMessageInUI(messageId, content, isStreaming) {
    const now = performance.now();
    
    // Update streaming state tracking
    if (isStreaming) {
      streamingState.isActive = true;
      streamingState.batchSize += content.length - streamingState.lastContent.length;
      
      // Skip update if we haven't accumulated enough content and haven't exceeded time threshold
      const timeSinceLastUpdate = now - streamingState.lastUpdateTime;
      const minInterval = 1000 / STREAMING_MAX_UPDATES_PER_SECOND;
      
      if (streamingState.batchSize < STREAMING_BATCH_SIZE && timeSinceLastUpdate < minInterval) {
        // Store for later but don't render yet
        pendingUpdate = { messageId, content, isStreaming, timestamp: now };
        streamingState.skippedUpdates++;
        return;
      }
      
      // Reset batch counter
      streamingState.batchSize = 0;
      streamingState.lastUpdateTime = now;
      streamingState.updateCount++;
    } else {
      streamingState.isActive = false;
      streamingState.batchSize = 0;
    }
    
    streamingState.lastContent = content;
    
    // Cancel any pending RAF
    if (updateRafId) {
      cancelAnimationFrame(updateRafId);
    }
    
    // If there's a pending timeout, clear it
    if (updateTimeout) {
      clearTimeout(updateTimeout);
    }
    
    // Store the latest update data
    pendingUpdate = { messageId, content, isStreaming, timestamp: now };
    
    // Use requestAnimationFrame for smooth updates
    updateRafId = requestAnimationFrame(() => {
      if (pendingUpdate) {
        applyMessageUpdate(pendingUpdate.messageId, pendingUpdate.content, pendingUpdate.isStreaming);
        pendingUpdate = null;
        updateRafId = null;
      }
    });
    
    // Set a fallback timeout to ensure updates happen even if RAF is delayed
    updateTimeout = setTimeout(() => {
      if (pendingUpdate) {
        if (updateRafId) {
          cancelAnimationFrame(updateRafId);
          updateRafId = null;
        }
        applyMessageUpdate(pendingUpdate.messageId, pendingUpdate.content, pendingUpdate.isStreaming);
        pendingUpdate = null;
        updateTimeout = null;
      }
    }, UPDATE_THROTTLE_MS);
  }

  // Apply the actual DOM update (called by throttled updateMessageInUI)
  function applyMessageUpdate(messageId, content, isStreaming) {
    const messageEl = document.getElementById(`message-${messageId}`);
    if (!messageEl) {
      return;
    }

    const contentEl = messageEl.querySelector('.message-content');
    if (!contentEl) {
      return;
    }

    // Get current rendered content to compare
    const currentHtml = contentEl.innerHTML;
    const role = messageEl.className.includes('message-user') ? 'user' : 
                 messageEl.className.includes('message-assistant') ? 'assistant' : 'system';
    
    // Only re-render if content actually changed
    // For streaming, we can optimize by only updating text nodes when possible
    if (streamingState.isActive && isStreaming) {
      // During streaming, try to append only new content instead of full re-render
      const newTextLength = content.length;
      const existingText = contentEl.textContent || '';
      
      if (newTextLength > existingText.length && content.startsWith(existingText)) {
        // Only new content was added - append it efficiently
        const newContent = content.slice(existingText.length);
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = renderMessageContent(newContent, role);
        
        // Move all children from temp to contentEl
        while (tempDiv.firstChild) {
          contentEl.appendChild(tempDiv.firstChild);
        }
      } else {
        // Content changed in middle or was replaced - full re-render needed
        contentEl.innerHTML = renderMessageContent(content, role);
        applySyntaxHighlighting(contentEl);
      }
    } else {
      // Not streaming - do full render
      const newHtml = renderMessageContent(content, role);
      if (currentHtml !== newHtml) {
        contentEl.innerHTML = newHtml;
        applySyntaxHighlighting(contentEl);
      }
    }

    // Update streaming class only if changed
    if (isStreaming !== undefined) {
      const hasStreamingClass = messageEl.classList.contains('streaming');
      if (isStreaming !== hasStreamingClass) {
        messageEl.classList.toggle('streaming', isStreaming);
      }
    }

    scrollToBottom();
  }

  // Create message element
  function createMessageElement(message) {
    const el = document.createElement('div');
    el.id = `message-${message.id}`;
    el.className = `message message-${message.role}`;

    if (message.metadata?.isStreaming) {
      el.classList.add('streaming');
    }

    const header = document.createElement('div');
    header.className = 'message-header';

    const role = document.createElement('span');
    role.className = 'message-role';
    role.textContent = getRoleDisplayName(message.role);

    const timestamp = document.createElement('span');
    timestamp.className = 'message-timestamp';
    timestamp.textContent = formatTimestamp(message.timestamp);

    header.appendChild(role);
    header.appendChild(timestamp);

    const content = document.createElement('div');
    content.className = 'message-content';
    content.innerHTML = renderMessageContent(message.content, message.role);

    // Apply syntax highlighting to code blocks in the message
    applySyntaxHighlighting(content);

    el.appendChild(header);
    el.appendChild(content);

    return el;
  }

  // Get display name for role
  function getRoleDisplayName(role) {
    switch (role) {
      case 'user':
        return 'You';
      case 'assistant':
        return 'AI';
      case 'system':
        return 'System';
      default:
        return role.charAt(0).toUpperCase() + role.slice(1);
    }
  }

  // Language detection map for common aliases
  const LANGUAGE_ALIASES = {
    'ts': 'typescript',
    'tsx': 'typescript',
    'js': 'javascript',
    'jsx': 'javascript',
    'json': 'json',
    'py': 'python',
    'rb': 'ruby',
    'sh': 'bash',
    'bash': 'bash',
    'shell': 'bash',
    'zsh': 'bash',
    'md': 'markdown',
    'yml': 'yaml',
    'yaml': 'yaml',
    'html': 'xml',
    'htm': 'xml',
    'xml': 'xml',
    'css': 'css',
    'scss': 'scss',
    'sass': 'scss',
    'less': 'less',
    'sql': 'sql',
    'php': 'php',
    'java': 'java',
    'cpp': 'cpp',
    'c++': 'cpp',
    'c': 'c',
    'cs': 'csharp',
    'csharp': 'csharp',
    'go': 'go',
    'golang': 'go',
    'rs': 'rust',
    'rust': 'rust',
    'swift': 'swift',
    'kt': 'kotlin',
    'kotlin': 'kotlin',
    'scala': 'scala',
    'r': 'r',
    'dart': 'dart',
    'lua': 'lua',
    'perl': 'perl',
    'pl': 'perl'
  };

  // Normalize language identifier
  function normalizeLanguage(lang) {
    if (!lang) {
      return 'text';
    }
    const normalized = lang.toLowerCase().trim();
    return LANGUAGE_ALIASES[normalized] || normalized;
  }

  // Lazy loading state for syntax highlighting
  let highlightJsLoaded = false;
  let highlightJsLoading = false;
  const pendingHighlightQueue = [];

  // Load highlight.js dynamically when needed
  async function loadHighlightJs() {
    if (highlightJsLoaded || highlightJsLoading) {
      return highlightJsLoaded;
    }

    highlightJsLoading = true;

    try {
      // Load highlight.js core
      await loadScript('/node_modules/highlight.js/lib/core.js');

      // Load language definitions
      await loadScript('/media/highlight-languages.js');

      highlightJsLoaded = true;
      highlightJsLoading = false;

      // Process any pending highlights
      processPendingHighlights();

      return true;
    } catch (error) {
      console.warn('Failed to load highlight.js:', error);
      highlightJsLoading = false;
      return false;
    }
  }

  // Helper to load a script dynamically
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = true;

      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load ${src}`));

      document.head.appendChild(script);
    });
  }

  // Process queued highlights after library loads
  function processPendingHighlights() {
    while (pendingHighlightQueue.length > 0) {
      const { codeElement, language } = pendingHighlightQueue.shift();
      highlightCodeElement(codeElement, language);
    }
  }

  // Apply syntax highlighting to a code element
  function highlightCodeElement(codeElement, language) {
    if (!codeElement) {
      return;
    }

    // If highlight.js is not loaded, queue for later
    if (!highlightJsLoaded) {
      pendingHighlightQueue.push({ codeElement, language });
      // Trigger lazy load
      loadHighlightJs();
      return;
    }

    if (!window.hljs) {
      return;
    }

    const normalizedLang = normalizeLanguage(language);

    // Check if highlight.js supports this language
    if (normalizedLang !== 'text' && window.hljs.getLanguage(normalizedLang)) {
      try {
        const result = window.hljs.highlight(codeElement.textContent, {
          language: normalizedLang,
          ignoreIllegals: true
        });
        codeElement.innerHTML = result.value;
        codeElement.classList.add(`language-${normalizedLang}`);
      } catch (e) {
        // Fallback to plain text if highlighting fails
        console.warn('Syntax highlighting failed:', e);
      }
    }
  }

  // Apply syntax highlighting to all code blocks in a container
  function applySyntaxHighlighting(container) {
    if (!container) {
      return;
    }

    const codeBlocks = container.querySelectorAll('pre code');

    // If there are code blocks and highlight.js isn't loaded, trigger lazy load
    if (codeBlocks.length > 0 && !highlightJsLoaded && !highlightJsLoading) {
      loadHighlightJs();
    }

    codeBlocks.forEach(codeBlock => {
      // Extract language from class
      const langMatch = codeBlock.className.match(/language-(\w+)/);
      const language = langMatch ? langMatch[1] : 'text';
      highlightCodeElement(codeBlock, language);
    });
  }

  // Render message content with markdown-like formatting
  function renderMessageContent(content, role) {
    if (!content) {
      return '';
    }

    // For AI/assistant messages, use enhanced markdown rendering
    if (role === 'assistant') {
      return renderMarkdown(content);
    }

    // For user messages, use simple formatting
    let html = escapeHtml(content);

    // Convert code blocks with language detection
    html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
      const language = normalizeLanguage(lang);
      return `<pre class="code-block"><code class="language-${language}">${escapeHtml(code.trim())}</code></pre>`;
    });

    // Convert inline code
    html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

    // Convert bold
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Convert italic
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Convert links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="message-link" target="_blank">$1</a>');

    // Convert newlines to <br> for non-code content
    html = html.replace(/\n/g, '<br>');

    return html;
  }

  // Enhanced markdown rendering for AI messages
  function renderMarkdown(content) {
    if (!content) {
      return '';
    }

    let html = content;

    // Escape HTML first to prevent XSS
    html = escapeHtml(html);

    // Store code blocks temporarily to protect them from further processing
    const codeBlocks = [];
    const codeBlockLanguages = [];
    html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
      const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`;
      const language = normalizeLanguage(lang);
      codeBlockLanguages.push(language);
      codeBlocks.push(`<pre class="code-block"><code class="language-${language}">${escapeHtml(code.trim())}</code></pre>`);
      return placeholder;
    });

    // Store inline code temporarily
    const inlineCodes = [];
    html = html.replace(/`([^`]+)`/g, (match, code) => {
      const placeholder = `__INLINE_CODE_${inlineCodes.length}__`;
      inlineCodes.push(`<code class="inline-code">${escapeHtml(code)}</code>`);
      return placeholder;
    });

    // Headers (h1-h6)
    html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
    html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
    html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');

    // Bold and italic
    html = html.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    html = html.replace(/___([^_]+)___/g, '<strong><em>$1</em></strong>');
    html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    html = html.replace(/_([^_]+)_/g, '<em>$1</em>');

    // Strikethrough
    html = html.replace(/~~([^~]+)~~/g, '<del>$1</del>');

    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="message-link" target="_blank">$1</a>');

    // Auto-link URLs
    html = html.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" class="message-link" target="_blank">$1</a>');

    // Unordered lists
    html = html.replace(/^(\s*)[-*+]\s+(.+)$/gm, (match, indent, item) => {
      const level = Math.floor(indent.length / 2);
      return `${indent}<li class="list-item-level-${level}">${item}</li>`;
    });

    // Wrap consecutive list items in ul
    html = html.replace(/(<li[^>]*>.*<\/li>\n?)+/g, '<ul>$&</ul>');

    // Ordered lists
    html = html.replace(/^(\s*)\d+\.\s+(.+)$/gm, (match, indent, item) => {
      const level = Math.floor(indent.length / 2);
      return `${indent}<li class="list-item-level-${level}">${item}</li>`;
    });

    // Wrap consecutive ordered list items in ol
    html = html.replace(/(<li[^>]*>.*<\/li>\n?)+/g, (match) => {
      if (match.includes('ol>')) {
        return match;
      }
      return `<ol>${match}</ol>`;
    });

    // Blockquotes
    html = html.replace(/^&gt;\s+(.+)$/gm, '<blockquote>$1</blockquote>');
    html = html.replace(/(<blockquote>.*<\/blockquote>\n?)+/g, '<div class="blockquote-wrapper">$&</div>');

    // Horizontal rules
    html = html.replace(/^---$/gm, '<hr>');
    html = html.replace(/^___$/gm, '<hr>');
    html = html.replace(/^\*\*\*$/gm, '<hr>');

    // Tables (simple support)
    const tableRegex = /^\|(.+)\|\n\|[-:\s|]+\|\n((?:\|.+\|\n?)+)/gm;
    html = html.replace(tableRegex, (match, header, rows) => {
      const headers = header.split('|').map(h => h.trim()).filter(h => h);
      const headerHtml = headers.map(h => `<th>${h}</th>`).join('');
      const rowLines = rows.trim().split('\n');
      const rowsHtml = rowLines.map(line => {
        const cells = line.split('|').map(c => c.trim()).filter(c => c);
        return `<tr>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`;
      }).join('');
      return `<table class="markdown-table"><thead><tr>${headerHtml}</tr></thead><tbody>${rowsHtml}</tbody></table>`;
    });

    // Paragraphs - wrap non-block content
    const blocks = html.split('\n\n');
    html = blocks.map(block => {
      const trimmed = block.trim();
      if (!trimmed ||
          trimmed.startsWith('<h') ||
          trimmed.startsWith('<ul') ||
          trimmed.startsWith('<ol') ||
          trimmed.startsWith('<li') ||
          trimmed.startsWith('<blockquote') ||
          trimmed.startsWith('<div') ||
          trimmed.startsWith('<hr') ||
          trimmed.startsWith('<table') ||
          trimmed.startsWith('<pre') ||
          trimmed.startsWith('__CODE_BLOCK') ||
          trimmed.startsWith('__INLINE_CODE')) {
        return block;
      }
      return `<p>${block}</p>`;
    }).join('\n\n');

    // Restore code blocks
    codeBlocks.forEach((block, i) => {
      html = html.replace(`__CODE_BLOCK_${i}__`, block);
    });

    // Apply syntax highlighting after restoring code blocks
    // We need to create a temporary container to apply highlighting
    const tempContainer = document.createElement('div');
    tempContainer.innerHTML = html;
    applySyntaxHighlighting(tempContainer);
    html = tempContainer.innerHTML;

    // Restore inline code
    inlineCodes.forEach((code, i) => {
      html = html.replace(`__INLINE_CODE_${i}__`, code);
    });

    // Convert remaining newlines to <br> within paragraphs
    html = html.replace(/<p>([\s\S]*?)<\/p>/g, (match, content) => {
      return `<p>${content.replace(/\n/g, '<br>')}</p>`;
    });

    return html;
  }

  // Escape HTML to prevent XSS
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Clear all messages
  function clearMessages() {
    messages = [];
    
    // Remove all message elements and virtual scroll spacers
    const messageEls = messagesContainer.querySelectorAll('.message, .virtual-scroll-spacer-top, .virtual-scroll-spacer-bottom');
    messageEls.forEach(el => el.remove());
    
    // Reset virtual scroll state
    if (virtualScrollState.enabled) {
      virtualScrollState.enabled = false;
      virtualScrollState.visibleStart = 0;
      virtualScrollState.visibleEnd = 0;
      virtualScrollState.scrollTop = 0;
      messagesContainer.classList.remove('virtual-scroll-enabled');
      messagesContainer.removeEventListener('scroll', handleVirtualScroll);
    }
    
    updateEmptyState();
    clearToolCalls();
  }

  // Load session data
  function loadSessionData(session) {
    if (session && session.messages) {
      clearMessages();
      session.messages.forEach(msg => addMessageToUI(msg));
    }
  }

  // Update empty state visibility
  function updateEmptyState() {
    if (messages.length === 0) {
      emptyState.style.display = 'block';
    } else {
      emptyState.style.display = 'none';
    }
  }

  // Scroll to bottom of messages (only if user is near bottom or not actively scrolling)
  function scrollToBottom() {
    if (!isUserScrolling || isNearBottom()) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }

  // Force scroll to bottom (for user-initiated actions)
  function forceScrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  // Format timestamp
  function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  }

  // Focus input field
  function focusInput() {
    messageInput.focus();
  }

  // Show error with enhanced UI
  function showError(message) {
    showEnhancedError(message, false, null);
  }

  // Show enhanced error message with retry capabilities
  function showEnhancedError(message, retryable = false, retryAction = null) {
    const errorEl = document.createElement('div');
    errorEl.className = 'message message-error';

    const header = document.createElement('div');
    header.className = 'message-header';

    const role = document.createElement('span');
    role.className = 'message-role';
    role.textContent = 'Error';

    const timestamp = document.createElement('span');
    timestamp.className = 'message-timestamp';
    timestamp.textContent = formatTimestamp(Date.now());

    header.appendChild(role);
    header.appendChild(timestamp);

    const content = document.createElement('div');
    content.className = 'message-content';
    content.textContent = message;

    errorEl.appendChild(header);
    errorEl.appendChild(content);

    // Add retry actions if the error is retryable
    if (retryable && retryAction) {
      const actions = document.createElement('div');
      actions.className = 'error-actions';

      const retryBtn = document.createElement('button');
      retryBtn.className = 'error-action-btn primary';
      retryBtn.innerHTML = '<span class="retry-icon">↻</span> Retry';
      retryBtn.addEventListener('click', () => {
        retryBtn.disabled = true;
        retryBtn.innerHTML = '<span class="retry-icon spinning">↻</span> Retrying...';
        vscode.postMessage({
          type: 'retryAction',
          action: retryAction
        });
      });

      const dismissBtn = document.createElement('button');
      dismissBtn.className = 'error-action-btn secondary';
      dismissBtn.textContent = 'Dismiss';
      dismissBtn.addEventListener('click', () => {
        errorEl.remove();
      });

      actions.appendChild(retryBtn);
      actions.appendChild(dismissBtn);
      errorEl.appendChild(actions);
    }

    messagesContainer.appendChild(errorEl);
    scrollToBottom();
  }

  // Show error toast notification (temporary)
  function showErrorToast(message, duration = 5000) {
    // Remove any existing toast
    const existingToast = document.querySelector('.error-toast');
    if (existingToast) {
      existingToast.remove();
    }

    const toast = document.createElement('div');
    toast.className = 'error-toast';

    const icon = document.createElement('span');
    icon.className = 'error-toast-icon';
    icon.textContent = '⚠';

    const text = document.createElement('span');
    text.className = 'error-toast-message';
    text.textContent = message;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'error-toast-close';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', () => {
      toast.remove();
    });

    toast.appendChild(icon);
    toast.appendChild(text);
    toast.appendChild(closeBtn);

    document.body.appendChild(toast);

    // Auto-remove after duration
    setTimeout(() => {
      if (toast.parentNode) {
        toast.style.animation = 'toastSlideUp 0.3s ease-out reverse';
        setTimeout(() => toast.remove(), 300);
      }
    }, duration);
  }

  // Show typing indicator
  function showTypingIndicator() {
    if (typingIndicator) {
      typingIndicator.style.display = 'flex';
      isStreaming = true;
      scrollToBottom();
    }
  }

  // Hide typing indicator
  function hideTypingIndicator() {
    if (typingIndicator) {
      typingIndicator.style.display = 'none';
      isStreaming = false;
    }
  }

  // Mark message as partial (streaming was cancelled)
  function markMessageAsPartial(messageId, partialContent) {
    const messageEl = document.getElementById(`message-${messageId}`);
    if (messageEl) {
      messageEl.classList.add('partial');
      messageEl.classList.remove('streaming');

      const contentEl = messageEl.querySelector('.message-content');
      if (contentEl) {
        const role = messageEl.className.includes('message-user') ? 'user' :
                     messageEl.className.includes('message-assistant') ? 'assistant' : 'system';
        contentEl.innerHTML = renderMessageContent(partialContent || contentEl.textContent, role);

        // Add partial indicator
        const partialIndicator = document.createElement('div');
        partialIndicator.className = 'partial-indicator';
        partialIndicator.innerHTML = '<span class="partial-text">(Response was cancelled)</span>';
        contentEl.appendChild(partialIndicator);
      }

      // Update the message in our local state
      const messageIndex = messages.findIndex(m => m.id === messageId);
      if (messageIndex !== -1) {
        messages[messageIndex].content = partialContent || messages[messageIndex].content;
        messages[messageIndex].metadata = {
          ...messages[messageIndex].metadata,
          isStreaming: false,
          isPartial: true
        };
      }
    }
  }

  // Virtual Scrolling Functions

  // Check if virtual scrolling should be enabled
  function shouldEnableVirtualScroll() {
    return messages.length > VIRTUAL_SCROLL_THRESHOLD;
  }

  // Enable virtual scrolling
  function enableVirtualScrolling() {
    if (virtualScrollState.enabled) {
      return;
    }

    virtualScrollState.enabled = true;
    messagesContainer.classList.add('virtual-scroll-enabled');

    // Add scroll listener for virtual scrolling
    messagesContainer.addEventListener('scroll', handleVirtualScroll);

    // Initial render
    updateVirtualScrollViewport();
  }

  // Disable virtual scrolling
  function disableVirtualScrolling() {
    if (!virtualScrollState.enabled) {
      return;
    }

    virtualScrollState.enabled = false;
    messagesContainer.classList.remove('virtual-scroll-enabled');
    messagesContainer.removeEventListener('scroll', handleVirtualScroll);

    // Render all messages
    renderAllMessages();
  }

  // Handle scroll events for virtual scrolling
  function handleVirtualScroll() {
    if (!virtualScrollState.enabled) {
      return;
    }

    virtualScrollState.scrollTop = messagesContainer.scrollTop;
    requestAnimationFrame(updateVirtualScrollViewport);
  }

  // Update which messages are visible based on scroll position
  function updateVirtualScrollViewport() {
    if (!virtualScrollState.enabled || messages.length === 0) {
      return;
    }

    const containerHeight = messagesContainer.clientHeight;
    const scrollTop = messagesContainer.scrollTop;

    // Calculate visible range
    const startIndex = Math.max(0, Math.floor(scrollTop / virtualScrollState.itemHeight) - virtualScrollState.bufferSize);
    const endIndex = Math.min(
      messages.length - 1,
      Math.ceil((scrollTop + containerHeight) / virtualScrollState.itemHeight) + virtualScrollState.bufferSize
    );

    // Only update if range changed
    if (startIndex === virtualScrollState.visibleStart && endIndex === virtualScrollState.visibleEnd) {
      return;
    }

    virtualScrollState.visibleStart = startIndex;
    virtualScrollState.visibleEnd = endIndex;

    // Update total height
    virtualScrollState.totalHeight = messages.length * virtualScrollState.itemHeight;

    // Render visible messages
    renderVirtualMessages(startIndex, endIndex);
  }

  // Render only the visible messages for virtual scrolling
  function renderVirtualMessages(startIndex, endIndex) {
    // Clear current messages (but preserve empty state if needed)
    const currentMessages = messagesContainer.querySelectorAll('.message');
    currentMessages.forEach(el => el.remove());

    // Create spacer for top
    const topSpacer = document.createElement('div');
    topSpacer.className = 'virtual-scroll-spacer-top';
    topSpacer.style.height = `${startIndex * virtualScrollState.itemHeight}px`;
    messagesContainer.appendChild(topSpacer);

    // Render visible messages
    for (let i = startIndex; i <= endIndex && i < messages.length; i++) {
      const messageEl = createMessageElement(messages[i]);
      messagesContainer.appendChild(messageEl);
    }

    // Create spacer for bottom
    const bottomSpacer = document.createElement('div');
    bottomSpacer.className = 'virtual-scroll-spacer-bottom';
    const remainingMessages = messages.length - endIndex - 1;
    bottomSpacer.style.height = `${Math.max(0, remainingMessages * virtualScrollState.itemHeight)}px`;
    messagesContainer.appendChild(bottomSpacer);

    // Update empty state
    updateEmptyState();
  }

  // Render all messages (when virtual scrolling is disabled)
  function renderAllMessages() {
    // Clear current messages
    const currentMessages = messagesContainer.querySelectorAll('.message, .virtual-scroll-spacer-top, .virtual-scroll-spacer-bottom');
    currentMessages.forEach(el => el.remove());

    // Render all messages
    messages.forEach(msg => {
      const messageEl = createMessageElement(msg);
      messagesContainer.appendChild(messageEl);
    });

    updateEmptyState();
  }

  // Update virtual scroll state when messages change
  function updateVirtualScrollOnMessageChange() {
    if (shouldEnableVirtualScroll()) {
      if (!virtualScrollState.enabled) {
        enableVirtualScrolling();
      } else {
        updateVirtualScrollViewport();
      }
    } else if (virtualScrollState.enabled) {
      disableVirtualScrolling();
    }
  }

  // Get message element height (for dynamic height calculation)
  function getMessageHeight(messageEl) {
    if (!messageEl) {
      return virtualScrollState.itemHeight;
    }
    return messageEl.offsetHeight || virtualScrollState.itemHeight;
  }

  // Start
  init();
})();
