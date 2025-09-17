import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Separator } from '@/components/ui/separator'
import { MessageCircle } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { queryClient, apiRequest } from '@/lib/queryClient'
import CommentCard from './CommentCard'
import { CommentWithPublicUser } from '@shared/schema'
import { cn } from '@/lib/utils'

interface CommentsListProps {
  entryId: string
  currentUserId?: string
  onToggleVisibility?: () => void
  className?: string
}

export default function CommentsList({
  entryId,
  currentUserId,
  onToggleVisibility,
  className
}: CommentsListProps) {
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null)
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const { toast } = useToast()

  // Fetch comments for the entry
  const { data: comments = [], isLoading, error, refetch } = useQuery<CommentWithPublicUser[]>({
    queryKey: ['/api/journal/entries', entryId, 'comments'],
  })

  // Delete comment mutation
  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: string) => {
      return apiRequest(`/api/comments/${commentId}`, 'DELETE')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/journal/entries', entryId, 'comments'] })
      toast({
        title: 'Comment deleted',
        description: 'Your comment has been successfully deleted.',
      })
    },
    onError: (error: any) => {
      console.error('Delete comment error:', error)
      toast({
        title: 'Failed to delete comment',
        description: error.message || 'An error occurred while deleting the comment.',
        variant: 'destructive',
      })
    },
  })

  const handleDeleteComment = async (commentId: string) => {
    setDeletingCommentId(commentId)
    await deleteCommentMutation.mutateAsync(commentId)
    setDeletingCommentId(null)
  }

  const handleEditComment = (commentId: string) => {
    setEditingCommentId(commentId)
    // TODO: Implement edit functionality in next task
    toast({
      title: 'Edit functionality',
      description: 'Comment editing will be available soon.',
    })
  }


  if (error) {
    return (
      <div className={cn('p-4 text-center', className)}>
        <p className="text-sm text-muted-foreground">
          Failed to load comments. 
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => refetch()}
            className="ml-2"
            data-testid={`button-retry-comments-${entryId}`}
          >
            Try again
          </Button>
        </p>
      </div>
    )
  }

  return (
    <div className={cn('space-y-4', className)} data-testid={`comments-list-${entryId}`}>
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-sm flex items-center gap-2">
          <MessageCircle className="h-4 w-4" />
          Comments ({comments.length})
        </h4>
        {onToggleVisibility && (
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onToggleVisibility}
            data-testid={`button-hide-comments-${entryId}`}
          >
            Hide
          </Button>
        )}
      </div>

      <Separator />

      {isLoading ? (
        <div className="space-y-3" data-testid={`loading-comments-${entryId}`}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3 animate-pulse">
              <div className="h-8 w-8 bg-muted rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-muted rounded w-1/4" />
                <div className="h-4 bg-muted rounded w-full" />
                <div className="h-4 bg-muted rounded w-3/4" />
              </div>
            </div>
          ))}
        </div>
      ) : comments.length === 0 ? (
        <div className="text-center py-8" data-testid={`empty-comments-${entryId}`}>
          <MessageCircle className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">No comments yet</p>
          <p className="text-xs text-muted-foreground mt-1">Be the first to comment!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {comments.map((comment: CommentWithPublicUser) => (
            <CommentCard
              key={comment.id}
              comment={comment}
              currentUserId={currentUserId}
              onEdit={handleEditComment}
              onDelete={handleDeleteComment}
              className="bg-muted/30"
            />
          ))}
        </div>
      )}
    </div>
  )
}