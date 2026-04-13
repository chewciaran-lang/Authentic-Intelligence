import React, { useState, useEffect } from "react";
import { Search, Plus, Archive, MapPin, Trash2, ChevronRight, Info, MoreVertical, LogIn, LogOut, User, Camera, X, Shield, Heart, AlertCircle, Star, HelpCircle, Tag } from "lucide-react";
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
import { StorageUnit, Item, UserProfile } from "./types";
import { motion, AnimatePresence } from "motion/react";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isRoleSelectionOpen, setIsRoleSelectionOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [storageUnits, setStorageUnits] = useState<StorageUnit[]>([]);
  const [allItems, setAllItems] = useState<Item[]>([]);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerMode, setScannerMode] = useState<'inventory' | 'lookup'>('inventory');
  const [activeStorageId, setActiveStorageId] = useState<string | null>(null);
  const [newStorageName, setNewStorageName] = useState("");
  const [newStorageImage, setNewStorageImage] = useState<string | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isCapturingUnitImage, setIsCapturingUnitImage] = useState(false);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [editingItemName, setEditingItemName] = useState("");
  const [editingItemCategory, setEditingItemCategory] = useState("");
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [newCustomLabel, setNewCustomLabel] = useState("");
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
    if (user) {
      await firebaseStore.createUserProfile(user.uid, user.email || "", role);
      const profile = await firebaseStore.getUserProfile(user.uid);
      setUserProfile(profile);
      setIsRoleSelectionOpen(false);
      toast.success(`Welcome! You are now set up as a ${role}.`);
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

  useEffect(() => {
    if (user) {
      const unsub = firebaseStore.subscribeToData(({ storageUnits, items }) => {
        setStorageUnits(storageUnits);
        setAllItems(items);
      });
      return () => unsub();
    } else {
      setStorageUnits([]);
      setAllItems([]);
    }
  }, [user]);

  const handleAddStorage = async () => {
    if (!newStorageName.trim()) return;
    try {
      await firebaseStore.addStorage(newStorageName, newStorageImage || undefined);
      setNewStorageName("");
      setNewStorageImage(null);
      setIsAddDialogOpen(false);
      toast.success(`Created "${newStorageName}"`);
    } catch (e) {
      toast.error("Failed to create storage");
    }
  };

  const handleScanComplete = async (items: string[]) => {
    if (activeStorageId) {
      try {
        await firebaseStore.updateItems(activeStorageId, items);
        setIsScannerOpen(false);
        setActiveStorageId(null);
        toast.success(`Updated items in storage`);
      } catch (e) {
        toast.error("Failed to update items");
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
    
    const itemsToUpdate = currentItems.map(i => ({ name: i.name, category: i.category }));
    
    try {
      await firebaseStore.updateItems(unitId, [...itemsToUpdate, { 
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

  const handleRemoveItemFromUnit = async (unitId: string, itemName: string) => {
    const currentItems = allItems.filter(i => i.storageId === unitId);
    const itemsToUpdate = currentItems
      .filter(i => i.name !== itemName)
      .map(i => ({ name: i.name, category: i.category }));
    try {
      await firebaseStore.updateItems(unitId, itemsToUpdate);
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

  const filteredResults = searchQuery.trim() 
    ? allItems
        .filter(item => 
          item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.category?.toLowerCase().includes(searchQuery.toLowerCase())
        )
        .map(item => ({
          item,
          unit: storageUnits.find(u => u.id === item.storageId)
        }))
        .filter(res => res.unit)
    : [];

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
                  className="hidden sm:flex items-center gap-2 text-zinc-500 hover:text-zinc-900"
                >
                  {userProfile.role === 'caregiver' ? (
                    <Shield className="h-4 w-4" />
                  ) : (
                    <Heart className="h-4 w-4" />
                  )}
                  <span className="text-xs font-medium capitalize">{userProfile.role} Mode</span>
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
                <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-zinc-300">
                  <p className="text-zinc-400">No items found matching "{searchQuery}"</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

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

            {storageUnits.map((unit) => {
              const unitItems = allItems.filter(i => i.storageId === unit.id);
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
                    <div>
                      <CardTitle className="text-xl font-bold">{unit.name}</CardTitle>
                      <CardDescription>
                        {unitItems.length} items • Updated {new Date(unit.updatedAt).toLocaleDateString()}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button 
                        variant="secondary" 
                        size="sm" 
                        className="rounded-full"
                        onClick={() => {
                          setActiveStorageId(unit.id);
                          setScannerMode('inventory');
                          setIsScannerOpen(true);
                        }}
                      >
                        Scan Items
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="rounded-full text-zinc-400 hover:text-red-500"
                        onClick={() => handleDeleteStorage(unit.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <div className="flex flex-wrap gap-2 mt-2">
                      {selectedUnitId === unit.id ? (
                        <div className="w-full space-y-4 pt-2" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider">All Items ({unitItems.length})</h3>
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
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {unitItems.map((item) => (
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
                                    onClick={() => handleRemoveItemFromUnit(unit.id, item.name)}
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
      </main>

      {/* Floating Action Button */}
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
                  placeholder="e.g. Kitchen Cupboard 1" 
                  value={newStorageName}
                  onChange={(e) => setNewStorageName(e.target.value)}
                  className="h-12 rounded-xl"
                  autoFocus
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
                        checked={editingItem.isEssential} 
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
                        checked={editingItem.isFrequentlyLost} 
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
                        checked={editingItem.isEmergency} 
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
              className="h-32 rounded-2xl border-2 hover:border-zinc-900 flex flex-col gap-3 group"
              onClick={() => handleRoleSelection('caregiver')}
            >
              <Shield className="h-8 w-8 text-zinc-400 group-hover:text-zinc-900" />
              <div className="text-center">
                <p className="font-bold text-lg">Caregiver</p>
                <p className="text-xs text-zinc-500">I am managing items for someone else</p>
              </div>
            </Button>
            <Button 
              variant="outline" 
              className="h-32 rounded-2xl border-2 hover:border-zinc-900 flex flex-col gap-3 group"
              onClick={() => handleRoleSelection('patient')}
            >
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

