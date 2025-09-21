import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Search, Plus, Bell, Filter, TrendingUp, Copy, Share2, ExternalLink, Trash2, Users, Globe, UserCheck, Clock, Hash } from 'lucide-react'
import JournalEntryCard from '@/components/JournalEntryCard'
import ThemeToggle from '@/components/ThemeToggle'
import UserSelector from '@/components/UserSelector'
import AudioPlayer from '@/components/AudioPlayer'
import { AspectRatio } from '@/components/ui/aspect-ratio'
import { JournalEntryWithUser } from '@shared/schema'
import { useQuery, useMutation } from '@tanstack/react-query'
import { queryClient, apiRequest } from '@/lib/queryClient'
import { useLocation } from 'wouter'
import { useToast } from '@/hooks/use-toast'

type FeedFilter = 'feed' | 'shared'

// Enhanced search types for Home feed search
interface EnhancedSearchResult {
  entryId: string
  similarity: number
  snippet: string
  title?: string
  matchReason: string
}

interface EnhancedSearchResponse {
  query: string
  mode: string
  results: EnhancedSearchResult[]
  totalResults: number
  executionTime: number
}

export default function Home() {
  const [, setLocation] = useLocation()
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<EnhancedSearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [activeFilter, setActiveFilter] = useState<FeedFilter>('feed')
  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [sharingEntryId, setSharingEntryId] = useState<string | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [selectedUsersForSharing, setSelectedUsersForSharing] = useState<{id: string, email: string, username?: string, firstName?: string, lastName?: string, profileImageUrl?: string}[]>([])
  const [isLoadingSharing, setIsLoadingSharing] = useState(false)
  const [overlayEntry, setOverlayEntry] = useState<JournalEntryWithUser | null>(null)
  const [searchFocused, setSearchFocused] = useState(false)
  const [searchHistory, setSearchHistory] = useState<string[]>([])
  const { toast } = useToast()
  
  // Load search history from localStorage on mount
  useEffect(() => {
    const savedHistory = localStorage.getItem('feedSearchHistory')
    if (savedHistory) {
      try {
        const history = JSON.parse(savedHistory)
        if (Array.isArray(history)) {
          setSearchHistory(history.slice(0, 8)) // Limit to 8 items
        }
      } catch (error) {
        console.error('Failed to parse search history:', error)
      }
    }
  }, [])
  
  // Save search to history
  const saveSearchToHistory = (query: string) => {
    if (!query.trim()) return
    
    const trimmedQuery = query.trim()
    const newHistory = [trimmedQuery, ...searchHistory.filter(item => item !== trimmedQuery)].slice(0, 8)
    setSearchHistory(newHistory)
    localStorage.setItem('feedSearchHistory', JSON.stringify(newHistory))
  }
  
  // Handle search execution
  const handleSearch = (query: string) => {
    if (query.trim()) {
      saveSearchToHistory(query)
      // Trigger the search mutation
      searchMutation.mutate({ query: query.trim(), filter: activeFilter })
    }
  }
  
  // Handler to open entry overlay
  const handleEntryClick = (entry: JournalEntryWithUser) => {
    setOverlayEntry(entry)
  }
  
  // Enhanced search mutation for Feed search
  const searchMutation = useMutation({
    mutationFn: async (params: { query: string; filter: FeedFilter }) => {
      console.log('🚀 Performing enhanced Feed search:', params);
      setIsSearching(true);
      const response = await apiRequest('POST', '/api/search/enhanced', {
        query: params.query,
        mode: 'hybrid', // Use hybrid search for best results
        limit: 20,
        filters: { type: params.filter } // Pass feed filter to API
      });
      const data = await response.json() as EnhancedSearchResponse;
      console.log('🎯 Enhanced Feed search results:', data);
      return data;
    },
    onSuccess: (data) => {
      setSearchResults(data.results);
      setIsSearching(false);
    },
    onError: (error) => {
      console.error('Feed search error:', error);
      setSearchResults([]);
      setIsSearching(false);
    }
  });

  // Debounced search - trigger enhanced search when query changes
  useEffect(() => {
    if (searchQuery.trim()) {
      const timer = setTimeout(() => {
        searchMutation.mutate({ 
          query: searchQuery, 
          filter: activeFilter
        });
      }, 300); // Debounce search
      return () => clearTimeout(timer);
    } else {
      setSearchResults([]);
      setIsSearching(false);
    }
  }, [searchQuery, activeFilter]);
  
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

  // Fetch feed journal entries (shared with user or public)
  const { data: entries = [], isLoading, error, refetch } = useQuery<JournalEntryWithUser[]>({
    queryKey: ['/api/journal/entries', activeFilter],
    queryFn: () => fetch(`/api/journal/entries?type=${activeFilter}`, { credentials: 'include' }).then(res => res.json()),
    refetchInterval: 30000, // Refresh every 30 seconds
  })

  // Fetch usage statistics
  const { data: stats = {} } = useQuery<{entriesThisWeek: number, dayStreak: number, daysSinceLastEntry: number}>({
    queryKey: ['/api/journal/stats'],
    refetchInterval: 60000, // Refresh every minute
  })

  // Use entries directly from API - they already contain proper author user data
  const displayEntries: JournalEntryWithUser[] = entries

  // Bulk fetch search result entries with proper data
  const bulkFetchMutation = useMutation({
    mutationFn: async (entryIds: string[]) => {
      if (entryIds.length === 0) return [];
      const response = await apiRequest('POST', '/api/journal/entries/bulk', { entryIds });
      return await response.json() as JournalEntryWithUser[];
    }
  });

  // State to hold hydrated search entries
  const [hydratedSearchEntries, setHydratedSearchEntries] = useState<JournalEntryWithUser[]>([]);

  // When search results change, fetch full entry data
  useEffect(() => {
    if (searchResults.length > 0) {
      const entryIds = searchResults.map(result => result.entryId);
      bulkFetchMutation.mutate(entryIds, {
        onSuccess: (fullEntries) => {
          setHydratedSearchEntries(fullEntries);
        },
        onError: (error) => {
          console.error('Failed to fetch search result entries:', error);
          setHydratedSearchEntries([]);
        }
      });
    } else {
      setHydratedSearchEntries([]);
    }
  }, [searchResults]);

  // Enhanced search: If search query exists, show hydrated search results instead of all entries
  const filteredEntries = searchQuery.trim() ? 
    hydratedSearchEntries :
    // When not searching, show all entries (API already handles feed/shared filtering)
    displayEntries

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
              <h1 className="text-lg font-semibold text-foreground" data-testid="text-page-title">
                Feed
              </h1>
              <p className="text-xs text-muted-foreground">Discover journal entries shared with you</p>
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
            placeholder="Search feed entries..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setTimeout(() => setSearchFocused(false), 150)} // Delay to allow clicks
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleSearch(searchQuery)
                // Keep search focused to show updated dropdown
              }
            }}
            className="pl-10 pr-4"
            data-testid="input-search-entries"
          />
          
          {/* Recent searches dropdown - only show when focused and have history */}
          {searchFocused && searchHistory.length > 0 && (
            <div className="absolute top-full left-0 right-0 bg-background border border-border rounded-md shadow-lg mt-1 z-50">
              <div className="p-2">
                <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-2">
                  <Clock className="h-3 w-3" />
                  Recent Searches
                </h4>
                <div className="space-y-1">
                  {searchHistory.map((search, index) => (
                    <button
                      key={index}
                      onClick={() => {
                        setSearchQuery(search)
                        handleSearch(search)
                        setSearchFocused(false)
                      }}
                      className="w-full text-left p-2 text-sm hover:bg-muted rounded-sm transition-colors"
                      data-testid={`recent-search-${index}`}
                    >
                      {search}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </header>


      {/* Feed toggle tabs - Enhanced and more prominent */}
      <div className="px-4 py-4 border-b border-border bg-background/50">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-center gap-1 bg-muted p-1 rounded-lg w-fit mx-auto">
            <Button 
              variant={activeFilter === 'feed' ? 'default' : 'ghost'} 
              size="sm" 
              onClick={() => setActiveFilter('feed')}
              className="gap-2 px-4 py-2" 
              data-testid="filter-feed"
            >
              <Globe className="h-4 w-4" />
              Feed
            </Button>
            <Button 
              variant={activeFilter === 'shared' ? 'default' : 'ghost'} 
              size="sm" 
              onClick={() => setActiveFilter('shared')}
              className="gap-2 px-4 py-2" 
              data-testid="filter-shared"
            >
              <UserCheck className="h-4 w-4" />
              Shared with Me
            </Button>
          </div>
          <p className="text-xs text-muted-foreground text-center">
            {activeFilter === 'feed' 
              ? 'Public entries and entries shared with you' 
              : 'Entries specifically shared with you'}
          </p>
        </div>
      </div>

      {/* Journal feed */}
      <main className="flex-1">
        <ScrollArea className="h-full">
          <div className="p-4 pb-20 grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"> {/* Responsive grid layout */}
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
                onClick={handleEntryClick}
                onEdit={entry.userId === user?.id ? handleEdit : undefined}
                onShare={entry.userId === user?.id ? handleShare : undefined}
                onDelete={entry.userId === user?.id ? handleDelete : undefined}
              />
            ))}
            
            {/* Empty state */}
            {!isLoading && !error && displayEntries.length === 0 && (
              <div className="text-center py-12">
                <div className="h-16 w-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                  {activeFilter === 'feed' ? (
                    <Globe className="h-8 w-8 text-muted-foreground" />
                  ) : (
                    <UserCheck className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>
                <h3 className="text-lg font-medium text-foreground mb-2">
                  {activeFilter === 'feed' ? 'No entries found' : 'No shared entries'}
                </h3>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                  {activeFilter === 'feed' 
                    ? 'There are no public entries or entries shared with you at the moment'
                    : 'No one has shared any journal entries with you yet'
                  }
                </p>
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
      
      {/* Entry Overlay Dialog */}
      <Dialog open={!!overlayEntry} onOpenChange={(open) => !open && setOverlayEntry(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          {overlayEntry && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3 mb-2">
                  <Avatar className="h-10 w-10">
                    <AvatarImage 
                      src={overlayEntry.user.profileImageUrl || ''} 
                      alt={`${overlayEntry.user.firstName || 'User'} ${overlayEntry.user.lastName || ''}`}
                    />
                    <AvatarFallback>
                      {(overlayEntry.user.firstName?.[0] || overlayEntry.user.email?.[0] || 'U').toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      @{overlayEntry.user.username || overlayEntry.user.email?.split('@')[0] || 'user'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(overlayEntry.createdAt!).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                  </div>
                </div>
                {overlayEntry.title && (
                  <DialogTitle className="text-lg font-semibold text-left">
                    {overlayEntry.title}
                  </DialogTitle>
                )}
              </DialogHeader>
              
              <div className="space-y-4">
                {/* Content */}
                <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                  {overlayEntry.content}
                </div>
                
                {/* Media */}
                {overlayEntry.mediaUrls && overlayEntry.mediaUrls.length > 0 && (
                  <div className="grid grid-cols-2 gap-2">
                    {overlayEntry.mediaUrls.map((url, index) => {
                      const mediaObject = overlayEntry.mediaObjects?.[index];
                      const isVideo = mediaObject?.mimeType?.startsWith('video/');
                      
                      return (
                        <div key={index} className="relative group">
                          {isVideo ? (
                            <AspectRatio ratio={16/9}>
                              <video 
                                src={url} 
                                className="w-full h-full object-cover rounded-lg"
                                controls
                                preload="metadata"
                              />
                            </AspectRatio>
                          ) : (
                            <img 
                              src={url} 
                              alt={`Media ${index + 1}`}
                              className="w-full aspect-square object-cover rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                              onClick={() => window.open(url, '_blank')}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                
                {/* Audio */}
                {overlayEntry.audioUrl && (
                  <div className="bg-muted/30 rounded-lg p-3">
                    <AudioPlayer audioUrl={overlayEntry.audioUrl} />
                  </div>
                )}
                
                {/* Tags */}
                {overlayEntry.tags && overlayEntry.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {overlayEntry.tags.map((tag, index) => (
                      <Badge key={index} variant="secondary" className="text-xs">
                        #{tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}