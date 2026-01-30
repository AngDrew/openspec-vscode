# Changelog

All notable changes to OpenSpecCodeExplorer will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.3]

### Changed
- Bound `--count` task batching to the parent section of the first task id in the batch.

### Fixed
- Prevent task detail extraction from including subsequent task section headers.

## [1.2.2] - 2026-01-30

### Changed
- Clarify that `--count` controls the number of tasks included per runner iteration (batch size).

### Fixed
- Resolve runner commands on Windows by searching `PATH`/`PATHEXT` before execution.

## [1.2.1] - 2026-01-30

### Changed
- Rebrand the extension name to OpenSpecCodeExplorer (updated docs and marketplace display name).
- Use a PNG OpenSpec icon for the activity bar.

### Removed
- Remove bundled example OpenSpec projects to reduce the extension package size.

## [1.2.0] - 2026-01-29

### Added
- Batch OpenCode runner tasks via `--count`.
- Run multiple tasks per OpenCode runner loop.

### Changed
- Activate OpenCode runner actions via commands.
- Document multi-task runs and archive related OpenSpec change artifacts.

## [1.1.0] - 2026-01-29

### Changed
- Clarify OpenCode-only support and update README roadmap.
- Archive OpenSpec change artifacts for the src structure refactor.

### Fixed
- Add missing webview `charset`/`viewport` metadata and normalize EOL handling.

## [1.0.3] - 2026-01-29

### Fixed
- Check OpenCode server readiness before the fast-forward flow.

## [1.0.2] - 2026-01-29

### Added
- Resume OpenCode runs in the fast-forward flow.

### Changed
- Add/archive OpenSpec artifacts for the OpenCode controls workflow.

## [1.0.1] - 2026-01-29

### Added
- Auto-start the local OpenCode server before running extension actions.

## [1.0.0] - 2026-01-29

### Added
- Initial release.
- Activity bar explorer and details webview for OpenSpec changes/specs.
- Commands to apply, fast-forward, and archive changes.
- OpenCode server controls and "open UI" integration.

[Unreleased]: https://github.com/AngDrew/openspec-vscode/compare/v1.2.2...HEAD
[1.2.2]: https://github.com/AngDrew/openspec-vscode/compare/v1.2.1...v1.2.2
[1.2.1]: https://github.com/AngDrew/openspec-vscode/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/AngDrew/openspec-vscode/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/AngDrew/openspec-vscode/compare/v1.0.3...v1.1.0
[1.0.3]: https://github.com/AngDrew/openspec-vscode/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/AngDrew/openspec-vscode/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/AngDrew/openspec-vscode/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/AngDrew/openspec-vscode/releases/tag/v1.0.0
