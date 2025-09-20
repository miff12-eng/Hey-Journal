import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { X, Upload, CheckCircle, Camera, Image } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { isVideo, isSupportedMediaType, matchesMimePattern } from "@/lib/media";

interface ObjectUploaderProps {
  maxNumberOfFiles?: number;
  maxFileSize?: number;
  acceptedFileTypes?: string[];
  onComplete?: (uploadedUrls: string[]) => void;
  onCompleteWithMetadata?: (mediaObjects: Array<{url: string; mimeType?: string; originalName?: string}>) => void;
  buttonClassName?: string;
  children: React.ReactNode;
}

interface UploadingFile {
  file: File;
  progress: number;
  status: 'uploading' | 'completed' | 'error';
  objectPath?: string;
  error?: string;
  mimeType?: string;
  originalName?: string;
}

interface CameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
}

function CameraModal({ isOpen, onClose, onCapture }: CameraModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const startCamera = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Check if getUserMedia is supported
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera not supported in this browser');
      }

      // Request camera access with preference for back camera
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });

      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }

      setIsLoading(false);
    } catch (err) {
      console.error('Camera access error:', err);
      setError(err instanceof Error ? err.message : 'Failed to access camera');
      setIsLoading(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (!ctx) return;

    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw the current video frame to canvas
    ctx.drawImage(video, 0, 0);

    // Convert canvas to blob and then to File
    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `photo-${Date.now()}.jpg`, { 
          type: 'image/jpeg' 
        });
        onCapture(file);
        handleClose();
      }
    }, 'image/jpeg', 0.8);
  };

  const handleClose = () => {
    stopCamera();
    onClose();
  };

  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
    }

    return () => stopCamera();
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-md">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Take Photo</h3>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={handleClose}
              data-testid="button-close-camera"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          {error ? (
            <div className="text-center space-y-4">
              <p className="text-sm text-red-500">{error}</p>
              <Button onClick={handleClose} variant="outline">
                Try File Upload Instead
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
                {isLoading && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
                  </div>
                )}
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
              </div>
              
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  onClick={handleClose}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button 
                  onClick={capturePhoto}
                  disabled={isLoading || !!error}
                  className="flex-1"
                  data-testid="button-capture-photo"
                >
                  <Camera className="w-4 h-4 mr-2" />
                  Capture
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Hidden canvas for photo capture */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}

/**
 * A file upload component that handles direct upload to object storage
 * Features:
 * - Progress tracking for each file
 * - Multiple file support
 * - File size validation
 * - Direct upload to presigned URLs
 */
