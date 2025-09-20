import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { isVideo } from '@/lib/media'

interface MediaModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  src: string
  alt: string
  className?: string
  mediaObject?: {url: string; mimeType?: string; originalName?: string}
}

export default function MediaModal({ open, onOpenChange, src, alt, className, mediaObject }: MediaModalProps) {
  // Use MIME-first detection for reliable video detection with opaque URLs
  const mediaForDetection = mediaObject || { url: src };
  const isVideoFile = isVideo(mediaForDetection);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className={cn(
          "max-w-[90vw] max-h-[90vh] p-4 border-0 bg-black/90 backdrop-blur-sm",
          className
        )}
        data-testid="media-modal"
      >
        <VisuallyHidden>
          <DialogTitle>Expanded {isVideoFile ? 'Video' : 'Photo'} View</DialogTitle>
        </VisuallyHidden>
        <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
          {/* Close button */}
          <button
            onClick={() => onOpenChange(false)}
            className="absolute top-2 right-2 z-50 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
            data-testid="button-close-media-modal"
            aria-label="Close"
          >
            <X className="h-6 w-6" />
          </button>
          
          {/* Media Container */}
          <div className="w-full h-full flex items-center justify-center p-2">
            {isVideoFile ? (
              <video
                src={src}
                className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
                controls
                autoPlay
                muted
                data-testid="modal-video"
                onClick={() => onOpenChange(false)}
              />
            ) : (
              <img
                src={src}
                alt={alt}
                className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
                data-testid="modal-photo"
                onClick={() => onOpenChange(false)}
              />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Export both names for backward compatibility
export { MediaModal as PhotoModal }