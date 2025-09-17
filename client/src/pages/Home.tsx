import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Search, Plus, Bell, Filter, TrendingUp, Copy, Share2, ExternalLink, Trash2, Users } from 'lucide-react'
import JournalEntryCard from '@/components/JournalEntryCard'
import ThemeToggle from '@/components/ThemeToggle'
import UserSelector from '@/components/UserSelector'
import { JournalEntryWithUser } from '@shared/schema'
import { useQuery } from '@tanstack/react-query'
import { queryClient } from '@/lib/queryClient'
import { useLocation } from 'wouter'
import { useToast } from '@/hooks/use-toast'

type PrivacyFilter = 'all' | 'private' | 'shared' | 'public'

export default function Home() {
  const [, setLocation] = useLocation()
  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<PrivacyFilter>('all')
  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [sharingEntryId, setSharingEntryId] = useState<string | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [selectedUsersForSharing, setSelectedUsersForSharing] = useState<{id: string, email: string, username?: string, firstName?: string, lastName?: string, profileImageUrl?: string}[]>([])
  const [isLoadingSharing, setIsLoadingSharing] = useState(false)
  const { toast } = useToast()
  
  // Fetch real user data
  const { data: user, isLoading: isLoadingUser } = useQuery({
    queryKey: ['/api/users/me'],
    refetchInterval: 60000, // Refresh every minute
  })

  // Fetch real journal entries
  const { data: entries = [], isLoading, error, refetch } = useQuery({
    queryKey: ['/api/journal/entries'],
    refetchInterval: 30000, // Refresh every 30 seconds
  })

  // Fetch usage statistics
  const { data: stats } = useQuery({
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
      profileImageUrl: ''
    }, // Use real user data or loading placeholder
    audioUrl: entry.mediaUrls?.[0]?.endsWith('.mp3') ? entry.mediaUrls[0] : undefined
  }))

  // Filter entries based on active filter and search query
  const filteredEntries = displayEntries.filter(entry => {
    // Apply privacy filter
    let matchesFilter = true
    if (activeFilter !== 'all') {
      matchesFilter = entry.privacy === activeFilter
    }

    // Apply search filter
    let matchesSearch = true
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      matchesSearch = 
        entry.title?.toLowerCase().includes(query) ||
        entry.content.toLowerCase().includes(query) ||
        entry.tags?.some(tag => tag.toLowerCase().includes(query)) ||
        false
    }

    return matchesFilter && matchesSearch
  })

  const handleEdit = (entryId: string) => {
    setLocation(`/record?edit=${entryId}`)
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

  const handlePlayAudio = (audioUrl: string) => {
    console.log('Play audio:', audioUrl)
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
              <h1 className="text-lg font-semibold text-foreground" data-testid="text-greeting">
                {isLoadingUser ? 'Good morning!' : `Good morning, ${user?.firstName || 'User'}`}
              </h1>
              <p className="text-xs text-muted-foreground">Ready to capture today's thoughts?</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" data-testid="button-notifications">
              <Bell className="h-4 w-4" />
            </Button>
            <ThemeToggle />
          </div>
        </div>
        
        {/* Search bar */}
        <div className="mt-3 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search your journal entries..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-4"
            data-testid="input-search-entries"
          />
        </div>
      </header>

      {/* Quick stats */}
      <div className="px-4 py-3 border-b border-border">
        <div className="grid grid-cols-3 gap-4">
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <div>
                <p className="text-lg font-semibold text-foreground">{stats?.entriesThisWeek ?? 0}</p>
                <p className="text-xs text-muted-foreground">This week</p>
              </div>
            </div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 bg-accent rounded-full" />
              <div>
                <p className="text-lg font-semibold text-foreground">{stats?.daysSinceLastEntry ?? 0}</p>
                <p className="text-xs text-muted-foreground">Days since last entry</p>
              </div>
            </div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 bg-primary rounded-full" />
              <div>
                <p className="text-lg font-semibold text-foreground">{stats?.dayStreak ?? 0}</p>
                <p className="text-xs text-muted-foreground">Day streak</p>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="px-4 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setActiveFilter('all')}
            className={activeFilter === 'all' ? 'bg-primary/10 text-primary' : ''} 
            data-testid="filter-all"
          >
            All
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setActiveFilter('private')}
            className={activeFilter === 'private' ? 'bg-primary/10 text-primary' : ''} 
            data-testid="filter-private"
          >
            Private
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setActiveFilter('shared')}
            className={activeFilter === 'shared' ? 'bg-primary/10 text-primary' : ''} 
            data-testid="filter-shared"
          >
            Shared
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setActiveFilter('public')}
            className={activeFilter === 'public' ? 'bg-primary/10 text-primary' : ''} 
            data-testid="filter-public"
          >
            Public
          </Button>
          <Button variant="ghost" size="icon" className="ml-auto" data-testid="button-filter-options">
            <Filter className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Journal feed */}
      <main className="flex-1">
        <ScrollArea className="h-full">
          <div className="p-4 space-y-4 pb-20"> {/* Extra bottom padding for navigation */}
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
              />
            ))}
            
            {/* Empty state */}
            {!isLoading && !error && displayEntries.length === 0 && (
              <div className="text-center py-12">
                <div className="h-16 w-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                  <Plus className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium text-foreground mb-2">No entries yet</h3>
                <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">
                  Start your journal journey by recording your first entry
                </p>
                <Button 
                  size="lg" 
                  onClick={() => setLocation('/record')}
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
    </div>
  )
}