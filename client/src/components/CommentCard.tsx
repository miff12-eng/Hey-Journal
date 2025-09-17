import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { MoreHorizontal, Edit2, Trash2 } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { CommentWithPublicUser } from '@shared/schema'

interface CommentCardProps {
  comment: CommentWithPublicUser
  currentUserId?: string
  onEdit?: (commentId: string) => void
  onDelete?: (commentId: string) => void
  className?: string
}

export default function CommentCard({
  comment,
  currentUserId,
  onEdit,
  onDelete,
  className
}: CommentCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  
  const formatDate = (date: Date | string) => {
    const d = new Date(date)
    const now = new Date()
    const diffInMinutes = Math.floor((now.getTime() - d.getTime()) / 60000)
    
    if (diffInMinutes < 1) return 'Just now'
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`
    
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const truncateContent = (content: string, maxLength: number = 100) => {
    if (content.length <= maxLength) return content
    return content.slice(0, maxLength) + '...'
  }

  const shouldShowReadMore = comment.content.length > 100
  const isOwner = currentUserId === comment.userId
  const hasMedia = comment.mediaUrls && comment.mediaUrls.length > 0

  const getUserInitials = (user: CommentWithPublicUser['user']) => {
    if (user.firstName && user.lastName) {
      return `${user.firstName[0]}${user.lastName[0]}`
    }
    if (user.username) {
      return user.username.slice(0, 2).toUpperCase()
    }
    return '??'
  }

  const getUserDisplayName = (user: CommentWithPublicUser['user']) => {
    if (user.firstName && user.lastName) {
      return `${user.firstName} ${user.lastName}`
    }
    if (user.username) {
      return user.username
    }
    return 'Anonymous User'
  }

  return (
    <Card className={cn('transition-all duration-200', className)} data-testid={`card-comment-${comment.id}`}>
      <CardContent className="p-4">
        <div className="flex gap-3">
          <Avatar className="h-8 w-8 flex-shrink-0">
            <AvatarImage 
              src={comment.user.profileImageUrl || ''} 
              alt={getUserDisplayName(comment.user)}
            />
            <AvatarFallback className="text-xs">
              {getUserInitials(comment.user)}
            </AvatarFallback>
          </Avatar>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm" data-testid={`text-comment-author-${comment.id}`}>
                  {getUserDisplayName(comment.user)}
                </span>
                <span className="text-xs text-muted-foreground" data-testid={`text-comment-date-${comment.id}`}>
                  {formatDate(comment.createdAt || new Date())}
                </span>
              </div>
              
              {isOwner && (onEdit || onDelete) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-8 w-8 p-0" 
                      data-testid={`button-comment-options-${comment.id}`}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {onEdit && (
                      <DropdownMenuItem onClick={() => onEdit(comment.id)} data-testid={`button-edit-comment-${comment.id}`}>
                        <Edit2 className="h-4 w-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                    )}
                    {onDelete && (
                      <DropdownMenuItem 
                        onClick={() => onDelete(comment.id)} 
                        className="text-destructive"
                        data-testid={`button-delete-comment-${comment.id}`}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
            
            <div className="text-sm text-foreground" data-testid={`text-comment-content-${comment.id}`}>
              {shouldShowReadMore && !isExpanded ? 
                truncateContent(comment.content) : 
                comment.content
              }
              {shouldShowReadMore && (
                <button 
                  className="text-primary hover:underline text-xs ml-1"
                  onClick={() => setIsExpanded(!isExpanded)}
                  data-testid={`button-expand-comment-${comment.id}`}
                >
                  {isExpanded ? 'Show less' : 'Read more'}
                </button>
              )}
            </div>
            
            {hasMedia && (
              <div className="mt-2 grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
                {(comment.mediaUrls || []).map((url, index) => (
                  <div key={index} className="relative">
                    <img 
                      src={url} 
                      alt={`Comment media ${index + 1}`}
                      className="rounded-md object-cover w-full h-24"
                      data-testid={`img-comment-media-${comment.id}-${index}`}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}