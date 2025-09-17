import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form'
import { Separator } from '@/components/ui/separator'
import { MessageCircle, Upload, X } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { ObjectUploader } from '@/components/ObjectUploader'
import { apiRequest, queryClient } from '@/lib/queryClient'
import { insertCommentSchema } from '@shared/schema'
import { z } from 'zod'
import { cn } from '@/lib/utils'

// Extend the schema for the form with validation rules
const commentFormSchema = insertCommentSchema.extend({
  content: z.string().min(1, 'Comment cannot be empty').max(2000, 'Comment is too long'),
})

type CommentFormData = z.infer<typeof commentFormSchema>

interface CommentFormProps {
  entryId: string
  onSuccess?: () => void
  onCancel?: () => void
  className?: string
  placeholder?: string
}

export default function CommentForm({
  entryId,
  onSuccess,
  onCancel,
  className,
  placeholder = "Write a comment..."
}: CommentFormProps) {
  const [mediaUrls, setMediaUrls] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { toast } = useToast()

  // Initialize form with react-hook-form and zod validation
  const form = useForm<CommentFormData>({
    resolver: zodResolver(commentFormSchema),
    defaultValues: {
      content: '',
      entryId,
      mediaUrls: [],
    },
  })

  // Create comment mutation
  const createCommentMutation = useMutation({
    mutationFn: async (data: CommentFormData) => {
      return await apiRequest('POST', `/api/journal/entries/${entryId}/comments`, {
        ...data,
        mediaUrls,
      })
    },
    onSuccess: () => {
      // Invalidate comments query to refresh the list
      queryClient.invalidateQueries({ queryKey: ['/api/journal/entries', entryId, 'comments'] })
      
      // Reset form
      form.reset()
      setMediaUrls([])
      
      toast({
        title: 'Comment posted',
        description: 'Your comment has been successfully posted.',
      })
      
      onSuccess?.()
    },
    onError: (error: any) => {
      console.error('Create comment error:', error)
      toast({
        title: 'Failed to post comment',
        description: error.message || 'An error occurred while posting your comment.',
        variant: 'destructive',
      })
    },
  })

  const handleSubmit = async (data: CommentFormData) => {
    if (isSubmitting) return
    
    setIsSubmitting(true)
    try {
      await createCommentMutation.mutateAsync(data)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCancel = () => {
    form.reset()
    setMediaUrls([])
    onCancel?.()
  }

  const handleMediaUpload = (uploadedUrls: string[]) => {
    setMediaUrls(prev => [...prev, ...uploadedUrls])
  }

  const removeMediaItem = (indexToRemove: number) => {
    setMediaUrls(prev => prev.filter((_, index) => index !== indexToRemove))
  }

  return (
    <Card className={cn('w-full', className)}>
      <CardContent className="p-4">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            {/* Comment text field */}
            <FormField
              control={form.control}
              name="content"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder={placeholder}
                      className="resize-none min-h-[100px] text-base focus-visible:ring-1"
                      disabled={isSubmitting}
                      data-testid={`textarea-comment-${entryId}`}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Media attachments display */}
            {mediaUrls.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-muted-foreground">
                    Attachments ({mediaUrls.length})
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {mediaUrls.map((url, index) => (
                      <div key={index} className="relative group">
                        <div className="aspect-square bg-muted rounded-md overflow-hidden">
                          <img
                            src={url}
                            alt={`Attachment ${index + 1}`}
                            className="w-full h-full object-cover"
                            data-testid={`img-attachment-${entryId}-${index}`}
                          />
                        </div>
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon"
                          className="absolute -top-2 -right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => removeMediaItem(index)}
                          disabled={isSubmitting}
                          data-testid={`button-remove-attachment-${entryId}-${index}`}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {/* Media upload button */}
                <ObjectUploader
                  maxNumberOfFiles={5}
                  maxFileSize={10 * 1024 * 1024} // 10MB
                  onComplete={handleMediaUpload}
                  buttonClassName="h-9"
                >
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isSubmitting || mediaUrls.length >= 5}
                    data-testid={`button-upload-media-${entryId}`}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Add Media
                  </Button>
                </ObjectUploader>

                {mediaUrls.length >= 5 && (
                  <span className="text-xs text-muted-foreground">
                    Maximum 5 files allowed
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {onCancel && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleCancel}
                    disabled={isSubmitting}
                    data-testid={`button-cancel-comment-${entryId}`}
                  >
                    Cancel
                  </Button>
                )}
                
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSubmitting || !form.watch('content')?.trim()}
                  data-testid={`button-submit-comment-${entryId}`}
                >
                  {isSubmitting ? (
                    <>
                      <MessageCircle className="h-4 w-4 mr-2 animate-spin" />
                      Posting...
                    </>
                  ) : (
                    <>
                      <MessageCircle className="h-4 w-4 mr-2" />
                      Post Comment
                    </>
                  )}
                </Button>
              </div>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}