export function ObjectUploader({
  maxNumberOfFiles = 1,
  maxFileSize = 10485760, // 10MB default
  acceptedFileTypes = [],
  onComplete,
  onCompleteWithMetadata,
  buttonClassName,
  children,
}: ObjectUploaderProps) {
  const [showModal, setShowModal] = useState(false);
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();

  // Detect if device supports camera
  const isMobile = typeof window !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  const supportsCamera = typeof navigator !== 'undefined' && 
    'mediaDevices' in navigator && 
    'getUserMedia' in navigator.mediaDevices &&
    location.protocol === 'https:' || location.hostname === 'localhost';

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      
      // Validate file type and size
      const validFiles = files.filter(file => {
        // Check file type if acceptedFileTypes is specified
        if (acceptedFileTypes.length > 0) {
          const isAccepted = acceptedFileTypes.some(pattern => matchesMimePattern(file.type, pattern));
          if (!isAccepted) {
            toast({
              title: "Invalid file type",
              description: `File ${file.name} is not supported. Please select an image or video file.`,
              variant: "destructive"
            });
            return false;
          }
        } else {
          // If no specific types, ensure it's a supported media type
          if (!isSupportedMediaType(file)) {
            toast({
              title: "Invalid file type",
              description: `File ${file.name} is not supported. Please select an image or video file.`,
              variant: "destructive"
            });
            return false;
          }
        }
        
        // Check file size
        if (file.size > maxFileSize) {
          toast({
            title: "File too large",
            description: `File ${file.name} is too large. Maximum size is ${Math.round(maxFileSize / 1024 / 1024)}MB`,
            variant: "destructive"
          });
          return false;
        }
        return true;
      });

      // Limit number of files
      const limitedFiles = validFiles.slice(0, maxNumberOfFiles);
      setSelectedFiles(limitedFiles);
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleCameraCapture = (file: File) => {
    // Validate file type if acceptedFileTypes is specified
    if (acceptedFileTypes.length > 0) {
      const isAccepted = acceptedFileTypes.some(pattern => matchesMimePattern(file.type, pattern));
      if (!isAccepted) {
        toast({
          title: "Invalid file type",
          description: "Captured photo format is not supported.",
          variant: "destructive"
        });
        return;
      }
    } else if (!isSupportedMediaType(file)) {
      toast({
        title: "Invalid file type",
        description: "Captured photo format is not supported.",
        variant: "destructive"
      });
      return;
    }

    // Validate file size
    if (file.size > maxFileSize) {
      toast({
        title: "Photo too large",
        description: `Photo is too large. Maximum size is ${Math.round(maxFileSize / 1024 / 1024)}MB`,
        variant: "destructive"
      });
      return;
    }

    setSelectedFiles([file]);
    setShowCameraModal(false);
  };

  const handleTakePhotoClick = () => {
    if (supportsCamera) {
      setShowCameraModal(true);
    } else {
      // Fallback to file input
      document.getElementById('camera-input')?.click();
    }
  };

  const startUpload = async () => {
    console.log('🔍 ObjectUploader: Starting upload with files:', selectedFiles)
    if (selectedFiles.length === 0) return;

    setIsUploading(true);
    const uploads: UploadingFile[] = selectedFiles.map(file => ({
      file,
      progress: 0,
      status: 'uploading' as const
    }));
    setUploadingFiles(uploads);

    const uploadedObjectPaths: string[] = [];
    const uploadedMediaObjects: Array<{url: string; mimeType?: string; originalName?: string}> = [];
    console.log('🔍 ObjectUploader: Initial upload state:', uploads)

    try {
      // Upload each file
      for (let i = 0; i < uploads.length; i++) {
        const upload = uploads[i];
        
        try {
          // Get upload URL and object path
          const uploadResponse = await fetch('/api/photos/upload', {
            method: 'POST',
            credentials: 'include'
          });
          
          if (!uploadResponse.ok) {
            throw new Error('Failed to get upload URL');
          }
          
          const { uploadURL, objectPath } = await uploadResponse.json();
          
          // Upload file to presigned URL
          const xhr = new XMLHttpRequest();
          
          await new Promise<void>((resolve, reject) => {
            xhr.upload.addEventListener('progress', (e) => {
              if (e.lengthComputable) {
                const progress = Math.round((e.loaded / e.total) * 100);
                setUploadingFiles(prev => prev.map((item, idx) => 
                  idx === i ? { ...item, progress } : item
                ));
              }
            });

            xhr.addEventListener('load', () => {
              if (xhr.status === 200) {
                setUploadingFiles(prev => prev.map((item, idx) => 
                  idx === i ? { ...item, status: 'completed', objectPath } : item
                ));
                uploadedObjectPaths.push(objectPath);
                resolve();
              } else {
                reject(new Error(`Upload failed with status ${xhr.status}`));
              }
            });

            xhr.addEventListener('error', () => {
              reject(new Error('Upload failed'));
            });

            xhr.open('PUT', uploadURL);
            xhr.setRequestHeader('Content-Type', upload.file.type);
            xhr.send(upload.file);
          });

          // Set ACL policy for uploaded file and send metadata for enhanced video support
          const finalizeResponse = await fetch('/api/photos', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ 
              photoURL: uploadURL,
              mimeType: upload.file.type,
              originalName: upload.file.name
            })
          });

          // Store enhanced response data for mediaObjects
          if (finalizeResponse.ok) {
            const responseData = await finalizeResponse.json();
            console.log('Upload finalized with metadata:', {
              objectPath: responseData.objectPath,
              mimeType: responseData.mimeType,
              originalName: responseData.originalName
            });

            // Add to direct media objects array (reliable)
            uploadedMediaObjects.push({
              url: responseData.objectPath,
              mimeType: responseData.mimeType,
              originalName: responseData.originalName || upload.file.name
            });

            // Update uploading file with enhanced metadata (for UI)
            setUploadingFiles(prev => prev.map((item, idx) => 
              idx === i ? { 
                ...item, 
                mimeType: responseData.mimeType,
                originalName: responseData.originalName || upload.file.name
              } : item
            ));
          }

        } catch (error) {
          console.error('Upload error:', error);
          setUploadingFiles(prev => prev.map((item, idx) => 
            idx === i ? { 
              ...item, 
              status: 'error', 
              error: error instanceof Error ? error.message : 'Upload failed' 
            } : item
          ));
        }
      }

      // Call completion callback with successful uploads (permanent object paths)
      console.log('🔍 ObjectUploader: Upload complete, uploadedObjectPaths:', uploadedObjectPaths)
      if (uploadedObjectPaths.length > 0) {
        console.log('🔍 ObjectUploader: Calling onComplete with:', uploadedObjectPaths)
        onComplete?.(uploadedObjectPaths);
        
        // Use reliable media objects array (not dependent on React state timing)
        console.log('🔍 ObjectUploader: Using uploadedMediaObjects directly:', uploadedMediaObjects)
        
        if (uploadedMediaObjects.length > 0) {
          console.log('🔍 ObjectUploader: Calling onCompleteWithMetadata with:', uploadedMediaObjects)
          onCompleteWithMetadata?.(uploadedMediaObjects);
        } else {
          console.log('🔍 ObjectUploader: Not calling onCompleteWithMetadata - uploadedMediaObjects is empty')
        }
      }

    } finally {
      setIsUploading(false);
    }
  };

  const resetUploader = () => {
    setSelectedFiles([]);
    setUploadingFiles([]);
    setShowModal(false);
  };

  if (!showModal) {
    return (
      <div onClick={() => setShowModal(true)} className={buttonClassName}>
        {children}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-md">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Upload Photos & Videos</h3>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setShowModal(false)}
              data-testid="button-close-uploader"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          {selectedFiles.length === 0 ? (
            <div className="space-y-4">
              <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center">
                <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground mb-2">
                  Select up to {maxNumberOfFiles} photo{maxNumberOfFiles > 1 ? 's' : ''} & video{maxNumberOfFiles > 1 ? 's' : ''}
                </p>
                <p className="text-xs text-muted-foreground mb-4">
                  Max {Math.round(maxFileSize / 1024 / 1024)}MB per file
                </p>
                
                {/* Hidden file inputs for different sources */}
                <input
                  type="file"
                  accept="image/*,video/mp4,video/webm,video/quicktime,video/x-msvideo"
                  multiple={maxNumberOfFiles > 1}
                  onChange={handleFileSelect}
                  className="hidden"
                  id="camera-input"
                  capture="environment"
                  {...(isMobile && { capture: "environment" })}
                />
                <input
                  type="file"
                  accept="image/*,video/mp4,video/webm,video/quicktime,video/x-msvideo"
                  multiple={maxNumberOfFiles > 1}
                  onChange={handleFileSelect}
                  className="hidden"
                  id="photos-input"
                />
                
                {/* Photo source options */}
                <div className="flex flex-col gap-2">
                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={handleTakePhotoClick}
                    data-testid="button-take-photo"
                  >
                    <Camera className="w-4 h-4 mr-2" />
                    Take Photo
                  </Button>
                  <label 
                    htmlFor="photos-input" 
                    className="inline-flex items-center justify-center gap-2 w-full h-9 px-4 py-2 bg-background border border-input rounded-md text-sm font-medium text-foreground hover-elevate active-elevate-2 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                    data-testid="button-choose-from-photos"
                  >
                    <Image className="w-4 h-4" />
                    Choose from Photos
                  </label>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                {uploadingFiles.length > 0 ? (
                  uploadingFiles.map((upload, index) => (
                    <div key={index} className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="truncate">{upload.file.name}</span>
                        <div className="flex items-center gap-2">
                          {upload.status === 'completed' && (
                            <CheckCircle className="w-4 h-4 text-green-500" />
                          )}
                          {upload.status === 'error' && (
                            <span className="text-red-500 text-xs">Error</span>
                          )}
                        </div>
                      </div>
                      <Progress value={upload.progress} className="h-2" />
                      {upload.error && (
                        <p className="text-xs text-red-500">{upload.error}</p>
                      )}
                    </div>
                  ))
                ) : (
                  selectedFiles.map((file, index) => (
                    <div key={index} className="flex items-center justify-between p-2 bg-muted rounded">
                      <div className="flex items-center gap-2">
                        {isVideo(file) ? (
                          <video 
                            src={URL.createObjectURL(file)} 
                            className="w-8 h-8 object-cover rounded"
                            muted
                            onLoad={() => URL.revokeObjectURL(URL.createObjectURL(file))}
                          />
                        ) : (
                          <img 
                            src={URL.createObjectURL(file)} 
                            alt={file.name}
                            className="w-8 h-8 object-cover rounded"
                            onLoad={() => URL.revokeObjectURL(URL.createObjectURL(file))}
                          />
                        )}
                        <span className="text-sm truncate">{file.name}</span>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => removeFile(index)}
                        data-testid={`button-remove-file-${index}`}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))
                )}
              </div>

              <div className="flex gap-2">
                {uploadingFiles.length === 0 && (
                  <>
                    <Button variant="outline" onClick={resetUploader}>
                      Cancel
                    </Button>
                    <Button 
                      onClick={startUpload} 
                      disabled={isUploading}
                      data-testid="button-start-upload"
                    >
                      Upload {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''}
                    </Button>
                  </>
                )}
                {uploadingFiles.length > 0 && !isUploading && (
                  <Button onClick={resetUploader}>
                    Done
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Camera Modal */}
      <CameraModal
        isOpen={showCameraModal}
        onClose={() => setShowCameraModal(false)}
        onCapture={handleCameraCapture}
      />
    </div>
  );
}