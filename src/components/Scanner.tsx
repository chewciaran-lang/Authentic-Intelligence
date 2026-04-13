import React, { useState, useRef, useEffect } from "react";
import { Camera, X, Check, Loader2, RefreshCw, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { detectObjects, DetectedObject, preloadModel } from "../lib/vision";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "motion/react";

interface ScannerProps {
  onScanComplete: (items: string[]) => void;
  onClose: () => void;
}

export function Scanner({ onScanComplete, onClose }: ScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isModelLoading, setIsModelLoading] = useState(true);
  const [detectedItems, setDetectedItems] = useState<string[]>([]);
  const [manualItem, setManualItem] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      try {
        await preloadModel();
        setIsModelLoading(false);
        await startCamera();
      } catch (err) {
        setError("Failed to initialize camera.");
      }
    }
    init();
    return () => stopCamera();
  }, []);

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: "environment" } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      setError("Could not access camera. Please check permissions.");
    }
  }

  function stopCamera() {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
    }
  }

  async function captureAndDetect() {
    if (!videoRef.current || !canvasRef.current) return;

    setIsScanning(true);
    setError(null);

    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0);
    const base64Image = canvas.toDataURL("image/jpeg").split(",")[1];

    try {
      const results = await detectObjects(base64Image);
      const newItems = results.map(r => r.name);
      setDetectedItems(prev => Array.from(new Set([...prev, ...newItems])));
    } catch (err) {
      setError("Failed to recognize items. Try again.");
    } finally {
      setIsScanning(false);
    }
  }

  const addManualItem = () => {
    if (!manualItem.trim()) return;
    setDetectedItems(prev => Array.from(new Set([...prev, manualItem.trim()])));
    setManualItem("");
  };

  const removeItem = (name: string) => {
    setDetectedItems(prev => prev.filter(i => i !== name));
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-white text-xl font-semibold">Scanning Storage</h2>
        <Button variant="ghost" size="icon" onClick={onClose} className="text-white">
          <X className="h-6 w-6" />
        </Button>
      </div>

      <div className="relative flex-1 rounded-2xl overflow-hidden bg-zinc-900 border border-zinc-800">
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          className="w-full h-full object-cover"
        />
        <canvas ref={canvasRef} className="hidden" />
        
        {isModelLoading && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-10">
            <div className="text-center">
              <RefreshCw className="h-12 w-12 text-white animate-spin mx-auto mb-2" />
              <p className="text-white font-medium">Downloading YOLOv8 model...</p>
              <p className="text-zinc-400 text-xs mt-1">This only happens once</p>
            </div>
          </div>
        )}

        {isScanning && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <div className="text-center">
              <Loader2 className="h-12 w-12 text-white animate-spin mx-auto mb-2" />
              <p className="text-white font-medium">Analyzing items...</p>
            </div>
          </div>
        )}

        <div className="absolute bottom-6 left-0 right-0 flex justify-center px-4">
          {!isScanning && (
            <Button 
              size="lg" 
              onClick={captureAndDetect}
              className="rounded-full h-16 w-16 bg-white text-black hover:bg-zinc-200"
            >
              <Camera className="h-8 w-8" />
            </Button>
          )}
        </div>
      </div>

      <div className="mt-4 bg-zinc-900 rounded-2xl p-4 border border-zinc-800 flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <h3 className="text-zinc-400 text-sm font-medium uppercase tracking-wider">Items to Save</h3>
          {detectedItems.length > 0 && (
            <Button 
              variant="secondary" 
              size="sm" 
              onClick={() => onScanComplete(detectedItems)}
              className="bg-green-600 hover:bg-green-700 text-white border-none"
            >
              <Check className="h-4 w-4 mr-2" />
              Save {detectedItems.length} Items
            </Button>
          )}
        </div>

        <div className="flex gap-2">
          <Input 
            placeholder="Add item manually..." 
            value={manualItem}
            onChange={(e) => setManualItem(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addManualItem()}
            className="bg-zinc-800 border-zinc-700 text-white h-10 rounded-xl"
          />
          <Button size="icon" onClick={addManualItem} className="bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl h-10 w-10">
            <Plus className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex flex-wrap gap-2 min-h-[40px]">
          <AnimatePresence>
            {detectedItems.map((name, idx) => (
              <motion.div
                key={name + idx}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
              >
                <Badge 
                  variant="outline" 
                  className="text-white border-zinc-700 py-1.5 pl-3 pr-1 flex items-center gap-1 group"
                >
                  {name}
                  <button 
                    onClick={() => removeItem(name)}
                    className="p-1 hover:bg-zinc-700 rounded-full transition-colors"
                  >
                    <X className="h-3 w-3 text-zinc-500 group-hover:text-red-400" />
                  </button>
                </Badge>
              </motion.div>
            ))}
          </AnimatePresence>
          {detectedItems.length === 0 && !isScanning && (
            <p className="text-zinc-500 text-sm italic">No items yet. Scan or add manually.</p>
          )}
        </div>
        
        {error && (
          <p className="text-red-400 text-sm">{error}</p>
        )}
      </div>
    </div>
  );
}
