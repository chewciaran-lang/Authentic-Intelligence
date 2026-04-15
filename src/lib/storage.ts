import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  where, 
  onSnapshot,
  writeBatch,
  getDocs,
  serverTimestamp
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { AppState, StorageUnit, Item, UserProfile, Activity } from "../types";
import { getDoc, setDoc } from 'firebase/firestore';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export const firebaseStore = {
  addStorage: async (name: string, location?: string, imageUrl?: string) => {
    if (!auth.currentUser) throw new Error("Not authenticated");
    const path = 'storageUnits';
    try {
      await addDoc(collection(db, path), {
        name,
        location: location || null,
        ownerId: auth.currentUser.uid,
        updatedAt: Date.now(),
        imageUrl: imageUrl || null,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  },

  updateStorage: async (id: string, updates: Partial<StorageUnit>) => {
    if (!auth.currentUser) throw new Error("Not authenticated");
    const path = `storageUnits/${id}`;
    try {
      const data: any = { ...updates };
      delete data.id;
      data.updatedAt = Date.now();
      
      // Clean undefined values
      Object.keys(data).forEach(key => {
        if (data[key] === undefined) delete data[key];
      });

      await updateDoc(doc(db, 'storageUnits', id), data);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  },

  deleteStorage: async (id: string) => {
    const path = `storageUnits/${id}`;
    try {
      // Delete the storage unit
      await deleteDoc(doc(db, 'storageUnits', id));
      
      // Also delete items associated with it
      const itemsPath = 'items';
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error("Not authenticated");
      
      const q = query(
        collection(db, itemsPath), 
        where('ownerId', '==', uid),
        where('storageId', '==', id)
      );
      const snapshot = await getDocs(q);
      const batch = writeBatch(db);
      snapshot.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  },

  addItems: async (storageId: string, items: (string | { name: string, category?: string })[]) => {
    if (!auth.currentUser) throw new Error("Not authenticated");
    const path = 'items';
    try {
      const batch = writeBatch(db);
      
      items.forEach((item) => {
        const name = typeof item === 'string' ? item : item.name;
        const category = typeof item === 'string' ? undefined : item.category;
        
        const newDoc = doc(collection(db, path));
        batch.set(newDoc, {
          name,
          category: category || null,
          storageId,
          ownerId: auth.currentUser!.uid,
          detectedAt: Date.now(),
        });
      });
      
      // Update storage timestamp
      batch.update(doc(db, 'storageUnits', storageId), {
        updatedAt: Date.now()
      });

      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  },

  deleteItem: async (itemId: string) => {
    if (!auth.currentUser) throw new Error("Not authenticated");
    const path = `items/${itemId}`;
    try {
      await deleteDoc(doc(db, 'items', itemId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  },

  updateItems: async (storageId: string, items: (string | { name: string, category?: string })[]) => {
    if (!auth.currentUser) throw new Error("Not authenticated");
    const path = 'items';
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error("Not authenticated");

    try {
      // First delete old items for this storage
      const q = query(
        collection(db, path), 
        where('ownerId', '==', uid),
        where('storageId', '==', storageId)
      );
      const snapshot = await getDocs(q);
      const batch = writeBatch(db);
      snapshot.docs.forEach((d) => batch.delete(d.ref));
      
      // Add new items
      items.forEach((item) => {
        const name = typeof item === 'string' ? item : item.name;
        const category = typeof item === 'string' ? undefined : item.category;
        
        const newDoc = doc(collection(db, path));
        batch.set(newDoc, {
          name,
          category: category || null,
          description: (item as any).description || null,
          storageId,
          ownerId: auth.currentUser!.uid,
          detectedAt: Date.now(),
        });
      });
      
      // Update storage timestamp
      batch.update(doc(db, 'storageUnits', storageId), {
        updatedAt: Date.now()
      });

      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  },

  updateItem: async (itemId: string, updates: Partial<Item>) => {
    if (!auth.currentUser) throw new Error("Not authenticated");
    const path = `items/${itemId}`;
    try {
      // Create a clean data object without undefined values
      const data: any = {};
      Object.keys(updates).forEach(key => {
        const value = (updates as any)[key];
        if (value !== undefined) {
          data[key] = value;
        }
      });

      // Handle specific fields that should be null if they are empty strings or explicitly requested
      if (data.category === "") data.category = null;
      if (data.description === "") data.description = null;
      if (data.caregiverNotes === "") data.caregiverNotes = null;
      if (data.backupLocation === "") data.backupLocation = null;
      
      await updateDoc(doc(db, 'items', itemId), data);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  },

  getUserProfile: async (uid: string): Promise<UserProfile | null> => {
    const path = `users/${uid}`;
    try {
      const docRef = doc(db, 'users', uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() } as UserProfile;
      }
      return null;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, path);
      return null;
    }
  },

  createUserProfile: async (uid: string, email: string, role: 'caregiver' | 'patient') => {
    const path = `users/${uid}`;
    try {
      await setDoc(doc(db, 'users', uid), {
        email,
        role,
        customCategories: []
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  },

  updateUserProfile: async (uid: string, updates: Partial<UserProfile>) => {
    const path = `users/${uid}`;
    try {
      const data: any = {};
      Object.keys(updates).forEach(key => {
        const value = (updates as any)[key];
        if (value !== undefined && key !== 'id') {
          data[key] = value;
        }
      });
      await updateDoc(doc(db, 'users', uid), data);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  },

  markItemAsSeen: async (itemId: string) => {
    if (!auth.currentUser) throw new Error("Not authenticated");
    const path = `items/${itemId}`;
    try {
      await updateDoc(doc(db, 'items', itemId), {
        lastSeenAt: Date.now()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  },

  addActivity: async (title: string, startTime: number, location?: string, itemsToBring: string[] = []) => {
    if (!auth.currentUser) throw new Error("Not authenticated");
    const path = 'activities';
    try {
      await addDoc(collection(db, path), {
        ownerId: auth.currentUser.uid,
        title,
        startTime,
        location: location || null,
        itemsToBring,
        reminded: false,
        completed: false,
        createdAt: Date.now()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  },

  updateActivity: async (id: string, updates: Partial<Activity>) => {
    if (!auth.currentUser) throw new Error("Not authenticated");
    const path = `activities/${id}`;
    try {
      const data: any = { ...updates };
      delete data.id;
      
      Object.keys(data).forEach(key => {
        if (data[key] === undefined) delete data[key];
      });

      await updateDoc(doc(db, 'activities', id), data);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  },

  deleteActivity: async (id: string) => {
    if (!auth.currentUser) throw new Error("Not authenticated");
    const path = `activities/${id}`;
    try {
      await deleteDoc(doc(db, 'activities', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  },

  toggleActivityCompletion: async (id: string, completed: boolean) => {
    if (!auth.currentUser) throw new Error("Not authenticated");
    const path = `activities/${id}`;
    try {
      await updateDoc(doc(db, 'activities', id), { completed });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  },

  subscribeToData: (callback: (data: { storageUnits: StorageUnit[], items: Item[], activities: Activity[] }) => void) => {
    if (!auth.currentUser) return () => {};

    const uid = auth.currentUser.uid;
    const storageQuery = query(collection(db, 'storageUnits'), where('ownerId', '==', uid));
    const itemsQuery = query(collection(db, 'items'), where('ownerId', '==', uid));
    const activitiesQuery = query(collection(db, 'activities'), where('ownerId', '==', uid));

    let currentStorage: any[] = [];
    let currentItems: any[] = [];
    let currentActivities: any[] = [];

    const update = () => {
      callback({ 
        storageUnits: currentStorage, 
        items: currentItems, 
        activities: currentActivities 
      });
    };

    const unsubStorage = onSnapshot(storageQuery, (snapshot) => {
      currentStorage = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      update();
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'storageUnits'));

    const unsubItems = onSnapshot(itemsQuery, (snapshot) => {
      currentItems = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      update();
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'items'));

    const unsubActivities = onSnapshot(activitiesQuery, (snapshot) => {
      currentActivities = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      update();
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'activities'));

    return () => {
      unsubStorage();
      unsubItems();
      unsubActivities();
    };
  }
};
