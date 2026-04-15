import React, { useState, useEffect } from "react";
import { Search, Plus, Archive, MapPin, Trash2, ChevronRight, Info, MoreVertical, LogIn, LogOut, User, Camera, X, Shield, Heart, AlertCircle, Star, HelpCircle, Tag, Sparkles, Calendar, Clock, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Scanner } from "./components/Scanner";
import { firebaseStore } from "./lib/storage";
import { auth, signIn, logOut } from "./lib/firebase";
import { onAuthStateChanged, User as FirebaseUser } from "firebase/auth";
import { StorageUnit, Item, UserProfile, Activity } from "./types";
import { motion, AnimatePresence } from "motion/react";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import Fuse from "fuse.js";
import { GoogleGenAI, Type } from "@google/genai";

const DEFAULT_CATEGORIES = ["Kitchen", "Medication", "Tools", "Documents", "Clothing", "Electronics"];

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isRoleSelectionOpen, setIsRoleSelectionOpen] = useState(false);
  const [isSettingRole, setIsSettingRole] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [storageUnits, setStorageUnits] = useState<StorageUnit[]>([]);
  const [allItems, setAllItems] = useState<Item[]>([]);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerMode, setScannerMode] = useState<'inventory' | 'lookup'>('inventory');
  const [activeStorageId, setActiveStorageId] = useState<string | null>(null);
  const [isManageCategoriesOpen, setIsManageCategoriesOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newStorageName, setNewStorageName] = useState("");
  const [newStorageLocation, setNewStorageLocation] = useState("");
  const [newStorageImage, setNewStorageImage] = useState<string | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isCapturingUnitImage, setIsCapturingUnitImage] = useState(false);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [editingItemName, setEditingItemName] = useState("");
  const [editingItemCategory, setEditingItemCategory] = useState("");
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [editingStorage, setEditingStorage] = useState<StorageUnit | null>(null);
  const [lostItem, setLostItem] = useState<Item | null>(null);
  const [escalationStep, setEscalationStep] = useState<number>(0);
  const [aiHint, setAiHint] = useState<string>("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [newCustomLabel, setNewCustomLabel] = useState("");
  const [activities, setActivities] = useState<Activity[]>([]);
  const [activeTab, setActiveTab] = useState<'inventory' | 'activities'>('inventory');
  const [isAddActivityOpen, setIsAddActivityOpen] = useState(false);
  const [newActivityTitle, setNewActivityTitle] = useState("");
  const [newActivityTime, setNewActivityTime] = useState("");
  const [newActivityLocation, setNewActivityLocation] = useState("");
  const [newActivityItems, setNewActivityItems] = useState<string[]>([]);
  const [activityItemSearchQuery, setActivityItemSearchQuery] = useState("");
  const unitVideoRef = React.useRef<HTMLVideoElement>(null);
  const unitCanvasRef = React.useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (isCapturingUnitImage) {
      startUnitCamera();
    } else {
      stopUnitCamera();
    }
    return () => stopUnitCamera();
  }, [isCapturingUnitImage]);

  async function startUnitCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: "environment" } 
      });
      if (unitVideoRef.current) {
        unitVideoRef.current.srcObject = stream;
      }
    } catch (err) {
      toast.error("Could not access camera");
      setIsCapturingUnitImage(false);
    }
  }

  function stopUnitCamera() {
    if (unitVideoRef.current?.srcObject) {
      const stream = unitVideoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
    }
  }

  const captureUnitPhoto = () => {
    if (!unitVideoRef.current || !unitCanvasRef.current) return;
    const canvas = unitCanvasRef.current;
    const video = unitVideoRef.current;
    
    // Set smaller dimensions for storage unit thumbnail
    const maxWidth = 400;
    const scale = maxWidth / video.videoWidth;
    canvas.width = maxWidth;
    canvas.height = video.videoHeight * scale;
    
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Compress quality to keep under Firestore limits
    const base64 = canvas.toDataURL("image/jpeg", 0.6);
    setNewStorageImage(base64);
    setIsCapturingUnitImage(false);
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const profile = await firebaseStore.getUserProfile(u.uid);
        if (profile) {
          setUserProfile(profile);
        } else {
          setIsRoleSelectionOpen(true);
        }
      } else {
        setUserProfile(null);
      }
      setIsAuthReady(true);
    });
    return () => unsub();
  }, []);

  const handleRoleSelection = async (role: 'caregiver' | 'patient') => {
    if (!user) return;
    setIsSettingRole(true);
    try {
      await firebaseStore.createUserProfile(user.uid, user.email || "", role);
      const profile = await firebaseStore.getUserProfile(user.uid);
      if (profile) {
        setUserProfile(profile);
        setIsRoleSelectionOpen(false);
        toast.success(`Welcome! You are now set up as a ${role}.`);
      } else {
        toast.error("Failed to verify profile creation. Please try again.");
      }
    } catch (e) {
      console.error("Role selection error:", e);
      toast.error("Could not set up your profile. Please try again.");
    } finally {
      setIsSettingRole(false);
    }
  };

  const toggleRole = async () => {
    if (user && userProfile) {
      const newRole = userProfile.role === 'caregiver' ? 'patient' : 'caregiver';
      await firebaseStore.updateUserProfile(user.uid, { role: newRole });
      const profile = await firebaseStore.getUserProfile(user.uid);
      setUserProfile(profile);
      toast.success(`Switched to ${newRole} mode`);
    }
  };

  const handleAddCustomCategory = async () => {
    if (!user || !userProfile || !newCategoryName.trim()) return;
    const current = userProfile.customCategories || [];
    if (current.includes(newCategoryName.trim())) {
      toast.error("Category already exists");
      return;
    }
    
    await firebaseStore.updateUserProfile(user.uid, {
      customCategories: [...current, newCategoryName.trim()]
    });
    setNewCategoryName("");
    toast.success("Category added");
  };

  const handleDeleteCustomCategory = async (cat: string) => {
    if (!user || !userProfile) return;
    const current = userProfile.customCategories || [];
    await firebaseStore.updateUserProfile(user.uid, {
      customCategories: current.filter(c => c !== cat)
    });
    toast.success("Category removed");
  };

  useEffect(() => {
    if (user) {
      const unsub = firebaseStore.subscribeToData(({ storageUnits, items, activities }) => {
        setStorageUnits(storageUnits);
        setAllItems(items);
        setActivities(activities);
      });
      return () => unsub();
    } else {
      setStorageUnits([]);
      setAllItems([]);
      setActivities([]);
    }
  }, [user]);

  const handleAddActivity = async () => {
    if (!newActivityTitle.trim() || !newActivityTime) {
      toast.error("Please provide a title and time");
      return;
    }
    try {
      await firebaseStore.addActivity(
        newActivityTitle,
        new Date(newActivityTime).getTime(),
        newActivityLocation || undefined,
        newActivityItems
      );
      setNewActivityTitle("");
      setNewActivityTime("");
      setNewActivityLocation("");
      setNewActivityItems([]);
      setActivityItemSearchQuery("");
      setIsAddActivityOpen(false);
      toast.success("Activity scheduled");
    } catch (e) {
      toast.error("Failed to schedule activity");
    }
  };

  // Reminder Logic
  useEffect(() => {
    if (userProfile?.role === 'patient' && activities.length > 0) {
      const checkReminders = () => {
        const now = Date.now();
        activities.forEach(activity => {
          // Remind 15 minutes before
          const reminderTime = activity.startTime - (15 * 60 * 1000);
          if (!activity.reminded && now >= reminderTime && now < activity.startTime) {
            const items = activity.itemsToBring.map(id => allItems.find(i => i.id === id)?.name).filter(Boolean);
            toast(`Reminder: ${activity.title} in 15 mins!`, {
              description: `Location: ${activity.location || 'Not specified'}. ${items.length > 0 ? 'Bring: ' + items.join(', ') : ''}`,
              duration: 10000,
              icon: <Calendar className="h-5 w-5 text-zinc-900" />
            });
            firebaseStore.updateActivity(activity.id, { reminded: true });
          }
        });
      };

      const interval = setInterval(checkReminders, 30000); // Check every 30s
      return () => clearInterval(interval);
    }
  }, [activities, userProfile, allItems]);

  // Auto-deletion logic
  useEffect(() => {
    if (activities.length === 0) return;
    const checkDeletion = () => {
      const now = Date.now();
      activities.forEach(activity => {
        // Auto-delete 10 mins after start time
        if (now >= activity.startTime + (10 * 60 * 1000)) {
          firebaseStore.deleteActivity(activity.id);
        }
      });
    };
    const interval = setInterval(checkDeletion, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [activities]);
  const handleAddStorage = async () => {
    if (!newStorageName.trim()) return;
    try {
      await firebaseStore.addStorage(
        newStorageName, 
        newStorageLocation.trim() || undefined,
        newStorageImage || undefined
      );
      setNewStorageName("");
      setNewStorageLocation("");
      setNewStorageImage(null);
      setIsAddDialogOpen(false);
      toast.success(`Created "${newStorageName}"`);
    } catch (e) {
      toast.error("Failed to create storage");
    }
  };

  const handleUpdateStorage = async (id: string, updates: Partial<StorageUnit>) => {
    try {
      await firebaseStore.updateStorage(id, updates);
      setEditingStorage(null);
      toast.success("Storage unit updated");
    } catch (e) {
      toast.error("Failed to update storage");
    }
  };

  const handleScanComplete = async (scannedItems: string[]) => {
    if (activeStorageId) {
      try {
        const existingItems = allItems.filter(i => i.storageId === activeStorageId);
        const newItems = scannedItems.filter(name => 
          !existingItems.some(existing => existing.name.toLowerCase() === name.toLowerCase())
        );

        if (newItems.length === 0) {
          toast.info("No new items found (all items already in storage)");
          setIsScannerOpen(false);
          setActiveStorageId(null);
          return;
        }

        await firebaseStore.addItems(activeStorageId, newItems);
        setIsScannerOpen(false);
        setActiveStorageId(null);
        toast.success(`Added ${newItems.length} new items to storage`);
      } catch (e) {
        toast.error("Failed to add items");
      }
    }
  };

  const handleDeleteStorage = async (id: string) => {
    try {
      await firebaseStore.deleteStorage(id);
      toast.info("Storage unit deleted");
    } catch (e) {
      toast.error("Failed to delete storage");
    }
  };

  const handleAddItemToUnit = async (unitId: string) => {
    if (!editingItemName.trim()) return;
    const currentItems = allItems.filter(i => i.storageId === unitId);
    if (currentItems.some(i => i.name.toLowerCase() === editingItemName.trim().toLowerCase())) {
      toast.error("Item already exists");
      return;
    }
    
    try {
      await firebaseStore.addItems(unitId, [{ 
        name: editingItemName.trim(), 
        category: editingItemCategory.trim() || undefined 
      }]);
      setEditingItemName("");
      setEditingItemCategory("");
      toast.success(`Added "${editingItemName}"`);
    } catch (e) {
      toast.error("Failed to add item");
    }
  };

  const handleRemoveItemFromUnit = async (itemId: string, itemName: string) => {
    try {
      await firebaseStore.deleteItem(itemId);
      toast.info(`Removed "${itemName}"`);
    } catch (e) {
      toast.error("Failed to remove item");
    }
  };

  const handleUpdateItem = async (itemId: string, updates: Partial<Item>) => {
    try {
      await firebaseStore.updateItem(itemId, updates);
      setEditingItem(null);
      toast.success("Item updated successfully");
    } catch (e) {
      toast.error("Failed to update item");
    }
  };

  const handleShowMe = (unitId: string) => {
    const element = document.getElementById(`unit-${unitId}`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      element.classList.add("ring-2", "ring-zinc-900", "ring-offset-2");
      setTimeout(() => {
        element.classList.remove("ring-2", "ring-zinc-900", "ring-offset-2");
      }, 3000);
      setSearchQuery("");
      setSelectedUnitId(unitId);
    }
  };

  const fuse = new Fuse<Item>(allItems, {
    keys: ['name', 'category', 'description', 'customLabels'],
    threshold: 0.4,
    includeScore: true,
    ignoreLocation: true
  });

  const filteredResults = searchQuery.trim() 
    ? fuse.search(searchQuery)
        .map(result => ({
          item: result.item,
          unit: storageUnits.find(u => u.id === result.item.storageId)
        }))
        .filter(res => res.unit)
    : [];

  const handleLostMode = async (item: Item) => {
    setLostItem(item);
    setEscalationStep(1);
    setIsAiLoading(true);
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `I am helping a patient find their ${item.name}. It is usually in the ${storageUnits.find(u => u.id === item.storageId)?.name || 'storage'}. 
        Provide 3 short, comforting hints or common places where someone might accidentally leave this item. 
        Keep it simple and friendly for someone with memory issues.`,
      });
      setAiHint(response.text || "Try looking in nearby drawers or on the counter.");
    } catch (e) {
      setAiHint("Try looking in nearby drawers or on the counter.");
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleEscalateLostMode = async () => {
    if (!lostItem) return;
    
    if (escalationStep === 1) {
      setEscalationStep(2);
    } else if (escalationStep === 2) {
      setEscalationStep(3);
      try {
        await firebaseStore.updateItem(lostItem.id, { helpRequested: true });
        toast.success("Caregiver has been notified");
      } catch (e) {
        toast.error("Failed to notify caregiver");
      }
    }
  };

  const categories = Array.from(new Set([
    ...DEFAULT_CATEGORIES, 
    ...(userProfile?.customCategories || []),
    ...allItems.map(item => item.category).filter(Boolean)
  ])) as string[];

  const filteredStorageUnits = selectedCategory 
    ? storageUnits.filter(unit => 
        allItems.some(item => item.storageId === unit.id && item.category === selectedCategory)
      )
    : storageUnits;

  if (!isAuthReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f5]">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
        >
          <Archive className="h-12 w-12 text-zinc-300" />
        </motion.div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#f5f5f5] flex flex-col items-center justify-center p-4 text-center">
        <div className="max-w-md space-y-8">
          <div className="space-y-2">
            <div className="h-20 w-20 bg-zinc-900 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl">
              <Archive className="h-10 w-10 text-white" />
            </div>
            <h1 className="text-4xl font-bold tracking-tight">MemoryMap</h1>
            <p className="text-zinc-500 text-lg">Never forget where your things are. Sign in to start mapping your home.</p>
          </div>
          <Button 
            size="lg" 
            onClick={signIn}
            className="w-full h-16 rounded-2xl bg-zinc-900 text-white text-lg font-semibold hover:bg-zinc-800 transition-all shadow-lg flex items-center justify-center gap-3"
          >
            <LogIn className="h-6 w-6" />
            Sign in with Google
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f5f5] font-sans text-zinc-900 pb-24">
      <Toaster position="top-center" />
      
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-zinc-200 px-4 py-6">
        <div className="max-w-2xl mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-zinc-900 rounded-xl flex items-center justify-center text-white">
                <Archive className="h-6 w-6" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight">MemoryMap</h1>
            </div>
            <div className="flex items-center gap-2">
              {userProfile && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleRole}
                  className="flex items-center gap-2 text-zinc-500 hover:text-zinc-900"
                >
                  {userProfile.role === 'caregiver' ? (
                    <Shield className="h-4 w-4" />
                  ) : (
                    <Heart className="h-4 w-4" />
                  )}
                  <span className="text-xs font-medium capitalize hidden sm:inline">{userProfile.role} Mode</span>
                </Button>
              )}
              <Button 
                variant="outline" 
                size="sm" 
                className="rounded-full border-zinc-200 hidden sm:flex items-center gap-2"
                onClick={() => {
                  setScannerMode('lookup');
                  setIsScannerOpen(true);
                }}
              >
                <Search className="h-4 w-4" />
                Where does this go?
              </Button>
              <span className="text-sm text-zinc-500 hidden sm:inline">{user.displayName}</span>
              <Button variant="ghost" size="icon" onClick={logOut} className="rounded-full">
                <LogOut className="h-5 w-5 text-zinc-400" />
              </Button>
            </div>
          </div>
          
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-400" />
            <Input 
              placeholder="What are you looking for?" 
              className="pl-10 h-14 text-lg rounded-2xl border-zinc-200 bg-white shadow-sm focus:ring-2 focus:ring-zinc-900 transition-all"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && filteredResults.length === 1) {
                  handleShowMe(filteredResults[0].unit!.id);
                }
              }}
            />
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 space-y-6">
        {/* Tab Navigation */}
        <div className="flex p-1 bg-zinc-100 rounded-2xl">
          <button
            onClick={() => setActiveTab('inventory')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-xl transition-all ${
              activeTab === 'inventory' 
                ? "bg-white text-zinc-900 shadow-sm" 
                : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            <Archive className="h-4 w-4" />
            Inventory
          </button>
          <button
            onClick={() => setActiveTab('activities')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-xl transition-all ${
              activeTab === 'activities' 
                ? "bg-white text-zinc-900 shadow-sm" 
                : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            <Calendar className="h-4 w-4" />
            Activities
          </button>
        </div>

        {activeTab === 'inventory' ? (
          <>
            {/* Category Toggles */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
          <Button
            variant={selectedCategory === null ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedCategory(null)}
            className="rounded-full shrink-0 h-8 px-4 text-xs font-medium"
          >
            All
          </Button>
          {categories.map(category => (
            <Button
              key={category}
              variant={selectedCategory === category ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedCategory(selectedCategory === category ? null : category)}
              className="rounded-full shrink-0 h-8 px-4 text-xs font-medium capitalize"
            >
              {category}
            </Button>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsManageCategoriesOpen(true)}
            className="rounded-full shrink-0 h-8 px-3 text-xs font-medium text-zinc-400 hover:text-zinc-900"
          >
            <Plus className="h-3 w-3 mr-1" />
            Edit
          </Button>
        </div>

        {/* Search Results */}
        <AnimatePresence>
          {searchQuery && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-3"
            >
              <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider px-2">
                Search Results
              </h2>
              {filteredResults.length > 0 ? (
                filteredResults.map((res, idx) => (
                  <Card 
                    key={idx} 
                    className="overflow-hidden border-zinc-200 shadow-sm hover:shadow-md transition-all cursor-pointer hover:border-zinc-400 active:scale-[0.98]"
                    onClick={() => handleShowMe(res.unit!.id)}
                  >
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-xl bg-zinc-900 flex items-center justify-center text-white">
                          <MapPin className="h-6 w-6" />
                        </div>
                        <div>
                          <p className="font-semibold text-lg">{res.item.name}</p>
                          <div className="flex items-center gap-2">
                            <p className="text-zinc-500 text-sm flex items-center gap-1">
                              <Archive className="h-3 w-3" />
                              Inside: {res.unit?.name}
                            </p>
                            {res.item.category && (
                              <Badge variant="outline" className="text-[10px] py-0 h-4 border-zinc-200 text-zinc-400 uppercase tracking-wider">
                                {res.item.category}
                              </Badge>
                            )}
                            {userProfile?.role === 'caregiver' && (
                              <div className="flex gap-1">
                                {res.item.isEssential && <Star className="h-3 w-3 text-amber-500 fill-amber-500" />}
                                {res.item.isFrequentlyLost && <HelpCircle className="h-3 w-3 text-blue-500" />}
                                {res.item.isEmergency && <AlertCircle className="h-3 w-3 text-red-500 fill-red-500" />}
                                {res.item.customLabels?.map((label, i) => (
                                  <Badge key={i} variant="secondary" className="text-[8px] py-0 h-3 bg-zinc-100 text-zinc-600 border-none">
                                    {label}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                          {res.item.description && (
                            <p className="text-zinc-400 text-xs mt-1 line-clamp-1 italic">
                              {res.item.description}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          className="rounded-full bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 px-3 flex items-center gap-1.5 font-semibold shadow-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleLostMode(res.item);
                          }}
                        >
                          <HelpCircle className="h-4 w-4" />
                          Lost?
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="rounded-full text-zinc-400 hover:text-zinc-900"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingItem(res.item);
                            firebaseStore.markItemAsSeen(res.item.id);
                          }}
                        >
                          <Info className="h-5 w-5" />
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="rounded-full pointer-events-none"
                        >
                          Show Me
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-zinc-300 space-y-4">
                  <p className="text-zinc-400">No items found matching "{searchQuery}"</p>
                  <Button 
                    variant="outline" 
                    className="rounded-full"
                    onClick={() => {
                      // Just trigger a general help dialog or similar
                      toast.info("Try searching for a different name or category.");
                    }}
                  >
                    Still can't find it?
                  </Button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Help Requests (Caregiver only) */}
        {userProfile?.role === 'caregiver' && allItems.some(i => i.helpRequested) && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-red-500 uppercase tracking-wider px-2 flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              Help Requested
            </h2>
            <div className="grid gap-2">
              {allItems.filter(i => i.helpRequested).map(item => (
                <Card key={item.id} className="border-red-100 bg-red-50/50">
                  <CardContent className="p-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-red-100 flex items-center justify-center text-red-600">
                        <HelpCircle className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-red-900">{item.name}</p>
                        <p className="text-[10px] text-red-700">Patient is looking for this item</p>
                      </div>
                    </div>
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="text-red-600 hover:bg-red-100 rounded-full h-8"
                      onClick={() => firebaseStore.updateItem(item.id, { helpRequested: false })}
                    >
                      Clear
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Storage Units */}
        <div className="space-y-4">
          <div className="flex items-center justify-between px-2">
            <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider">
              Your Storage
            </h2>
          </div>

          <div className="grid gap-4">
            <Button 
              variant="outline" 
              className="w-full h-14 rounded-2xl border-dashed border-zinc-300 text-zinc-500 flex items-center gap-2 sm:hidden"
              onClick={() => {
                setScannerMode('lookup');
                setIsScannerOpen(true);
              }}
            >
              <Search className="h-5 w-5" />
              Where does this go?
            </Button>

            {filteredStorageUnits.map((unit) => {
              const unitItems = allItems.filter(i => i.storageId === unit.id);
              const matchingItems = selectedCategory 
                ? unitItems.filter(i => i.category === selectedCategory)
                : unitItems;
              
              if (selectedCategory && matchingItems.length === 0) return null;

              return (
                <Card 
                  key={unit.id} 
                  id={`unit-${unit.id}`}
                  className={`border-zinc-200 shadow-sm overflow-hidden group transition-all duration-500 cursor-pointer hover:border-zinc-400 ${selectedUnitId === unit.id ? 'ring-2 ring-zinc-900 ring-offset-2' : ''}`}
                  onClick={() => setSelectedUnitId(selectedUnitId === unit.id ? null : unit.id)}
                >
                  {unit.imageUrl && (
                    <div 
                      className="h-32 w-full overflow-hidden cursor-zoom-in"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreviewImageUrl(unit.imageUrl!);
                      }}
                    >
                      <img 
                        src={unit.imageUrl} 
                        alt={unit.name} 
                        className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  )}
                  <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-xl font-bold truncate">{unit.name}</CardTitle>
                        {unit.location && (
                          <Badge variant="secondary" className="bg-zinc-100 text-zinc-500 font-normal rounded-lg px-2 py-0 h-5 text-[10px] uppercase tracking-wider">
                            {unit.location}
                          </Badge>
                        )}
                      </div>
                      <CardDescription className="truncate">
                        {selectedCategory ? (
                          <span className="text-zinc-900 font-medium">
                            {matchingItems.length} {selectedCategory} items
                          </span>
                        ) : (
                          <span>{unitItems.length} items</span>
                        )}
                        {" • "}Updated {new Date(unit.updatedAt).toLocaleDateString()}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="rounded-full h-8 w-8 text-zinc-400 hover:text-zinc-900"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingStorage(unit);
                        }}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="secondary" 
                        size="sm" 
                        className="rounded-full h-8"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveStorageId(unit.id);
                          setScannerMode('inventory');
                          setIsScannerOpen(true);
                        }}
                      >
                        Scan
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <div className="flex flex-wrap gap-2 mt-2">
                      {selectedUnitId === unit.id ? (
                        <div className="w-full space-y-4 pt-2" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider">
                              {selectedCategory ? `${selectedCategory} Items` : 'All Items'} ({matchingItems.length})
                            </h3>
                          </div>
                          
                          <div className="flex flex-col gap-2">
                            <div className="flex gap-2">
                              <Input 
                                placeholder="Item name..." 
                                value={editingItemName}
                                onChange={(e) => setEditingItemName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleAddItemToUnit(unit.id)}
                                className="h-10 rounded-xl border-zinc-200"
                              />
                              <Input 
                                placeholder="Category (optional)..." 
                                value={editingItemCategory}
                                onChange={(e) => setEditingItemCategory(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleAddItemToUnit(unit.id)}
                                className="h-10 rounded-xl border-zinc-200 w-1/3"
                              />
                              <Button 
                                size="icon" 
                                onClick={() => handleAddItemToUnit(unit.id)}
                                className="h-10 w-10 rounded-xl bg-zinc-900 text-white shrink-0"
                              >
                                <Plus className="h-5 w-5" />
                              </Button>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {categories.slice(0, 8).map(cat => (
                                <button
                                  key={cat}
                                  type="button"
                                  onClick={() => setEditingItemCategory(editingItemCategory === cat ? "" : cat)}
                                  className={`text-[10px] px-2 py-1 rounded-full border transition-all ${
                                    editingItemCategory === cat 
                                      ? "bg-zinc-900 text-white border-zinc-900" 
                                      : "bg-white text-zinc-500 border-zinc-200 hover:border-zinc-400"
                                  }`}
                                >
                                  {cat}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {matchingItems.map((item) => (
                              <div key={item.id} className="bg-zinc-100 p-3 rounded-xl flex items-center justify-between group/item">
                                <div className="flex items-center gap-2 min-w-0">
                                  <Archive className="h-4 w-4 text-zinc-400 shrink-0" />
                                  <div className="flex flex-col min-w-0">
                                    <span className="text-sm font-medium truncate">{item.name}</span>
                                    <div className="flex items-center gap-2">
                                      {item.category && (
                                        <span className="text-[10px] text-zinc-400 uppercase tracking-wider">{item.category}</span>
                                      )}
                                      {userProfile?.role === 'caregiver' && (
                                        <div className="flex flex-wrap gap-1">
                                          {item.isEssential && <Star className="h-3 w-3 text-amber-500 fill-amber-500" />}
                                          {item.isFrequentlyLost && <HelpCircle className="h-3 w-3 text-blue-500" />}
                                          {item.isEmergency && <AlertCircle className="h-3 w-3 text-red-500 fill-red-500" />}
                                          {item.customLabels?.map((label, i) => (
                                            <Badge key={i} variant="secondary" className="text-[8px] py-0 h-3 bg-zinc-200 text-zinc-600 border-none">
                                              {label}
                                            </Badge>
                                          ))}
                                        </div>
                                      )}
                                      {item.description && (
                                        <span className="text-[10px] text-zinc-300 italic truncate max-w-[100px]">— {item.description}</span>
                                      )}
                                      {item.lastSeenAt && (
                                        <span className="text-[10px] text-zinc-400 ml-auto">
                                          Seen {new Date(item.lastSeenAt).toLocaleDateString()}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="secondary"
                                    size="icon"
                                    className="h-7 w-7 rounded-full bg-amber-50 text-amber-600 hover:bg-amber-100 border border-amber-100 transition-all shadow-sm"
                                    onClick={() => handleLostMode(item)}
                                    title="Help me find this"
                                  >
                                    <HelpCircle className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 rounded-full text-zinc-400 hover:text-zinc-900 hover:bg-zinc-200 opacity-0 group-hover/item:opacity-100 transition-all"
                                    onClick={() => {
                                      setEditingItem(item);
                                      firebaseStore.markItemAsSeen(item.id);
                                    }}
                                  >
                                    <Info className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 rounded-full text-zinc-400 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover/item:opacity-100 transition-all"
                                    onClick={() => handleRemoveItemFromUnit(item.id, item.name)}
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <>
                          {unitItems.slice(0, 5).map((item) => (
                            <Badge key={item.id} variant="secondary" className="bg-zinc-100 text-zinc-600 border-none flex items-center gap-1">
                              {item.name}
                              {item.category && (
                                <span className="text-[8px] opacity-40 uppercase tracking-tighter">({item.category})</span>
                              )}
                            </Badge>
                          ))}
                          {unitItems.length > 5 && (
                            <Badge variant="outline" className="border-zinc-200 text-zinc-400">
                              +{unitItems.length - 5} more
                            </Badge>
                          )}
                        </>
                      )}
                      {unitItems.length === 0 && (
                        <p className="text-zinc-400 text-sm italic">Empty. Tap scan to add items.</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {storageUnits.length === 0 && (
              <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-zinc-200">
                <Archive className="h-12 w-12 text-zinc-200 mx-auto mb-4" />
                <p className="text-zinc-500 font-medium">No storage units yet</p>
                <p className="text-zinc-400 text-sm">Add your first cupboard or drawer to start</p>
              </div>
            )}
          </div>
        </div>
      </>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between px-2">
              <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider">
                Upcoming Activities
              </h2>
              {userProfile?.role === 'caregiver' && (
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="rounded-full h-8 px-3 text-xs"
                  onClick={() => setIsAddActivityOpen(true)}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add Activity
                </Button>
              )}
            </div>

            <div className="space-y-4">
              {activities
                .sort((a, b) => a.startTime - b.startTime)
                .filter(a => a.startTime > Date.now() - (60 * 60 * 1000)) // Show current and future
                .map(activity => {
                  const isImminent = activity.startTime - Date.now() <= 60 * 60 * 1000 && activity.startTime > Date.now();
                  const isPast = activity.startTime < Date.now();
                  
                  return (
                  <Card 
                    key={activity.id} 
                    className={`overflow-hidden border-zinc-200 shadow-sm transition-all ${
                      activity.completed 
                        ? "opacity-60 grayscale" 
                        : isImminent 
                          ? "ring-2 ring-zinc-900 border-zinc-900 shadow-lg scale-[1.02]" 
                          : ""
                    }`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-4">
                          <div className={`h-12 w-12 rounded-xl flex items-center justify-center transition-colors ${
                            isImminent ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600"
                          }`}>
                            <Calendar className="h-6 w-6" />
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <h3 className="font-bold text-lg">{activity.title}</h3>
                              {isImminent && !activity.completed && (
                                <Badge className="bg-zinc-900 text-white animate-pulse">Starting Soon</Badge>
                              )}
                              {activity.completed && (
                                <Badge variant="secondary" className="bg-green-100 text-green-700 border-none">Completed</Badge>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-3 text-sm text-zinc-500">
                              <span className={`flex items-center gap-1 ${isImminent && !activity.completed ? "text-zinc-900 font-bold" : ""}`}>
                                <Clock className="h-3.5 w-3.5" />
                                {new Date(activity.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                              {activity.location && (
                                <span className="flex items-center gap-1">
                                  <MapPin className="h-3.5 w-3.5" />
                                  {activity.location}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {userProfile?.role === 'caregiver' && (
                            <>
                              <Button 
                                variant="ghost" 
                                size="sm"
                                className={`rounded-full h-8 px-3 text-xs flex items-center gap-1.5 ${
                                  activity.completed 
                                    ? "text-green-600 hover:text-green-700 hover:bg-green-50" 
                                    : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100"
                                }`}
                                onClick={() => firebaseStore.toggleActivityCompletion(activity.id, !activity.completed)}
                              >
                                {activity.completed ? <CheckCircle2 className="h-3.5 w-3.5" /> : <div className="h-3.5 w-3.5 rounded-full border-2 border-zinc-300" />}
                                {activity.completed ? "Completed" : "Mark Done"}
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="text-zinc-400 hover:text-red-500 h-8 w-8"
                                onClick={() => firebaseStore.deleteActivity(activity.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>

                    {activity.itemsToBring.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-zinc-100">
                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">Items to bring:</p>
                        <div className="flex flex-wrap gap-2">
                          {activity.itemsToBring.map(itemId => {
                            const item = allItems.find(i => i.id === itemId);
                            return item ? (
                              <Badge key={itemId} variant="secondary" className="bg-zinc-100 text-zinc-700 border-none flex items-center gap-1.5 py-1 px-2.5">
                                <CheckCircle2 className="h-3 w-3 text-zinc-400" />
                                {item.name}
                              </Badge>
                            ) : null;
                          })}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
                  );
                })}

              {activities.length === 0 && (
                <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-zinc-200">
                  <Calendar className="h-12 w-12 text-zinc-200 mx-auto mb-4" />
                  <p className="text-zinc-500 font-medium">No activities scheduled</p>
                  <p className="text-zinc-400 text-sm">Activities and reminders will appear here</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Add Activity Dialog */}
      <Dialog open={isAddActivityOpen} onOpenChange={setIsAddActivityOpen}>
        <DialogContent className="sm:max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle>Schedule Activity</DialogTitle>
            <DialogDescription>Remind the patient what to bring and where to go.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-500">Activity Title</label>
              <Input 
                placeholder="e.g. Doctor's Appointment" 
                value={newActivityTitle}
                onChange={(e) => setNewActivityTitle(e.target.value)}
                className="h-12 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-500">Date & Time</label>
              <Input 
                type="datetime-local"
                value={newActivityTime}
                onChange={(e) => setNewActivityTime(e.target.value)}
                className="h-12 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-500">Location</label>
              <Input 
                placeholder="e.g. City Hospital" 
                value={newActivityLocation}
                onChange={(e) => setNewActivityLocation(e.target.value)}
                className="h-12 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-500">Items to Bring</label>
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                <Input 
                  placeholder="Search items..." 
                  value={activityItemSearchQuery}
                  onChange={(e) => setActivityItemSearchQuery(e.target.value)}
                  className="h-10 pl-9 rounded-xl text-sm"
                />
              </div>
              <div className="grid grid-cols-1 gap-2 max-h-[200px] overflow-y-auto p-1 border rounded-xl">
                {allItems
                  .filter(item => item.name.toLowerCase().includes(activityItemSearchQuery.toLowerCase()))
                  .map(item => (
                  <div key={item.id} className="flex items-center space-x-2 p-2 hover:bg-zinc-50 rounded-lg transition-colors">
                    <Checkbox 
                      id={`item-${item.id}`}
                      checked={newActivityItems.includes(item.id)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setNewActivityItems([...newActivityItems, item.id]);
                        } else {
                          setNewActivityItems(newActivityItems.filter(id => id !== item.id));
                        }
                      }}
                    />
                    <label htmlFor={`item-${item.id}`} className="text-sm text-zinc-700 flex-1 cursor-pointer">{item.name}</label>
                  </div>
                ))}
                {allItems.filter(item => item.name.toLowerCase().includes(activityItemSearchQuery.toLowerCase())).length === 0 && (
                  <p className="text-center py-4 text-xs text-zinc-400">No items found</p>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button 
              onClick={handleAddActivity}
              className="w-full h-12 rounded-xl bg-zinc-900 text-white"
            >
              Schedule Activity
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Floating Action Button */}
      {activeTab === 'inventory' && (
        <div className="fixed bottom-8 left-0 right-0 flex justify-center px-4 pointer-events-none">
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger 
            render={
              <Button 
                size="lg" 
                className="h-16 px-8 rounded-full shadow-2xl bg-zinc-900 text-white hover:bg-zinc-800 pointer-events-auto flex items-center gap-3"
              />
            }
          >
            <Plus className="h-6 w-6" />
            <span className="text-lg font-semibold">Add Storage</span>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md rounded-3xl">
            <DialogHeader>
              <DialogTitle>New Storage Unit</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-500">Photo (Optional)</label>
                <div className="relative h-40 w-full bg-zinc-100 rounded-2xl overflow-hidden border-2 border-dashed border-zinc-200 flex items-center justify-center">
                  {newStorageImage ? (
                    <div className="relative w-full h-full">
                      <img src={newStorageImage} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      <Button 
                        size="icon" 
                        variant="destructive" 
                        className="absolute top-2 right-2 rounded-full h-8 w-8"
                        onClick={() => setNewStorageImage(null)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : isCapturingUnitImage ? (
                    <div className="relative w-full h-full">
                      <video ref={unitVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
                      <canvas ref={unitCanvasRef} className="hidden" />
                      <Button 
                        size="icon" 
                        className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full h-10 w-10 bg-white text-black hover:bg-zinc-200"
                        onClick={captureUnitPhoto}
                      >
                        <Camera className="h-5 w-5" />
                      </Button>
                    </div>
                  ) : (
                    <Button 
                      variant="ghost" 
                      className="flex flex-col gap-2 h-full w-full"
                      onClick={() => setIsCapturingUnitImage(true)}
                    >
                      <Camera className="h-8 w-8 text-zinc-400" />
                      <span className="text-zinc-400 text-xs">Take a photo of the location</span>
                    </Button>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-500">Name</label>
                <Input 
                  placeholder="e.g. Cupboard, Drawer, Box" 
                  value={newStorageName}
                  onChange={(e) => setNewStorageName(e.target.value)}
                  className="h-12 rounded-xl"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-500">Location</label>
                <Input 
                  placeholder="e.g. Kitchen, Bedroom, Garage" 
                  value={newStorageLocation}
                  onChange={(e) => setNewStorageLocation(e.target.value)}
                  className="h-12 rounded-xl"
                />
              </div>
            </div>
            <DialogFooter>
              <Button 
                onClick={handleAddStorage} 
                className="w-full h-12 rounded-xl bg-zinc-900 text-white"
              >
                Create Storage
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      )}

      {/* Category Management Dialog */}
      <Dialog open={isManageCategoriesOpen} onOpenChange={setIsManageCategoriesOpen}>
        <DialogContent className="sm:max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle>Manage Categories</DialogTitle>
            <DialogDescription>
              Add or remove categories from your suggestions.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex gap-2">
              <Input 
                placeholder="New category name..." 
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddCustomCategory()}
                className="h-12 rounded-xl"
              />
              <Button 
                onClick={handleAddCustomCategory}
                className="h-12 w-12 rounded-xl bg-zinc-900 text-white shrink-0"
              >
                <Plus className="h-6 w-6" />
              </Button>
            </div>
            
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Your Categories</h4>
              <div className="flex flex-wrap gap-2">
                {userProfile?.customCategories?.map((cat, i) => (
                  <Badge key={i} variant="secondary" className="pl-3 pr-1 py-1.5 flex items-center gap-2 bg-zinc-100 text-zinc-700 border-zinc-200 rounded-full">
                    {cat}
                    <button 
                      onClick={() => handleDeleteCustomCategory(cat)}
                      className="p-1 hover:bg-zinc-200 rounded-full transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                {(!userProfile?.customCategories || userProfile.customCategories.length === 0) && (
                  <p className="text-zinc-400 text-sm italic">No custom categories yet.</p>
                )}
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Default Categories</h4>
              <div className="flex flex-wrap gap-2">
                {DEFAULT_CATEGORIES.map((cat, i) => (
                  <Badge key={i} variant="outline" className="px-3 py-1.5 bg-white text-zinc-400 border-zinc-200 rounded-full">
                    {cat}
                  </Badge>
                ))}
              </div>
              <p className="text-[10px] text-zinc-400 italic">Default categories cannot be removed.</p>
            </div>
          </div>
          <DialogFooter>
            <Button 
              onClick={() => setIsManageCategoriesOpen(false)} 
              className="w-full h-12 rounded-xl bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Storage Edit Dialog */}
      <Dialog open={!!editingStorage} onOpenChange={(open) => !open && setEditingStorage(null)}>
        <DialogContent className="sm:max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle>Edit Storage Unit</DialogTitle>
          </DialogHeader>
          {editingStorage && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-500">Name</label>
                <Input 
                  value={editingStorage.name}
                  onChange={(e) => setEditingStorage({ ...editingStorage, name: e.target.value })}
                  className="h-12 rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-500">Location</label>
                <Input 
                  value={editingStorage.location || ""}
                  onChange={(e) => setEditingStorage({ ...editingStorage, location: e.target.value })}
                  className="h-12 rounded-xl"
                  placeholder="e.g. Kitchen, Bedroom"
                />
              </div>
              <div className="pt-4 border-t border-zinc-100">
                <Button 
                  variant="ghost" 
                  className="w-full text-red-500 hover:text-red-600 hover:bg-red-50 rounded-xl h-12 flex items-center justify-center gap-2"
                  onClick={() => {
                    handleDeleteStorage(editingStorage.id);
                    setEditingStorage(null);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete Storage Unit
                </Button>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button 
              onClick={() => editingStorage && handleUpdateStorage(editingStorage.id, {
                name: editingStorage.name,
                location: editingStorage.location || undefined
              })} 
              className="w-full h-12 rounded-xl bg-zinc-900 text-white"
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Item Edit Dialog */}
      <Dialog open={!!editingItem} onOpenChange={(open) => !open && setEditingItem(null)}>
        <DialogContent className="sm:max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle>Edit Item Details</DialogTitle>
          </DialogHeader>
          {editingItem && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-500">Item Name</label>
                <Input 
                  value={editingItem.name}
                  onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                  className="h-12 rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-500">Category</label>
                <Input 
                  value={editingItem.category || ""}
                  onChange={(e) => setEditingItem({ ...editingItem, category: e.target.value })}
                  className="h-12 rounded-xl"
                  placeholder="e.g. Kitchen, Tools, etc."
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {categories.map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setEditingItem({ 
                        ...editingItem, 
                        category: editingItem.category === cat ? "" : cat 
                      })}
                      className={`text-[10px] px-2.5 py-1.5 rounded-full border transition-all ${
                        editingItem.category === cat 
                          ? "bg-zinc-900 text-white border-zinc-900" 
                          : "bg-white text-zinc-500 border-zinc-200 hover:border-zinc-400"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-500">Location</label>
                <select 
                  className="w-full h-12 rounded-xl border border-zinc-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  value={editingItem.storageId}
                  onChange={(e) => setEditingItem({ ...editingItem, storageId: e.target.value })}
                >
                  {storageUnits.map(unit => (
                    <option key={unit.id} value={unit.id}>{unit.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-500">Description</label>
                <textarea 
                  className="w-full min-h-[100px] rounded-xl border border-zinc-200 bg-white p-3 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  value={editingItem.description || ""}
                  onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })}
                  placeholder="Add more details about this item..."
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-500">Backup Location</label>
                <Input 
                  value={editingItem.backupLocation || ""}
                  onChange={(e) => setEditingItem({ ...editingItem, backupLocation: e.target.value })}
                  className="h-12 rounded-xl"
                  placeholder="Where else might this be kept?"
                />
                <p className="text-[10px] text-zinc-400">This will be shown to the patient if they can't find the item.</p>
              </div>

              {userProfile?.role === 'caregiver' && (
                <div className="space-y-4 pt-4 border-t border-zinc-100">
                  <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                    <Shield className="h-3 w-3" />
                    Caregiver Controls
                  </h4>
                  <div className="grid grid-cols-1 gap-3">
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="essential" 
                        checked={!!editingItem.isEssential} 
                        onCheckedChange={(checked) => setEditingItem({ ...editingItem, isEssential: !!checked })}
                      />
                      <label htmlFor="essential" className="text-sm font-medium leading-none flex items-center gap-2">
                        <Star className="h-4 w-4 text-amber-500" />
                        Essential Item
                      </label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="frequentlyLost" 
                        checked={!!editingItem.isFrequentlyLost} 
                        onCheckedChange={(checked) => setEditingItem({ ...editingItem, isFrequentlyLost: !!checked })}
                      />
                      <label htmlFor="frequentlyLost" className="text-sm font-medium leading-none flex items-center gap-2">
                        <HelpCircle className="h-4 w-4 text-blue-500" />
                        Frequently Lost
                      </label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="emergency" 
                        checked={!!editingItem.isEmergency} 
                        onCheckedChange={(checked) => setEditingItem({ ...editingItem, isEmergency: !!checked })}
                      />
                      <label htmlFor="emergency" className="text-sm font-medium leading-none flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-red-500" />
                        Emergency Item
                      </label>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-500">Caregiver Notes (Private)</label>
                    <textarea 
                      className="w-full min-h-[80px] rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                      value={editingItem.caregiverNotes || ""}
                      onChange={(e) => setEditingItem({ ...editingItem, caregiverNotes: e.target.value })}
                      placeholder="Add notes for yourself about this item..."
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-500">Custom Labels</label>
                    <div className="flex gap-2">
                      <Input 
                        placeholder="e.g. fragile, recyclable" 
                        value={newCustomLabel}
                        onChange={(e) => setNewCustomLabel(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (newCustomLabel.trim()) {
                              const labels = editingItem.customLabels || [];
                              if (!labels.includes(newCustomLabel.trim())) {
                                setEditingItem({ ...editingItem, customLabels: [...labels, newCustomLabel.trim()] });
                              }
                              setNewCustomLabel("");
                            }
                          }
                        }}
                        className="h-10 rounded-xl"
                      />
                      <Button 
                        size="icon" 
                        variant="outline"
                        onClick={() => {
                          if (newCustomLabel.trim()) {
                            const labels = editingItem.customLabels || [];
                            if (!labels.includes(newCustomLabel.trim())) {
                              setEditingItem({ ...editingItem, customLabels: [...labels, newCustomLabel.trim()] });
                            }
                            setNewCustomLabel("");
                          }
                        }}
                        className="h-10 w-10 rounded-xl"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {editingItem.customLabels?.map((label, i) => (
                        <Badge key={i} variant="secondary" className="pl-2 pr-1 py-1 flex items-center gap-1 bg-zinc-100 text-zinc-700 border-zinc-200">
                          {label}
                          <button 
                            onClick={() => setEditingItem({ ...editingItem, customLabels: editingItem.customLabels?.filter((_, idx) => idx !== i) })}
                            className="p-0.5 hover:bg-zinc-200 rounded-full"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {editingItem.lastSeenAt && (
                <div className="pt-2">
                  <p className="text-[10px] text-zinc-400 uppercase tracking-widest">
                    Last seen: {new Date(editingItem.lastSeenAt).toLocaleString()}
                  </p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button 
              onClick={() => editingItem && handleUpdateItem(editingItem.id, {
                name: editingItem.name,
                category: editingItem.category || undefined,
                storageId: editingItem.storageId,
                description: editingItem.description || undefined,
                isEssential: editingItem.isEssential,
                isFrequentlyLost: editingItem.isFrequentlyLost,
                isEmergency: editingItem.isEmergency,
                caregiverNotes: editingItem.caregiverNotes || undefined,
                backupLocation: editingItem.backupLocation || undefined,
                customLabels: editingItem.customLabels || undefined
              })} 
              className="w-full h-12 rounded-xl bg-zinc-900 text-white"
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Role Selection Dialog */}
      <Dialog open={isRoleSelectionOpen} onOpenChange={(open) => !open && userProfile && setIsRoleSelectionOpen(false)}>
        <DialogContent className="sm:max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-2xl text-center">Who is using this app?</DialogTitle>
            <DialogDescription className="text-center">
              Choose your role to customize your experience.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4 py-6">
            <Button 
              variant="outline" 
              disabled={isSettingRole}
              className="h-32 rounded-2xl border-2 hover:border-zinc-900 flex flex-col gap-3 group relative overflow-hidden"
              onClick={() => handleRoleSelection('caregiver')}
            >
              {isSettingRole && (
                <div className="absolute inset-0 bg-white/50 flex items-center justify-center z-10">
                  <motion.div 
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  >
                    <Archive className="h-6 w-6 text-zinc-400" />
                  </motion.div>
                </div>
              )}
              <Shield className="h-8 w-8 text-zinc-400 group-hover:text-zinc-900" />
              <div className="text-center">
                <p className="font-bold text-lg">Caregiver</p>
                <p className="text-xs text-zinc-500">I am managing items for someone else</p>
              </div>
            </Button>
            <Button 
              variant="outline" 
              disabled={isSettingRole}
              className="h-32 rounded-2xl border-2 hover:border-zinc-900 flex flex-col gap-3 group relative overflow-hidden"
              onClick={() => handleRoleSelection('patient')}
            >
              {isSettingRole && (
                <div className="absolute inset-0 bg-white/50 flex items-center justify-center z-10">
                  <motion.div 
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  >
                    <Archive className="h-6 w-6 text-zinc-400" />
                  </motion.div>
                </div>
              )}
              <Heart className="h-8 w-8 text-zinc-400 group-hover:text-zinc-900" />
              <div className="text-center">
                <p className="font-bold text-lg">Patient / User</p>
                <p className="text-xs text-zinc-500">I am using this to find my own things</p>
              </div>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Scanner Overlay */}
      <AnimatePresence>
        {isScannerOpen && (
          <Scanner 
            mode={scannerMode}
            storageUnits={storageUnits}
            allItems={allItems}
            onScanComplete={handleScanComplete}
            onLookupComplete={(unitId) => {
              setIsScannerOpen(false);
              handleShowMe(unitId);
            }}
            onClose={() => setIsScannerOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Lost Mode Escalation Dialog */}
      <Dialog open={!!lostItem} onOpenChange={(open) => !open && setLostItem(null)}>
        <DialogContent className="sm:max-w-md rounded-3xl overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-zinc-900" />
              Can't find your {lostItem?.name}?
            </DialogTitle>
          </DialogHeader>
          
          <div className="py-4">
            <AnimatePresence mode="wait">
              {escalationStep === 1 && (
                <motion.div
                  key="step1"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-4"
                >
                  <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-100">
                    <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                      <Sparkles className="h-3 w-3 text-amber-500" />
                      AI Guidance
                    </p>
                    {isAiLoading ? (
                      <div className="flex items-center gap-3 py-2">
                        <motion.div 
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        >
                          <Archive className="h-4 w-4 text-zinc-400" />
                        </motion.div>
                        <p className="text-sm text-zinc-500 italic">Thinking of places to look...</p>
                      </div>
                    ) : (
                      <p className="text-sm text-zinc-700 leading-relaxed whitespace-pre-wrap">
                        {aiHint}
                      </p>
                    )}
                  </div>
                  <Button 
                    className="w-full h-12 rounded-xl bg-zinc-900 text-white"
                    onClick={handleEscalateLostMode}
                  >
                    Still can't find it
                  </Button>
                </motion.div>
              )}

              {escalationStep === 2 && (
                <motion.div
                  key="step2"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-4"
                >
                  <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100">
                    <p className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                      <MapPin className="h-3 w-3" />
                      Backup Location
                    </p>
                    <p className="text-sm text-blue-900 font-medium">
                      Check here: <span className="font-bold underline">{lostItem?.backupLocation || "Common nearby surfaces or drawers."}</span>
                    </p>
                  </div>
                  <Button 
                    className="w-full h-12 rounded-xl bg-zinc-900 text-white"
                    onClick={handleEscalateLostMode}
                  >
                    I need more help
                  </Button>
                </motion.div>
              )}

              {escalationStep === 3 && (
                <motion.div
                  key="step3"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-4"
                >
                  <div className="bg-red-50 p-4 rounded-2xl border border-red-100 flex items-center gap-4">
                    <div className="h-12 w-12 rounded-full bg-red-500 flex items-center justify-center text-white shrink-0">
                      <Shield className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-red-900">Caregiver Alerted</p>
                      <p className="text-xs text-red-700">Don't worry, we've sent a message to your caregiver to help you find it.</p>
                    </div>
                  </div>
                  <Button 
                    variant="outline"
                    className="w-full h-12 rounded-xl border-zinc-200"
                    onClick={() => setLostItem(null)}
                  >
                    Close
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </DialogContent>
      </Dialog>

      {/* Image Preview Overlay */}
      <AnimatePresence>
        {previewImageUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center p-4"
            onClick={() => setPreviewImageUrl(null)}
          >
            <Button 
              variant="ghost" 
              size="icon" 
              className="absolute top-6 right-6 text-white hover:bg-white/10 rounded-full z-[110]"
              onClick={() => setPreviewImageUrl(null)}
            >
              <X className="h-8 w-8" />
            </Button>
            <motion.img
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              src={previewImageUrl}
              className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
              onClick={(e) => e.stopPropagation()}
              referrerPolicy="no-referrer"
            />
            <p className="text-white/60 text-sm mt-6 font-medium">Tap anywhere to close</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

