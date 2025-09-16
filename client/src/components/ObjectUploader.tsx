import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { X, Upload, CheckCircle } from "lucide-react";

interface ObjectUploaderProps {
  maxNumberOfFiles?: number;
  maxFileSize?: number;
  onComplete?: (uploadedUrls: string[]) => void;
  buttonClassName?: string;
  children: React.ReactNode;
}

interface UploadingFile {
  file: File;
  progress: number;
  status: 'uploading' | 'completed' | 'error';
  url?: string;
  error?: string;
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
  onComplete,
  buttonClassName,
  children,
}: ObjectUploaderProps) {
  const [showModal, setShowModal] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      
      // Validate file size
      const validFiles = files.filter(file => {
        if (file.size > maxFileSize) {
          alert(`File ${file.name} is too large. Maximum size is ${Math.round(maxFileSize / 1024 / 1024)}MB`);
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

  const startUpload = async () => {
    if (selectedFiles.length === 0) return;

    setIsUploading(true);
    const uploads: UploadingFile[] = selectedFiles.map(file => ({
      file,
      progress: 0,
      status: 'uploading' as const
    }));
    setUploadingFiles(uploads);

    const uploadedUrls: string[] = [];

    try {
      // Upload each file
      for (let i = 0; i < uploads.length; i++) {
        const upload = uploads[i];
        
        try {
          // Get upload URL
          const uploadResponse = await fetch('/api/photos/upload', {
            method: 'POST',
            credentials: 'include'
          });
          
          if (!uploadResponse.ok) {
            throw new Error('Failed to get upload URL');
          }
          
          const { uploadURL } = await uploadResponse.json();
          
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
                  idx === i ? { ...item, status: 'completed', url: uploadURL } : item
                ));
                uploadedUrls.push(uploadURL);
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

          // Set ACL policy for uploaded file
          await fetch('/api/photos', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ photoURL: uploadURL })
          });

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

      // Call completion callback with successful uploads
      if (uploadedUrls.length > 0) {
        onComplete?.(uploadedUrls);
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
      <Button onClick={() => setShowModal(true)} className={buttonClassName}>
        {children}
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-md">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Upload Photos</h3>
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
              <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center">
                <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground mb-2">
                  Select up to {maxNumberOfFiles} photo{maxNumberOfFiles > 1 ? 's' : ''}
                </p>
                <p className="text-xs text-muted-foreground mb-4">
                  Max {Math.round(maxFileSize / 1024 / 1024)}MB per file
                </p>
                <input
                  type="file"
                  accept="image/*"
                  multiple={maxNumberOfFiles > 1}
                  onChange={handleFileSelect}
                  className="hidden"
                  id="file-input"
                />
                <Button asChild variant="outline">
                  <label htmlFor="file-input" data-testid="button-select-files">
                    Select Files
                  </label>
                </Button>
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
                        <img 
                          src={URL.createObjectURL(file)} 
                          alt={file.name}
                          className="w-8 h-8 object-cover rounded"
                        />
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
                      Upload {selectedFiles.length} photo{selectedFiles.length > 1 ? 's' : ''}
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
    </div>
  );
}