// Centralized command IDs used across the extension.

export const Commands = {
  viewDetails: 'openspec.viewDetails',
  listChanges: 'openspec.listChanges',
  applyChange: 'openspec.applyChange',
  ffChange: 'openspec.ffChange',
  archiveChange: 'openspec.archiveChange',

  generateProposal: 'openspec.generateProposal',
  init: 'openspec.init',
  showOutput: 'openspec.showOutput',

  explorerFocus: 'openspecExplorer.focus',

  opencodeStartServer: 'openspec.opencode.startServer',
  opencodeOpenUi: 'openspec.opencode.openUi',
  opencodeNewChange: 'openspec.opencode.newChange',
  opencodeGenerateRunnerScript: 'openspec.opencode.generateRunnerScript',
  opencodeRunRunnerAttached: 'openspec.opencode.runRunnerAttached'
} as const;
