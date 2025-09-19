import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Plus, Bell, TrendingUp, Copy, Share2, ExternalLink, Trash2, Users, RefreshCw } from 'lucide-react'
import JournalEntryCard from '@/components/JournalEntryCard'
import ThemeToggle from '@/components/ThemeToggle'
import UserSelector from '@/components/UserSelector'
import { JournalEntryWithUser } from '@shared/schema'
import { useQuery, useMutation } from '@tanstack/react-query'
import { queryClient, apiRequest } from '@/lib/queryClient'
import { useToast } from '@/hooks/use-toast'
import RecordDialog from '@/components/RecordDialog'


export default function MyJournal() {
  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [sharingEntryId, setSharingEntryId] = useState<string | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [selectedUsersForSharing, setSelectedUsersForSharing] = useState<{id: string, email: string, username?: string, firstName?: string, lastName?: string, profileImageUrl?: string}[]>([])
  const [isLoadingSharing, setIsLoadingSharing] = useState(false)
  const [recordDialogOpen, setRecordDialogOpen] = useState(false)
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null)
  const [isReprocessing, setIsReprocessing] = useState(false)
  const { toast } = useToast()
  

  // Re-process photos mutation
  const reprocessPhotosMutation = useMutation({
    mutationFn: async () => {
      setIsReprocessing(true);
      const response = await apiRequest('POST', '/api/journal/analyze-missing', {});
      return await response.json();
    },
    onSuccess: (data) => {
      setIsReprocessing(false);
      toast({
        title: "Photos Re-processed!",
        description: `Successfully analyzed ${data.analyzed} entries with photos. Search should now work with image content!`,
      });
      // Refresh entries to show updated AI insights
      refetch();
    },
    onError: (error) => {
      setIsReprocessing(false);
      console.error('Photo reprocessing error:', error);
      toast({
        title: "Re-processing Failed",
        description: "Failed to re-process photos. Please try again.",
        variant: "destructive",
      });
    }
  });

  
  // Fetch real user data
  const { data: user, isLoading: isLoadingUser } = useQuery<{
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    username?: string;
    bio?: string;
    profileImageUrl?: string;
    isProfilePublic?: boolean;
    createdAt: Date;
    updatedAt: Date;
  }>({
    queryKey: ['/api/users/me'],
    refetchInterval: 60000, // Refresh every minute
  })

  // Fetch user's own journal entries
  const { data: entries = [], isLoading, error, refetch } = useQuery<JournalEntryWithUser[]>({
    queryKey: ['/api/journal/entries', 'own'],
    queryFn: () => fetch('/api/journal/entries?type=own', { credentials: 'include' }).then(res => res.json()),
    refetchInterval: 30000, // Refresh every 30 seconds
  })

  // Fetch usage statistics
  const { data: stats = {} } = useQuery<{entriesThisWeek: number, dayStreak: number, daysSinceLastEntry: number}>({
    queryKey: ['/api/journal/stats'],
    refetchInterval: 60000, // Refresh every minute
  })

  // Transform API entries to include user data for display
  const displayEntries: JournalEntryWithUser[] = entries.map(entry => ({
    ...entry,
    user: user || {
      id: 'loading',
      firstName: 'Loading...',
      lastName: '',
      email: '',
      profileImageUrl: '',
      createdAt: new Date(),
      updatedAt: new Date()
    } // Use real user data or loading placeholder
    // Note: Keep audioUrl from server response, don't override it
  }))

  // Show all entries without filtering
  const filteredEntries = displayEntries

  const handleEdit = (entryId: string) => {
    setEditingEntryId(entryId)
    setRecordDialogOpen(true)
  }
  
  const handleCreateNew = () => {
    setEditingEntryId(null)
    setRecordDialogOpen(true)
  }
  
  const handleRecordDialogSuccess = () => {
    // Refresh entries after successful save
    refetch()
  }

  const handleShare = async (entryId: string) => {
    setSharingEntryId(entryId)
    setShareModalOpen(true)
    
    // Load existing sharing information
    setIsLoadingSharing(true)
    try {
      const response = await fetch(`/api/journal/entries/${entryId}/sharing`, {
        credentials: 'include'
      })
      if (response.ok) {
        const sharingData = await response.json()
        setSelectedUsersForSharing(sharingData.sharedWith || [])
      } else {
        setSelectedUsersForSharing([])
      }
    } catch (error) {
      console.error('Failed to load sharing info:', error)
      setSelectedUsersForSharing([])
    } finally {
      setIsLoadingSharing(false)
    }
  }
  
  const copyPublicUrl = async (entryId: string) => {
    const publicUrl = `${window.location.origin}/e/${entryId}`
    try {
      await navigator.clipboard.writeText(publicUrl)
      toast({
        title: "URL copied!",
        description: "The public link has been copied to your clipboard.",
      })
    } catch (error) {
      console.error('Failed to copy URL:', error)
      toast({
        title: "Copy failed",
        description: "Unable to copy URL. Please try again.",
        variant: "destructive"
      })
    }
    setShareModalOpen(false)
  }
  
  const shareToSocial = (platform: string, entryId: string) => {
    const publicUrl = `${window.location.origin}/e/${entryId}`
    const text = 'Check out my journal entry'
    
    let shareUrl = ''
    switch (platform) {
      case 'twitter':
        shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(publicUrl)}`
        break
      case 'facebook':
        shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(publicUrl)}`
        break
      case 'linkedin':
        shareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(publicUrl)}`
        break
    }
    
    if (shareUrl) {
      window.open(shareUrl, '_blank', 'width=600,height=400')
    }
    setShareModalOpen(false)
  }
  
  const handleNativeShare = async (entryId: string) => {
    if (navigator.share) {
      try {
        const publicUrl = `${window.location.origin}/e/${entryId}`
        await navigator.share({
          title: 'My Journal Entry',
          text: 'Check out my journal entry',
          url: publicUrl
        })
        setShareModalOpen(false)
      } catch (error) {
        console.error('Native share failed:', error)
      }
    }
  }

  const handleDelete = (entryId: string) => {
    setDeletingEntryId(entryId)
    setDeleteDialogOpen(true)
  }
  
  const confirmDelete = async () => {
    if (!deletingEntryId) return
    
    setIsDeleting(true)
    try {
      const response = await fetch(`/api/journal/entries/${deletingEntryId}`, {
        method: 'DELETE',
        credentials: 'include'
      })
      
      if (response.ok) {
        toast({
          title: "Entry deleted",
          description: "Your journal entry has been permanently deleted.",
        })
        
        // Invalidate and refetch entries to update the UI
        refetch()
      } else {
        const errorData = await response.json().catch(() => ({}))
        toast({
          title: "Delete failed",
          description: errorData.error || 'Unable to delete entry. Please try again.',
          variant: "destructive"
        })
      }
    } catch (error) {
      toast({
        title: "Connection error",
        description: 'Unable to connect to server. Please check your connection.',
        variant: "destructive"
      })
      console.error('Error deleting entry:', error)
    } finally {
      setIsDeleting(false)
      setDeleteDialogOpen(false)
      setDeletingEntryId(null)
    }
  }
  
  // Handle updating sharing permissions
  const handleSaveSharing = async () => {
    if (!sharingEntryId) return
    
    try {
      const userIds = selectedUsersForSharing.map(user => user.id)
      const response = await fetch(`/api/journal/entries/${sharingEntryId}/share`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ userIds })
      })
      
      if (response.ok) {
        toast({
          title: "Sharing updated!",
          description: "Your sharing permissions have been saved successfully.",
        })
        
        // Refresh entries to show updated sharing status
        queryClient.invalidateQueries({ queryKey: ['/api/journal/entries'] })
        setShareModalOpen(false)
      } else {
        toast({
          title: "Update failed",
          description: 'Unable to update sharing permissions. Please try again.',
          variant: "destructive"
        })
      }
    } catch (error) {
      toast({
        title: "Connection error",
        description: 'Unable to connect to server. Please check your connection.',
        variant: "destructive"
      })
    }
  }


  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="h-8 w-8">
              <AvatarImage 
                src={user?.profileImageUrl} 
                alt={user?.firstName || 'User'} 
                data-testid="img-user-avatar"
              />
              <AvatarFallback data-testid="text-user-initials">
                {isLoadingUser ? '...' : (user?.firstName?.[0] || 'U')}
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-xl font-heading font-bold text-brand-navy" data-testid="text-page-title">
                My Journal
              </h1>
              <p className="text-xs text-brand-gray">Your personal thoughts and reflections</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => reprocessPhotosMutation.mutate()}
              disabled={isReprocessing}
              data-testid="button-reprocess-photos"
              title="Re-process photo analysis for search"
            >
              <RefreshCw className={`h-4 w-4 ${isReprocessing ? 'animate-spin' : ''}`} />
            </Button>
            <Button variant="ghost" size="icon" data-testid="button-notifications">
              <Bell className="h-4 w-4" />
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Quick stats */}
      <div className="px-4 py-3 border-b border-border">
        <div className="grid grid-cols-3 gap-4">
          <Card className="p-4 rounded-2xl shadow-soft">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-brand-blue" />
              <div>
                <p className="text-lg font-heading font-bold text-brand-navy">{stats.entriesThisWeek ?? 0}</p>
                <p className="text-xs text-brand-gray font-body">This week</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 rounded-2xl shadow-soft">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 bg-brand-coral rounded-full" />
              <div>
                <p className="text-lg font-heading font-bold text-brand-navy">{stats.daysSinceLastEntry ?? 0}</p>
                <p className="text-xs text-brand-gray font-body">Days since last entry</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 rounded-2xl shadow-soft">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 bg-brand-blue rounded-full" />
              <div>
                <p className="text-lg font-heading font-bold text-brand-navy">{stats.dayStreak ?? 0}</p>
                <p className="text-xs text-brand-gray font-body">Day streak</p>
              </div>
            </div>
          </Card>
        </div>
      </div>


      {/* Journal feed */}
      <main className="flex-1">
        <ScrollArea className="h-full">
          <div className="p-4 space-y-4 pb-20"> {/* Extra bottom padding for navigation */}
            {/* Create Entry CTA - only show when there are entries */}
            {!isLoading && !error && displayEntries.length > 0 && (
              <div className="mb-6">
                <Button 
                  size="default"
                  className="w-full bg-brand-coral hover:bg-red-500 text-white font-heading font-semibold rounded-2xl shadow-soft py-4"
                  onClick={handleCreateNew}
                  data-testid="button-create-entry"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create New Entry
                </Button>
              </div>
            )}
            {/* Loading state */}
            {isLoading && (
              <div className="text-center py-12">
                <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4" />
                <p className="text-sm text-muted-foreground">Loading your journal entries...</p>
              </div>
            )}
            
            {/* Error state */}
            {error && (
              <div className="text-center py-12">
                <div className="h-16 w-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Plus className="h-8 w-8 text-destructive" />
                </div>
                <h3 className="text-lg font-medium text-foreground mb-2">Unable to load entries</h3>
                <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">
                  There was an error loading your journal entries
                </p>
                <Button onClick={() => refetch()} variant="outline">
                  Try Again
                </Button>
              </div>
            )}
            
            {/* Real entries */}
            {!isLoading && !error && filteredEntries.map((entry) => (
              <JournalEntryCard
                key={entry.id}
                entry={entry}
                onEdit={handleEdit}
                onShare={handleShare}
                onDelete={handleDelete}
                showUserInfo={false}
              />
            ))}
            
            {/* Empty state */}
            {!isLoading && !error && displayEntries.length === 0 && (
              <div className="text-center py-12">
                <div className="h-16 w-16 bg-brand-beige border-2 border-brand-coral rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Plus className="h-8 w-8 text-brand-coral" />
                </div>
                <h3 className="text-xl font-heading font-bold text-brand-navy mb-2">No entries yet</h3>
                <p className="text-sm font-body text-brand-gray mb-6 max-w-sm mx-auto">
                  Start your journal journey by recording your first entry
                </p>
                <Button 
                  size="lg" 
                  className="bg-brand-coral hover:bg-red-500 text-white font-heading font-semibold px-8 py-4 rounded-2xl shadow-soft"
                  onClick={handleCreateNew}
                  data-testid="button-create-first-entry"
                >
                  Create Your First Entry
                </Button>
              </div>
            )}
          </div>
        </ScrollArea>
      </main>
      
      {/* Share Modal */}
      <Dialog open={shareModalOpen} onOpenChange={setShareModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="h-5 w-5" />
              Share Entry
            </DialogTitle>
            <DialogDescription>
              Share this journal entry with others using the options below.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Copy Public URL */}
            <div>
              <h4 className="text-sm font-medium mb-2">Share Link</h4>
              <Button 
                onClick={() => sharingEntryId && copyPublicUrl(sharingEntryId)}
                variant="outline" 
                className="w-full justify-start"
                data-testid="button-copy-url"
              >
                <Copy className="h-4 w-4 mr-2" />
                Copy Public URL
              </Button>
            </div>
            
            {/* Direct User Sharing */}
            <div>
              <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                <Users className="h-4 w-4" />
                Share with Users
              </h4>
              {isLoadingSharing ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                  Loading sharing information...
                </div>
              ) : (
                <div className="space-y-3">
                  <UserSelector
                    selectedUsers={selectedUsersForSharing}
                    onUsersChange={setSelectedUsersForSharing}
                    placeholder="Search by email or name to add users..."
                    className=""
                  />
                  {selectedUsersForSharing.length > 0 && (
                    <Button 
                      onClick={handleSaveSharing}
                      className="w-full"
                      data-testid="button-save-sharing"
                    >
                      Save Sharing Changes
                    </Button>
                  )}
                </div>
              )}
            </div>
            
            {/* Social Media Sharing */}
            <div>
              <h4 className="text-sm font-medium mb-2">Share to Social Media</h4>
              <div className="grid grid-cols-2 gap-2">
                <Button 
                  onClick={() => sharingEntryId && shareToSocial('twitter', sharingEntryId)}
                  variant="outline"
                  size="sm"
                  data-testid="button-share-twitter"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Twitter
                </Button>
                <Button 
                  onClick={() => sharingEntryId && shareToSocial('facebook', sharingEntryId)}
                  variant="outline"
                  size="sm"
                  data-testid="button-share-facebook"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Facebook
                </Button>
                <Button 
                  onClick={() => sharingEntryId && shareToSocial('linkedin', sharingEntryId)}
                  variant="outline"
                  size="sm"
                  data-testid="button-share-linkedin"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  LinkedIn
                </Button>
                {navigator.share && (
                  <Button 
                    onClick={() => sharingEntryId && handleNativeShare(sharingEntryId)}
                    variant="outline"
                    size="sm"
                    data-testid="button-share-native"
                  >
                    <Share2 className="h-4 w-4 mr-2" />
                    More
                  </Button>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              Delete Entry
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this journal entry? This action cannot be undone and will permanently remove the entry from your journal.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {isDeleting ? (
                <>
                  <div className="animate-spin h-4 w-4 mr-2 border-2 border-current border-t-transparent rounded-full" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Entry
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* Record Dialog */}
      <RecordDialog
        open={recordDialogOpen}
        onOpenChange={setRecordDialogOpen}
        editEntryId={editingEntryId}
        onSaveSuccess={handleRecordDialogSuccess}
      />
    </div>
  )
}