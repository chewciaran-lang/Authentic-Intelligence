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
import { AppState, StorageUnit, Item, UserProfile } from "../types";
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
  addStorage: async (name: string, imageUrl?: string) => {
    if (!auth.currentUser) throw new Error("Not authenticated");
    const path = 'storageUnits';
    try {
      await addDoc(collection(db, path), {
        name,
        ownerId: auth.currentUser.uid,
        updatedAt: Date.now(),
        imageUrl: imageUrl || null,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
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
      const data: any = { ...updates };
      // Ensure nulls for optional fields if they are explicitly undefined
      if ('category' in updates && updates.category === undefined) data.category = null;
      if ('description' in updates && updates.description === undefined) data.description = null;
      if ('lastSeenAt' in updates && updates.lastSeenAt === undefined) data.lastSeenAt = null;
      if ('caregiverNotes' in updates && updates.caregiverNotes === undefined) data.caregiverNotes = null;
      if ('customLabels' in updates && updates.customLabels === undefined) data.customLabels = null;
      
      await updateDoc(doc(db, 'items', itemId), data);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  },

  getUserProfile: async (uid: string): Promise<UserProfile | null> => {
    try {
      const docRef = doc(db, 'users', uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() } as UserProfile;
      }
      return null;
    } catch (error) {
      console.error("Error fetching user profile:", error);
      return null;
    }
  },

  createUserProfile: async (uid: string, email: string, role: 'caregiver' | 'patient') => {
    try {
      await setDoc(doc(db, 'users', uid), {
        email,
        role
      });
    } catch (error) {
      console.error("Error creating user profile:", error);
    }
  },

  updateUserProfile: async (uid: string, updates: Partial<UserProfile>) => {
    try {
      const data: any = { ...updates };
      delete data.id;
      await updateDoc(doc(db, 'users', uid), data);
    } catch (error) {
      console.error("Error updating user profile:", error);
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

  subscribeToData: (callback: (data: { storageUnits: StorageUnit[], items: Item[] }) => void) => {
    if (!auth.currentUser) return () => {};

    const uid = auth.currentUser.uid;
    const storageQuery = query(collection(db, 'storageUnits'), where('ownerId', '==', uid));
    const itemsQuery = query(collection(db, 'items'), where('ownerId', '==', uid));

    let currentStorage: any[] = [];
    let currentItems: any[] = [];

    const unsubStorage = onSnapshot(storageQuery, (snapshot) => {
      currentStorage = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      callback({ storageUnits: currentStorage, items: currentItems });
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'storageUnits'));

    const unsubItems = onSnapshot(itemsQuery, (snapshot) => {
      currentItems = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      callback({ storageUnits: currentStorage, items: currentItems });
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'items'));

    return () => {
      unsubStorage();
      unsubItems();
    };
  }
};
