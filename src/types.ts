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

export interface AppState {
  storageUnits: StorageUnit[];
}
