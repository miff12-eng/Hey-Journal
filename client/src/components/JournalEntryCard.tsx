import { useState } from 'react'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { MoreHorizontal, Heart, MessageCircle, Share, Lock, Users, Globe, Play, Edit2 } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { JournalEntryWithUser, CommentWithPublicUser } from '@shared/schema'
import CommentsList from './CommentsList'
import AudioPlayer from './AudioPlayer'
import PhotoModal from './PhotoModal'

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
  const [isLiked, setIsLiked] = useState(false)
  const [showComments, setShowComments] = useState(false)
  const [selectedPhotoUrl, setSelectedPhotoUrl] = useState<string | null>(null)
  const [selectedPhotoAlt, setSelectedPhotoAlt] = useState<string>('')
  
  // Fetch comment count for the entry
  const { data: comments = [] } = useQuery<CommentWithPublicUser[]>({
    queryKey: ['/api/journal/entries', entry.id, 'comments'],
    queryFn: () => fetch(`/api/journal/entries/${entry.id}/comments`, { credentials: 'include' }).then(res => res.json()),
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
                      {entry.user.firstName || entry.user.email} {entry.user.lastName}
                    </p>
                    <Badge variant="secondary" className={cn('h-5 px-1.5 gap-1', privacyColor)}>
                      {privacyIcon}
                      <span className="text-xs capitalize">{entry.privacy}</span>
                    </Badge>
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
            {entry.mediaUrls!.slice(0, 6).map((url, index) => (
              <div 
                key={index} 
                className="group relative aspect-[4/3] rounded-md overflow-hidden bg-muted cursor-pointer"
                data-testid={`media-${entry.id}-${index}`}
                onClick={() => {
                  setSelectedPhotoUrl(url)
                  setSelectedPhotoAlt(`Media ${index + 1} from entry by ${entry.user.firstName} ${entry.user.lastName || ''}`)
                }}
              >
                <img 
                  src={url} 
                  alt={`Media ${index + 1}`}
                  className="object-contain w-full h-full transition-transform duration-200 group-hover:scale-105"
                  loading="lazy"
                />
                {entry.mediaUrls!.length > 6 && index === 5 && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <span className="text-white font-medium text-sm">
                      +{entry.mediaUrls!.length - 6}
                    </span>
                  </div>
                )}
              </div>
            ))}
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
      </CardContent>

      <CardFooter className="pt-0">
        <Separator className="mb-3" />
        <div className="flex items-center gap-2 w-full justify-start flex-wrap">
          <Button 
            variant="ghost" 
            size="sm" 
            className="gap-2 text-muted-foreground hover:text-foreground"
            onClick={() => setIsLiked(!isLiked)}
            data-testid={`button-like-${entry.id}`}
          >
            <Heart className={cn('h-4 w-4', isLiked && 'fill-red-500 text-red-500')} />
            <span className="text-sm">24</span>
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
      </CardFooter>
      
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
          }
        }}
        src={selectedPhotoUrl || ''}
        alt={selectedPhotoAlt}
      />
    </Card>
  )
}