"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.countRequirementsInSpec = exports.hasNoTasks = exports.isScaffoldOnlyActiveChange = exports.listFiles = exports.listDirectories = exports.readFile = exports.fileExists = exports.getArchiveDir = exports.getSpecsDir = exports.getChangesDir = exports.getOpenSpecRoot = exports.isInitialized = void 0;
const path = __importStar(require("path"));
const fs = __importStar(require("fs/promises"));
/**
 * Check if the directory is an OpenSpec workspace (has openspec/ directory)
 */
async function isInitialized(dir) {
    const openspecPath = path.join(dir, 'openspec');
    try {
        const stats = await fs.stat(openspecPath);
        return stats.isDirectory();
    }
    catch {
        return false;
    }
}
exports.isInitialized = isInitialized;
/**
 * Get the OpenSpec root directory path
 */
function getOpenSpecRoot(dir) {
    return path.join(dir, 'openspec');
}
exports.getOpenSpecRoot = getOpenSpecRoot;
/**
 * Get the changes directory path
 */
function getChangesDir(dir) {
    return path.join(getOpenSpecRoot(dir), 'changes');
}
exports.getChangesDir = getChangesDir;
/**
 * Get the specs directory path
 */
function getSpecsDir(dir) {
    return path.join(getOpenSpecRoot(dir), 'specs');
}
exports.getSpecsDir = getSpecsDir;
/**
 * Get the archive directory path
 */
function getArchiveDir(dir) {
    return path.join(getChangesDir(dir), 'archive');
}
exports.getArchiveDir = getArchiveDir;
/**
 * Check if a file exists
 */
async function fileExists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    }
    catch {
        return false;
    }
}
exports.fileExists = fileExists;
/**
 * Read a file and return its contents
 */
async function readFile(filePath) {
    try {
        const content = await fs.readFile(filePath, 'utf8');
        return content;
    }
    catch (error) {
        throw new Error(`Failed to read file: ${filePath} - ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
exports.readFile = readFile;
/**
 * List all directories in a given path
 */
async function listDirectories(dirPath) {
    try {
        const items = await fs.readdir(dirPath, { withFileTypes: true });
        return items
            .filter(item => item.isDirectory())
            .map(item => item.name);
    }
    catch {
        return [];
    }
}
exports.listDirectories = listDirectories;
/**
 * List all files in a given path, optionally filtered by extension
 */
async function listFiles(dirPath, extension = '.md') {
    try {
        const items = await fs.readdir(dirPath, { withFileTypes: true });
        return items
            .filter(item => item.isFile() && item.name.endsWith(extension))
            .map(item => item.name);
    }
    catch {
        return [];
    }
}
exports.listFiles = listFiles;
/**
 * Check if a change is scaffold-only (only contains .openspec.yaml)
 * A scaffold-only change contains ONLY `.openspec.yaml` at the change root.
 * No proposal/design/tasks/specs files exist yet.
 */
async function isScaffoldOnlyActiveChange(changeDir) {
    try {
        const items = await fs.readdir(changeDir, { withFileTypes: true });
        let hasOpenSpecYaml = false;
        let hasOtherEntries = false;
        for (const item of items) {
            // Ignore common system files
            if (item.name === '.DS_Store' && item.isFile()) {
                continue;
            }
            if (item.name === 'Thumbs.db' && item.isFile()) {
                continue;
            }
            // Check for .openspec.yaml
            if (item.name === '.openspec.yaml' && item.isFile()) {
                hasOpenSpecYaml = true;
                continue;
            }
            // Allow an empty `specs/` directory (optionally containing only `.gitkeep`)
            if (item.name === 'specs' && item.isDirectory()) {
                try {
                    const specEntries = await fs.readdir(path.join(changeDir, 'specs'), { withFileTypes: true });
                    const nonIgnorable = specEntries.filter(entry => {
                        if (!entry.isFile())
                            return true;
                        return entry.name !== '.gitkeep' && entry.name !== '.DS_Store' && entry.name !== 'Thumbs.db';
                    });
                    if (nonIgnorable.length === 0) {
                        continue;
                    }
                }
                catch {
                    // If we can't read it, treat it as non-empty to be safe
                }
            }
            hasOtherEntries = true;
            break;
        }
        return hasOpenSpecYaml && !hasOtherEntries;
    }
    catch {
        return false;
    }
}
exports.isScaffoldOnlyActiveChange = isScaffoldOnlyActiveChange;
/**
 * Check if a change has no tasks (tasks.md does not exist)
 * Fast-forward is available when there are no tasks yet.
 */
async function hasNoTasks(changeDir) {
    try {
        const tasksPath = path.join(changeDir, 'tasks.md');
        const hasTasks = await fileExists(tasksPath);
        return !hasTasks;
    }
    catch {
        return true; // Assume no tasks if we can't check
    }
}
exports.hasNoTasks = hasNoTasks;
/**
 * Count requirements in a spec file
 * Requirements are identified by lines starting with "### Requirement:"
 */
async function countRequirementsInSpec(specPath) {
    try {
        const content = await readFile(specPath);
        const requirementMatches = content.match(/^### Requirement:/gm);
        return requirementMatches ? requirementMatches.length : 0;
    }
    catch {
        return 0;
    }
}
exports.countRequirementsInSpec = countRequirementsInSpec;
//# sourceMappingURL=workspace.js.map