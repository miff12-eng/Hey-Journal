import { useState, useEffect } from 'react'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { MoreHorizontal, Heart, MessageCircle, Share, Lock, Users, Globe, Play, Edit2 } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useQuery, useMutation } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { JournalEntryWithUser, CommentWithPublicUser } from '@shared/schema'
import { apiRequest, queryClient } from '@/lib/queryClient'
import { isVideo } from '@/lib/media'
import CommentsList from './CommentsList'
import AudioPlayer from './AudioPlayer'
import PhotoModal from './PhotoModal'
import { AspectRatio } from '@/components/ui/aspect-ratio'
import { useVideoPoster } from '@/hooks/useVideoPoster'

// VideoThumbnail component for mobile Safari poster support
function VideoThumbnail({ url, entryId, index }: { url: string; entryId: string; index: number }) {
  const posterUrl = useVideoPoster(url, true)
  
  return (
    <AspectRatio ratio={16/9}>
      <video 
        src={url} 
        className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
        data-testid={`video-${entryId}-${index}`}
        muted
        playsInline
        preload="metadata"
        poster={posterUrl || undefined}
        style={{ minHeight: '100px' }}
      />
    </AspectRatio>
  )
}

interface JournalEntryCardProps {
  entry: JournalEntryWithUser
  onEdit?: (entryId: string) => void
  onShare?: (entryId: string) => void
  onDelete?: (entryId: string) => void
  className?: string
  showUserInfo?: boolean // If false, hides user profile info for My Journal page
}

