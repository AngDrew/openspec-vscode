## Purpose
Define requirements for a maintainable internal module structure under `src/` without changing extension behavior.

## ADDED Requirements

### Requirement: Extension entrypoint delegates to internal modules
The extension SHALL keep `src/extension.ts` as the stable entrypoint and SHALL delegate implementation details to internal modules.

#### Scenario: Activation wiring remains stable
- **WHEN** the extension activates
- **THEN** `src/extension.ts` calls into an internal activation module to register providers, commands, and watchers

#### Scenario: Deactivation remains stable
- **WHEN** the extension deactivates
- **THEN** `src/extension.ts` calls into an internal deactivation module to dispose resources created during activation

### Requirement: Responsibilities are split into focused modules
The codebase SHALL provide a clear home for core concerns by extracting logic into focused modules.

#### Scenario: Commands are isolated
- **WHEN** reading or modifying command registration logic
- **THEN** it is primarily located in a dedicated commands module (not mixed across unrelated concerns)

#### Scenario: File watching is isolated
- **WHEN** reading or modifying OpenSpec file watching logic
- **THEN** it is primarily located in a dedicated watcher module

### Requirement: Logging uses the existing ErrorHandler
Core extension logic SHOULD prefer the existing `ErrorHandler` utilities over scattered `console.*` logging.

#### Scenario: Debug logging is consistent
- **WHEN** core code needs to emit debug/info logs
- **THEN** it uses `ErrorHandler.debug()` / `ErrorHandler.info()` rather than `console.log()`
