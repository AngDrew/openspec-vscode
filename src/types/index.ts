export interface ChangeItem {
  id: string;
  name: string;
  path: string;
  isActive: boolean;
  hasProposal: boolean;
  hasTasks: boolean;
  hasSpecs: boolean;
  status: 'active' | 'completed';
}

export interface SpecItem {
  id: string;
  name: string;
  path: string;
  requirementCount: number;
}

export interface OpenSpecProject {
  isOpenSpecInitialized: boolean;
  rootPath: string;
  changes: ChangeItem[];
  specs: SpecItem[];
}

export interface TreeItemData {
  id: string;
  label: string;
  type: 'change' | 'spec' | 'folder' | 'welcome';
  path?: string;
  contextValue?: string;
  iconPath?: string;
  children?: TreeItemData[];
  metadata?: {
    isActive?: boolean;
    requirementCount?: number;
    status?: string;
  };
}