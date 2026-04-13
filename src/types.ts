export interface Item {
  id: string;
  name: string;
  detectedAt: number;
}

export interface StorageUnit {
  id: string;
  name: string;
  description?: string;
  items?: Item[];
  updatedAt: number;
  imageUrl?: string;
}

export interface AppState {
  storageUnits: StorageUnit[];
}