export default function JournalEntryCard({
  entry,
  onEdit,
  onShare,
  onDelete,
  className,
  showUserInfo = true
}: JournalEntryCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [showComments, setShowComments] = useState(false)
  const [selectedPhotoUrl, setSelectedPhotoUrl] = useState<string | null>(null)
  const [selectedPhotoAlt, setSelectedPhotoAlt] = useState<string>('')
  const [selectedMediaObject, setSelectedMediaObject] = useState<{url: string; mimeType?: string; originalName?: string} | null>(null)
  const [detectedVideoUrls, setDetectedVideoUrls] = useState<Set<string>>(new Set())
  
  // Detect MIME types for legacy entries without mediaObjects
  useEffect(() => {
    const detectLegacyVideoUrls = async () => {
      if (!entry.mediaUrls || entry.mediaUrls.length === 0) return;
      
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
  }, [entry.mediaUrls, entry.mediaObjects, detectedVideoUrls]);
  
  // Fetch comment count for the entry
  const { data: comments = [] } = useQuery<CommentWithPublicUser[]>({
    queryKey: ['/api/journal/entries', entry.id, 'comments'],
    queryFn: () => fetch(`/api/journal/entries/${entry.id}/comments`, { credentials: 'include' }).then(res => res.json()),
  })
  
  // Fetch like data for the entry
  const { data: likeData, isLoading: likesLoading } = useQuery<{
    likeCount: number;
    isLikedByUser: boolean;
    entryId: string;
  }>({
    queryKey: ['/api/journal/entries', entry.id, 'likes'],
    queryFn: () => fetch(`/api/journal/entries/${entry.id}/likes`, { credentials: 'include' }).then(res => res.json()),
  })
  
  
  // Mutation for toggling likes
  const likeMutation = useMutation({
    mutationFn: () => apiRequest('POST', `/api/journal/entries/${entry.id}/likes`),
    onMutate: async () => {
      // Cancel any outgoing refetches (so they don't overwrite optimistic update)
      await queryClient.cancelQueries({ 
        queryKey: ['/api/journal/entries', entry.id, 'likes'] 
      })
      // Also cancel queries for any list views that might contain this entry
      await queryClient.cancelQueries({ 
        queryKey: ['/api/journal/entries'] 
      })

      // Snapshot the previous value
      const previousLikeData = queryClient.getQueryData<{
        likeCount: number;
        isLikedByUser: boolean;
        entryId: string;
      }>(['/api/journal/entries', entry.id, 'likes'])

      // Optimistically update the individual entry's like data
      if (previousLikeData) {
        const currentLikeCount = typeof previousLikeData.likeCount === 'string' 
          ? parseInt(previousLikeData.likeCount, 10) 
          : previousLikeData.likeCount
        const newData = {
          ...previousLikeData,
          isLikedByUser: !previousLikeData.isLikedByUser,
          likeCount: previousLikeData.isLikedByUser ? currentLikeCount - 1 : currentLikeCount + 1
        }
        queryClient.setQueryData(['/api/journal/entries', entry.id, 'likes'], newData)
      } else {
        // If no previous data, assume this is the first like
        queryClient.setQueryData(['/api/journal/entries', entry.id, 'likes'], {
          entryId: entry.id,
          likeCount: 1,
          isLikedByUser: true
        })
      }

      // Return a context object with the snapshotted value
      return { previousLikeData }
    },
    onError: (err, newData, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousLikeData) {
        queryClient.setQueryData(['/api/journal/entries', entry.id, 'likes'], context.previousLikeData)
      }
    },
    onSettled: () => {
      // Always refetch after error or success to ensure server state
      queryClient.invalidateQueries({ 
        queryKey: ['/api/journal/entries', entry.id, 'likes'] 
      })
      // Also invalidate the main entries list to ensure consistency
      queryClient.invalidateQueries({ 
        queryKey: ['/api/journal/entries'] 
      })
    },
  })
  
  const privacyIcon = {
    private: <Lock className="h-3 w-3" />,
    shared: <Users className="h-3 w-3" />,
    public: <Globe className="h-3 w-3" />
  }[entry.privacy || 'private']

  const privacyColor = {
    private: 'bg-muted text-muted-foreground',
    shared: 'bg-accent text-accent-foreground',
    public: 'bg-primary text-primary-foreground'
  }[entry.privacy || 'private']

  const formatDate = (date: Date | string) => {
    const d = new Date(date)
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const truncateContent = (content: string, maxLength: number = 150) => {
    if (content.length <= maxLength) return content
    return content.slice(0, maxLength) + '...'
  }

  const hasMedia = entry.mediaUrls && entry.mediaUrls.length > 0
  const shouldShowReadMore = entry.content.length > 150

  return (
    <Card className={cn('hover-elevate transition-all duration-200', className)} data-testid={`card-journal-entry-${entry.id}`}>
      <CardHeader className="pb-3">
        {showUserInfo ? (
          // Feed page layout - with user info
          <>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage 
                    src={entry.user.profileImageUrl || ''} 
                    alt={`${entry.user.firstName || 'User'} ${entry.user.lastName || ''}`}
                  />
                  <AvatarFallback>
                    {(entry.user.firstName?.[0] || entry.user.email?.[0] || 'U').toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground truncate">
                      @{entry.user.username || entry.user.email?.split('@')[0] || 'user'}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(entry.createdAt!)}
                  </p>
                </div>
              </div>
              
              {(onEdit || onShare || onDelete) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8" data-testid={`button-entry-menu-${entry.id}`}>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {onEdit && (
                      <DropdownMenuItem onClick={() => onEdit(entry.id)} data-testid={`menu-edit-${entry.id}`}>
                        <Edit2 className="h-4 w-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                    )}
                    {onShare && (
                      <DropdownMenuItem onClick={() => onShare(entry.id)} data-testid={`menu-share-${entry.id}`}>
                        <Share className="h-4 w-4 mr-2" />
                        Share
                      </DropdownMenuItem>
                    )}
                    {onDelete && (
                      <DropdownMenuItem 
                        onClick={() => onDelete(entry.id)} 
                        className="text-destructive focus:text-destructive"
                        data-testid={`menu-delete-${entry.id}`}
                      >
                        Delete
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
            
            {entry.title && (
              <h3 className="text-lg font-semibold text-foreground mt-2" data-testid={`text-entry-title-${entry.id}`}>
                {entry.title}
              </h3>
            )}
          </>
        ) : (
          // My Journal page layout - headline style without user info
          <>
            <div className="flex items-start justify-between">
              {entry.title ? (
                <h2 className="text-xl font-bold text-foreground leading-tight" data-testid={`text-entry-title-${entry.id}`}>
                  {entry.title}
                </h2>
              ) : (
                <div></div>
              )}
              
              {(onEdit || onShare || onDelete) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8" data-testid={`button-entry-menu-${entry.id}`}>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {onEdit && (
                      <DropdownMenuItem onClick={() => onEdit(entry.id)} data-testid={`menu-edit-${entry.id}`}>
                        <Edit2 className="h-4 w-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                    )}
                    {onShare && (
                      <DropdownMenuItem onClick={() => onShare(entry.id)} data-testid={`menu-share-${entry.id}`}>
                        <Share className="h-4 w-4 mr-2" />
                        Share
                      </DropdownMenuItem>
                    )}
                    {onDelete && (
                      <DropdownMenuItem 
                        onClick={() => onDelete(entry.id)} 
                        className="text-destructive focus:text-destructive"
                        data-testid={`menu-delete-${entry.id}`}
                      >
                        Delete
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
            
            {/* Date and privacy pill below headline */}
            <div className="flex items-center gap-3 mt-2">
              <p className="text-xs text-muted-foreground">
                {formatDate(entry.createdAt!)}
              </p>
              <Badge variant="secondary" className={cn('h-4 px-2 gap-1', privacyColor)}>
                {privacyIcon}
                <span className="text-xs capitalize">{entry.privacy}</span>
              </Badge>
            </div>
          </>
        )}
      </CardHeader>

      <CardContent className="pt-0">
        {/* Audio player */}
        {entry.audioUrl && entry.audioPlayable && (
          <div className="mb-4">
            <AudioPlayer 
              audioUrl={entry.audioUrl}
              showFullControls={true}
              className="w-full"
            />
          </div>
        )}

        {/* Content */}
        <div className="space-y-3">
          <p className="text-foreground leading-relaxed whitespace-pre-wrap" data-testid={`text-entry-content-${entry.id}`}>
            {isExpanded || !shouldShowReadMore ? entry.content : truncateContent(entry.content)}
          </p>
          
          {shouldShowReadMore && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setIsExpanded(!isExpanded)}
              className="h-auto p-0 text-primary hover:text-primary"
              data-testid={`button-read-more-${entry.id}`}
            >
              {isExpanded ? 'Show less' : 'Read more'}
            </Button>
          )}
        </div>

        {/* Media grid */}
        {hasMedia && (
          <div className="mt-4 grid gap-2 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
            {entry.mediaUrls!.slice(0, 6).map((url, index) => {
              // Use MIME-first detection for reliable video detection
              const mediaObject = entry.mediaObjects?.[index] || { url };
              
              // Check if this is a video: use mediaObject MIME type first, then runtime detection
              let isVideoFile = isVideo(mediaObject);
              
              // For legacy entries without MIME metadata, use runtime detection
              if (!isVideoFile && (!('mimeType' in mediaObject) || !mediaObject.mimeType) && detectedVideoUrls.has(url)) {
                isVideoFile = true;
              }
              
              return (
                <div 
                  key={index} 
                  className="group relative rounded-md overflow-hidden cursor-pointer"
                  data-testid={`media-${entry.id}-${index}`}
                  onClick={() => {
                    setSelectedPhotoUrl(url)
                    setSelectedPhotoAlt(`Media ${index + 1} from entry by ${entry.user.firstName} ${entry.user.lastName || ''}`)
                    setSelectedMediaObject(mediaObject)
                  }}
                >
                  {isVideoFile ? (
                    <VideoThumbnail url={url} entryId={entry.id} index={index} />
                  ) : (
                    <img 
                      src={url} 
                      alt={`Media ${index + 1}`}
                      className="w-full h-auto transition-transform duration-200 group-hover:scale-105"
                      data-testid={`photo-${entry.id}-${index}`}
                      loading="lazy"
                    />
                  )}
                  
                  {/* Play button overlay for videos */}
                  {isVideoFile && (
                    <div className="absolute inset-0 flex items-center justify-center opacity-80 group-hover:opacity-100 transition-opacity duration-200">
                      <div className="bg-black/50 backdrop-blur-sm rounded-full p-3 border border-white/20">
                        <Play className="h-6 w-6 text-white fill-white" />
                      </div>
                    </div>
                  )}
                  
                  {entry.mediaUrls!.length > 6 && index === 5 && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <span className="text-white font-medium text-sm">
                        +{entry.mediaUrls!.length - 6}
                      </span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Tags */}
        {entry.tags && entry.tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1">
            {entry.tags.map((tag, index) => (
              <Badge key={index} variant="outline" className="text-xs" data-testid={`tag-${entry.id}-${index}`}>
                #{tag}
              </Badge>
            ))}
          </div>
        )}

        {/* Action buttons */}
        <div className="mt-4 flex items-center gap-2 justify-start">
          <Button 
            variant="ghost" 
            size="sm" 
            className="gap-2 text-muted-foreground hover:text-foreground"
            onClick={() => likeMutation.mutate()}
            disabled={likeMutation.isPending || likesLoading}
            data-testid={`button-like-${entry.id}`}
          >
            <Heart className={cn('h-4 w-4', likeData?.isLikedByUser && 'fill-red-500 text-red-500')} />
            <span className="text-sm">
              {likeData ? (typeof likeData.likeCount === 'string' ? parseInt(likeData.likeCount, 10) : likeData.likeCount) : 0}
            </span>
          </Button>
          
          <Button 
            variant="ghost" 
            size="sm" 
            className="gap-2 text-muted-foreground hover:text-foreground"
            onClick={() => setShowComments(!showComments)}
            data-testid={`button-comment-${entry.id}`}
          >
            <MessageCircle className="h-4 w-4" />
            <span className="text-sm">{comments.length}</span>
          </Button>
          
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => onShare?.(entry.id)}
            className="gap-2 text-muted-foreground hover:text-foreground"
            data-testid={`button-share-${entry.id}`}
          >
            <Share className="h-4 w-4" />
            <span className="text-sm hidden sm:inline">Share</span>
          </Button>
        </div>
      </CardContent>
      
      {/* Comments Section */}
      {showComments && (
        <CommentsList
          entryId={entry.id}
          currentUserId="mock-user-id" // TODO: Get from auth context
          onToggleVisibility={() => setShowComments(false)}
          className="mt-4"
        />
      )}
      
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
    </Card>
  )
}