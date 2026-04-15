export interface Item {
  id: string;
  name: string;
  storageId: string;
  detectedAt: number;
  category?: string;
  description?: string;
  lastSeenAt?: number;
  isEssential?: boolean;
  isFrequentlyLost?: boolean;
  isEmergency?: boolean;
  caregiverNotes?: string;
  backupLocation?: string;
  helpRequested?: boolean;
  customLabels?: string[];
}

export interface UserProfile {
  id: string;
  role: 'caregiver' | 'patient';
  email: string;
  customCategories?: string[];
}

export interface StorageUnit {
  id: string;
  name: string;
  location?: string;
  description?: string;
  items?: Item[];
  updatedAt: number;
  imageUrl?: string;
}

export interface Activity {
  id: string;
  ownerId: string;
  title: string;
  startTime: number;
  location?: string;
  itemsToBring: string[]; // IDs of items
  reminded: boolean;
  completed?: boolean;
  createdAt: number;
}

export interface AppState {
  storageUnits: StorageUnit[];
}
