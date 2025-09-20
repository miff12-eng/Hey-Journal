import { useState, useEffect } from "react"
import { useParams } from "wouter"
import { useQuery } from "@tanstack/react-query"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Calendar, FileText, ArrowLeft, Volume2, User, Play } from "lucide-react"
import { Link } from "wouter"
import PhotoModal from "@/components/PhotoModal"
import { isVideo } from '@/lib/media'
import { AspectRatio } from '@/components/ui/aspect-ratio'

interface PublicJournalEntry {
  id: string
  userId: string
  title: string | null
  content: string
  audioUrl: string | null
  audioPlayable: boolean
  mediaUrls: string[]
  mediaObjects: Array<{url: string; mimeType?: string; originalName?: string}>
  tags: string[]
  createdAt: string
  updatedAt: string
  user: {
    id: string
    username: string
    firstName: string | null
    lastName: string | null
    bio: string | null
    profileImageUrl: string | null
  }
}

export default function PublicEntry() {
  const { entryId } = useParams<{ entryId: string }>()
  const [selectedPhotoUrl, setSelectedPhotoUrl] = useState<string | null>(null)
  const [selectedPhotoAlt, setSelectedPhotoAlt] = useState<string>('')
  const [selectedMediaObject, setSelectedMediaObject] = useState<{url: string; mimeType?: string; originalName?: string} | null>(null)
  const [detectedVideoUrls, setDetectedVideoUrls] = useState<Set<string>>(new Set())

  // Fetch entry
  const entryQuery = useQuery<PublicJournalEntry>({
    queryKey: [`/api/public/entries/${entryId}`]
  })

  // Detect MIME types for legacy entries without mediaObjects
  useEffect(() => {
    const entry = entryQuery.data;
    if (!entry || !entry.mediaUrls || entry.mediaUrls.length === 0) return;
    
    const detectLegacyVideoUrls = async () => {
      const urlsToCheck = entry.mediaUrls.filter((url, index) => {
        const hasMetadata = entry.mediaObjects && entry.mediaObjects[index] && entry.mediaObjects[index].mimeType;
        return !hasMetadata && !detectedVideoUrls.has(url);
      });
      
      if (urlsToCheck.length === 0) return;
      
      // Check MIME types via HEAD requests for legacy entries
      const videoUrls = new Set(detectedVideoUrls);
      for (const url of urlsToCheck) {
        try {
          const response = await fetch(url, { method: 'HEAD' });
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.startsWith('video/')) {
            videoUrls.add(url);
          }
        } catch (error) {
          // Silently fail for inaccessible URLs
          console.debug('Failed to check MIME type for:', url);
        }
      }
      
      if (videoUrls.size > detectedVideoUrls.size) {
        setDetectedVideoUrls(videoUrls);
      }
    };
    
    detectLegacyVideoUrls();
  }, [entryQuery.data, detectedVideoUrls]);

  if (entryQuery.isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center space-y-4">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto" />
          <p className="text-sm text-muted-foreground">Loading entry...</p>
        </div>
      </div>
    )
  }

  if (entryQuery.error) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-2xl mx-auto">
          <div className="text-center space-y-4 py-12">
            <FileText className="w-16 h-16 mx-auto text-muted-foreground opacity-50" />
            <h1 className="text-2xl font-bold">Entry Not Found</h1>
            <p className="text-muted-foreground">
              This journal entry doesn't exist or is private.
            </p>
            <Link href="/public">
              <Button variant="outline" data-testid="button-back-search">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Search
              </Button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const entry = entryQuery.data!
  
  const formatName = (user: PublicJournalEntry["user"]) => {
    if (user.firstName || user.lastName) {
      return `${user.firstName || ""} ${user.lastName || ""}`.trim()
    }
    return user.username
  }

  const getInitials = (user: PublicJournalEntry["user"]) => {
    const initials = (user.firstName?.[0] || "") + (user.lastName?.[0] || "")
    return initials || user.username[0]?.toUpperCase() || "?"
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    })
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Back Button */}
        <Link href="/public">
          <Button variant="ghost" size="sm" data-testid="button-back">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Search
          </Button>
        </Link>

        {/* Entry Content */}
        <Card>
          <CardHeader className="border-b">
            {/* Author Info */}
            <div className="flex items-center gap-4">
              <Link href={`/u/${entry.user.username}`}>
                <div className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                  <Avatar className="w-12 h-12">
                    <AvatarImage src={entry.user.profileImageUrl || undefined} />
                    <AvatarFallback>
                      {getInitials(entry.user)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-semibold" data-testid="text-author-username">
                      @{entry.user.username}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatName(entry.user)}
                    </p>
                  </div>
                </div>
              </Link>
            </div>

            {/* Entry Title */}
            {entry.title && (
              <CardTitle className="text-2xl mt-4" data-testid="text-entry-title">
                {entry.title}
              </CardTitle>
            )}

            {/* Meta Info */}
            <div className="flex items-center gap-4 text-sm text-muted-foreground pt-2">
              <div className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                <span data-testid="text-created-at">
                  {formatDate(entry.createdAt)}
                </span>
              </div>
              {entry.audioUrl && entry.audioPlayable && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  <Volume2 className="w-3 h-3" />
                  Audio Entry
                </Badge>
              )}
            </div>
          </CardHeader>

          <CardContent className="p-8">
            {/* Audio Player */}
            {entry.audioUrl && entry.audioPlayable && (
              <div className="mb-6">
                <audio controls className="w-full" data-testid="audio-player">
                  <source src={entry.audioUrl} type="audio/mpeg" />
                  Your browser does not support the audio element.
                </audio>
              </div>
            )}

            {/* Entry Content */}
            <div className="prose prose-gray dark:prose-invert max-w-none">
              <div className="whitespace-pre-wrap text-base leading-relaxed" data-testid="text-entry-content">
                {entry.content}
              </div>
            </div>

            {/* Media URLs */}
            {entry.mediaUrls.length > 0 && (
              <div className="mt-6">
                <h4 className="font-semibold mb-3">Media</h4>
                <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
                  {entry.mediaUrls.map((url, index) => {
                    // Use MIME-first detection for reliable video detection
                    const mediaObject = entry.mediaObjects?.[index] || { url };
                    
                    // Check if this is a video: use mediaObject MIME type first, then runtime detection
                    let isVideoFile = isVideo(mediaObject);
                    
                    // For legacy entries without MIME metadata, use runtime detection
                    if (!isVideoFile && (!mediaObject.mimeType) && detectedVideoUrls.has(url)) {
                      isVideoFile = true;
                    }
                    
                    return (
                      <div 
                        key={index} 
                        className="group relative border rounded-lg overflow-hidden cursor-pointer"
                        onClick={() => {
                          setSelectedPhotoUrl(url)
                          setSelectedPhotoAlt(`Media ${index + 1} from public entry by ${entry.user.firstName || ''} ${entry.user.lastName || ''}`)
                          setSelectedMediaObject(mediaObject)
                        }}
                        data-testid={`media-${isVideoFile ? 'video' : 'image'}-${index}`}
                      >
                        {isVideoFile ? (
                          <AspectRatio ratio={16/9}>
                            <video 
                              src={url} 
                              className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                              controls
                              muted
                              playsInline
                              preload="metadata"
                              style={{ minHeight: '100px' }}
                            />
                          </AspectRatio>
                        ) : (
                          <img 
                            src={url} 
                            alt={`Media ${index + 1}`}
                            className="w-full h-auto object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                            loading="lazy"
                          />
                        )}
                        
                        {/* Play button overlay for videos (desktop only) */}
                        {isVideoFile && (
                          <div className="absolute inset-0 flex items-center justify-center opacity-80 group-hover:opacity-100 transition-opacity duration-200 hidden sm:flex">
                            <div className="bg-black/50 backdrop-blur-sm rounded-full p-3 border border-white/20">
                              <Play className="h-6 w-6 text-white fill-white" />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Tags */}
            {entry.tags.length > 0 && (
              <div className="mt-6">
                <h4 className="font-semibold mb-3">Tags</h4>
                <div className="flex flex-wrap gap-2">
                  {entry.tags.map((tag) => (
                    <Badge key={tag} variant="outline" data-testid={`badge-tag-${tag}`}>
                      #{tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Author Profile Link */}
        <Card className="hover-elevate">
          <CardContent className="p-6">
            <Link href={`/u/${entry.user.username}`}>
              <div className="flex items-center gap-4" data-testid="link-author-profile">
                <Avatar className="w-16 h-16">
                  <AvatarImage src={entry.user.profileImageUrl || undefined} />
                  <AvatarFallback>
                    {getInitials(entry.user)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <h3 className="font-semibold text-lg">@{entry.user.username}</h3>
                  <p className="text-muted-foreground">{formatName(entry.user)}</p>
                  {entry.user.bio && (
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                      {entry.user.bio}
                    </p>
                  )}
                </div>
                <Button variant="outline" size="sm">
                  <User className="w-4 h-4 mr-2" />
                  View Profile
                </Button>
              </div>
            </Link>
          </CardContent>
        </Card>
        
        {/* Photo Modal */}
        <PhotoModal
          open={selectedPhotoUrl !== null}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedPhotoUrl(null)
              setSelectedPhotoAlt('')
              setSelectedMediaObject(null)
            }
          }}
          src={selectedPhotoUrl || ''}
          alt={selectedPhotoAlt}
          mediaObject={selectedMediaObject || undefined}
        />
      </div>
    </div>
  )
}