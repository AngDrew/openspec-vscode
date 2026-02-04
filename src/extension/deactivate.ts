import { ErrorHandler } from '../utils/errorHandler';
import { ExtensionRuntimeState } from './runtime';

export function deactivateExtension(runtime?: ExtensionRuntimeState) {
  try {
    if (runtime?.cacheManager) {
      runtime.cacheManager.dispose();
    }

    ErrorHandler.dispose();

    ErrorHandler.info('Extension deactivated successfully', false);
  } catch (error) {
    ErrorHandler.handle(error as Error, 'Error during extension deactivation', false);
  }
}
