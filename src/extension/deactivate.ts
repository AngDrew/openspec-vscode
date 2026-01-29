import { ErrorHandler } from '../utils/errorHandler';
import { ExtensionRuntimeState } from './runtime';

export function deactivateExtension(runtime?: ExtensionRuntimeState) {
  try {
    runtime?.debounceMap.forEach(timeout => clearTimeout(timeout));
    runtime?.debounceMap.clear();

    if (runtime?.fileWatcher) {
      runtime.fileWatcher.dispose();
    }
    if (runtime?.cacheManager) {
      runtime.cacheManager.dispose();
    }

    ErrorHandler.dispose();

    ErrorHandler.info('Extension deactivated successfully', false);
  } catch (error) {
    ErrorHandler.handle(error as Error, 'Error during extension deactivation', false);
  }
}
