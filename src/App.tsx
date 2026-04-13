import React, { useState, useEffect } from "react";
import { Search, Plus, Archive, MapPin, Trash2, ChevronRight, Info, MoreVertical, LogIn, LogOut, User, Camera, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Scanner } from "./components/Scanner";
import { firebaseStore } from "./lib/storage";
import { auth, signIn, logOut } from "./lib/firebase";
import { onAuthStateChanged, User as FirebaseUser } from "firebase/auth";
import { StorageUnit, Item } from "./types";
import { motion, AnimatePresence } from "motion/react";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [storageUnits, setStorageUnits] = useState<StorageUnit[]>([]);
  const [allItems, setAllItems] = useState<Item[]>([]);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [activeStorageId, setActiveStorageId] = useState<string | null>(null);
  const [newStorageName, setNewStorageName] = useState("");
  const [newStorageImage, setNewStorageImage] = useState<string | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isCapturingUnitImage, setIsCapturingUnitImage] = useState(false);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [editingItemName, setEditingItemName] = useState("");
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
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
    });
    return () => unsub();
  }, []);

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
    const currentItems = allItems.filter(i => i.storageId === unitId).map(i => i.name);
    if (currentItems.includes(editingItemName.trim())) {
      toast.error("Item already exists");
      return;
    }
    
    try {
      await firebaseStore.updateItems(unitId, [...currentItems, editingItemName.trim()]);
      setEditingItemName("");
      toast.success(`Added "${editingItemName}"`);
    } catch (e) {
      toast.error("Failed to add item");
    }
  };

  const handleRemoveItemFromUnit = async (unitId: string, itemName: string) => {
    const currentItems = allItems.filter(i => i.storageId === unitId).map(i => i.name);
    try {
      await firebaseStore.updateItems(unitId, currentItems.filter(name => name !== itemName));
      toast.info(`Removed "${itemName}"`);
    } catch (e) {
      toast.error("Failed to remove item");
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
        .filter(item => item.name.toLowerCase().includes(searchQuery.toLowerCase()))
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
                  <Card key={idx} className="overflow-hidden border-zinc-200 shadow-sm hover:shadow-md transition-shadow">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-xl bg-zinc-900 flex items-center justify-center text-white">
                          <MapPin className="h-6 w-6" />
                        </div>
                        <div>
                          <p className="font-semibold text-lg">{res.item.name}</p>
                          <p className="text-zinc-500 text-sm flex items-center gap-1">
                            <Archive className="h-3 w-3" />
                            Inside: {res.unit?.name}
                          </p>
                        </div>
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="rounded-full"
                        onClick={() => handleShowMe(res.unit!.id)}
                      >
                        Show Me
                      </Button>
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
                          
                          <div className="flex gap-2">
                            <Input 
                              placeholder="Add item manually..." 
                              value={editingItemName}
                              onChange={(e) => setEditingItemName(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && handleAddItemToUnit(unit.id)}
                              className="h-10 rounded-xl border-zinc-200"
                            />
                            <Button 
                              size="icon" 
                              onClick={() => handleAddItemToUnit(unit.id)}
                              className="h-10 w-10 rounded-xl bg-zinc-900 text-white shrink-0"
                            >
                              <Plus className="h-5 w-5" />
                            </Button>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {unitItems.map((item) => (
                              <div key={item.id} className="bg-zinc-100 p-3 rounded-xl flex items-center justify-between group/item">
                                <div className="flex items-center gap-2 min-w-0">
                                  <Archive className="h-4 w-4 text-zinc-400 shrink-0" />
                                  <span className="text-sm font-medium truncate">{item.name}</span>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 rounded-full text-zinc-400 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover/item:opacity-100 transition-all"
                                  onClick={() => handleRemoveItemFromUnit(unit.id, item.name)}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <>
                          {unitItems.slice(0, 5).map((item) => (
                            <Badge key={item.id} variant="secondary" className="bg-zinc-100 text-zinc-600 border-none">
                              {item.name}
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

      {/* Scanner Overlay */}
      <AnimatePresence>
        {isScannerOpen && (
          <Scanner 
            onScanComplete={handleScanComplete}
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

