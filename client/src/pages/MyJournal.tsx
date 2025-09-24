import { useState, useEffect } from 'react'
import { useLocation } from 'wouter'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Plus, Bell, TrendingUp, Copy, Share2, ExternalLink, Trash2, Users, RefreshCw, Search, Clock, Filter, Calendar, User, Check, ChevronsUpDown } from 'lucide-react'
import JournalEntryCard from '@/components/JournalEntryCard'
import ThemeToggle from '@/components/ThemeToggle'
import UserSelector from '@/components/UserSelector'
import { JournalEntryWithUser } from '@shared/schema'
import { useQuery, useMutation } from '@tanstack/react-query'
import { queryClient, apiRequest } from '@/lib/queryClient'
import { useToast } from '@/hooks/use-toast'
import RecordDialog from '@/components/RecordDialog'

// Enhanced search types for My Journal search
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


export default function MyJournal() {
  const [location] = useLocation()
  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [sharingEntryId, setSharingEntryId] = useState<string | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  
  const [selectedUsersForSharing, setSelectedUsersForSharing] = useState<{id: string, email: string, username?: string, firstName?: string, lastName?: string, profileImageUrl?: string}[]>([])
  const [isLoadingSharing, setIsLoadingSharing] = useState(false)
  const [emailForSharing, setEmailForSharing] = useState('')
  const [isSendingEmail, setIsSendingEmail] = useState(false)
  const [recordDialogOpen, setRecordDialogOpen] = useState(false)
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null)
  const [isReprocessing, setIsReprocessing] = useState(false)
  
  // Search functionality state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<EnhancedSearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchFocused, setSearchFocused] = useState(false)
  const [searchHistory, setSearchHistory] = useState<string[]>([])
  const [hydratedSearchEntries, setHydratedSearchEntries] = useState<JournalEntryWithUser[]>([])
  
  // Filter functionality state
  const [filterOpen, setFilterOpen] = useState(false)
  const [selectedPeople, setSelectedPeople] = useState<string[]>([])
  const [dateRange, setDateRange] = useState<{from?: string, to?: string}>({})
  const [peopleFilterOpen, setPeopleFilterOpen] = useState(false)
  const [peopleSearchOpen, setPeopleSearchOpen] = useState(false)
  const [peopleSearchValue, setPeopleSearchValue] = useState('')
  const [dateFilterOpen, setDateFilterOpen] = useState(false)
  
  const { toast } = useToast()
  
  // Handle URL parameters for auto-opening create modal
  useEffect(() => {
    const checkForCreateParam = () => {
      const search = typeof window !== 'undefined' ? window.location.search : ''
      const urlParams = new URLSearchParams(search)
      const shouldCreate = urlParams.get('create') === 'true'
      
      if (shouldCreate) {
        // Auto-open create modal and clean up URL
        setRecordDialogOpen(true)
        setEditingEntryId(null)
        
        // Clean up URL to remove the create parameter after a brief delay
        setTimeout(() => {
          if (typeof window !== 'undefined') {
            const newUrl = window.location.pathname
            window.history.replaceState({}, '', newUrl)
          }
        }, 100)
      }
    }

    // Check immediately
    checkForCreateParam()

    // Also listen for popstate events to catch programmatic navigation
    const handlePopState = () => {
      checkForCreateParam()
    }

    // Also listen for hashchange events to catch navigation changes
    const handleHashChange = () => {
      checkForCreateParam()
    }

    window.addEventListener('popstate', handlePopState)
    window.addEventListener('hashchange', handleHashChange)

    return () => {
      window.removeEventListener('popstate', handlePopState)
      window.removeEventListener('hashchange', handleHashChange)
    }
  }, [location])
  
  // Fetch historical people for searchable filter
  const { data: historicalPeople = [], isLoading: isLoadingPeople } = useQuery<Array<{id: string, firstName: string, lastName: string}>>({ 
    queryKey: ['/api/filters/people'],
    staleTime: 5 * 60 * 1000 // Cache for 5 minutes
  })
  
  // Load search history from localStorage on mount
  useEffect(() => {
    const savedHistory = localStorage.getItem('myJournalSearchHistory')
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
    localStorage.setItem('myJournalSearchHistory', JSON.stringify(newHistory))
  }
  
  // Build filters object based on selected values
  const buildFilters = () => {
    const filters: any = { type: 'feed' }; // Base filter for My Journal
    
    if (selectedPeople.length > 0) {
      filters.people = selectedPeople;
    }
    
    if (dateRange.from || dateRange.to) {
      filters.dateRange = {};
      if (dateRange.from) {
        filters.dateRange.from = dateRange.from;
      }
      if (dateRange.to) {
        filters.dateRange.to = dateRange.to;
      }
    }
    
    return filters;
  };

  // Check if any filters are active (beyond the base 'feed' filter)
  const hasActiveFilters = () => {
    return selectedPeople.length > 0 || dateRange.from || dateRange.to;
  };

  // Handle search execution
  const handleSearch = (query: string) => {
    if (query.trim()) {
      saveSearchToHistory(query)
      // Trigger the search mutation with filters
      searchMutation.mutate({ query: query.trim(), filters: buildFilters() })
    }
  }

  // Enhanced search mutation for My Journal search (handles both search and filtering)
  const searchMutation = useMutation({
    mutationFn: async (params: { query: string; filters?: any }) => {
      console.log('🚀 Performing enhanced My Journal search/filter:', params);
      setIsSearching(true);
      const response = await apiRequest('POST', '/api/search/enhanced', {
        query: params.query || '*', // Use '*' for filter-only queries
        mode: 'hybrid', // Use hybrid search for best results
        limit: 20,
        source: 'search', // Use valid enum value
        filters: params.filters || { type: 'feed' } // Use provided filters or default
      });
      const data = await response.json() as EnhancedSearchResponse;
      console.log('🎯 Enhanced My Journal search/filter results:', data);
      return data;
    },
    onSuccess: (data) => {
      setSearchResults(data.results);
      setIsSearching(false);
    },
    onError: (error) => {
      console.error('My Journal search error:', error);
      setSearchResults([]);
      setIsSearching(false);
    }
  });

  // Bulk fetch search result entries with proper data
  const bulkFetchMutation = useMutation({
    mutationFn: async (entryIds: string[]) => {
      if (entryIds.length === 0) return [];
      const response = await apiRequest('POST', '/api/journal/entries/bulk', { entryIds });
      return await response.json() as JournalEntryWithUser[];
    }
  });

  // Debounced search - trigger enhanced search when query changes
  useEffect(() => {
    if (searchQuery.trim()) {
      const timer = setTimeout(() => {
        searchMutation.mutate({ 
          query: searchQuery,
          filters: buildFilters()
        });
      }, 300); // Debounce search
      return () => clearTimeout(timer);
    } else {
      setSearchResults([]);
      setIsSearching(false);
    }
  }, [searchQuery]);
  
  // Re-run search when filters change (either with active search or filter-only)
  useEffect(() => {
    if (searchQuery.trim() || hasActiveFilters()) {
      // Debounce filter changes to prevent multiple searches while typing dates
      const timer = setTimeout(() => {
        // Only perform search if date inputs are complete or empty
        const isDateRangeValid = (!dateRange.from || dateRange.from.match(/^\d{4}-\d{2}-\d{2}$/)) &&
                                 (!dateRange.to || dateRange.to.match(/^\d{4}-\d{2}-\d{2}$/));
        
        if (isDateRangeValid) {
          searchMutation.mutate({ 
            query: searchQuery,
            filters: buildFilters()
          });
        }
      }, 500); // 500ms debounce for filter changes
      
      return () => clearTimeout(timer);
    } else {
      // Clear results when no search query and no filters
      setSearchResults([]);
      setIsSearching(false);
    }
  }, [selectedPeople, dateRange]);

  // Hide dropdown when search results are rendered
  useEffect(() => {
    if (!isSearching && searchResults.length > 0) {
      setSearchFocused(false);
    }
  }, [isSearching, searchResults]);

  // When search results change, fetch full entry data and preserve order
  useEffect(() => {
    if (searchResults.length > 0) {
      const entryIds = searchResults.map(result => result.entryId);
      bulkFetchMutation.mutate(entryIds, {
        onSuccess: (fullEntries) => {
          // Preserve the order from search results by sorting fullEntries
          const orderedEntries = entryIds.map(id => 
            fullEntries.find(entry => entry.id === id)
          ).filter(Boolean) as JournalEntryWithUser[];
          setHydratedSearchEntries(orderedEntries);
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
    queryKey: ['/api/journal/entries?type=own'],
  })

  

  // Fetch usage statistics
  const { data: stats = { entriesThisWeek: 0, dayStreak: 0, daysSinceLastEntry: 0 } } = useQuery<{entriesThisWeek: number, dayStreak: number, daysSinceLastEntry: number}>({
    queryKey: ['/api/journal/stats'],
    refetchInterval: 60000, // Refresh every minute
  })

  // Use entries directly from API - they already contain proper user data
  const displayEntries: JournalEntryWithUser[] = entries || []

  // Enhanced search: If search query exists OR filters are active, show hydrated search results instead of all entries
  const filteredEntries = (searchQuery.trim() || hasActiveFilters()) ? 
    (hydratedSearchEntries || []) :
    // When not searching and no filters active, show all entries
    displayEntries


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

  // Handle email sharing
  const handleEmailShare = async () => {
    if (!sharingEntryId || !emailForSharing.trim()) return
    
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(emailForSharing.trim())) {
      toast({
        title: "Invalid email",
        description: "Please enter a valid email address.",
        variant: "destructive"
      })
      return
    }
    
    setIsSendingEmail(true)
    try {
      const response = await fetch(`/api/journal/entries/${sharingEntryId}/share-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ email: emailForSharing.trim() })
      })
      
      if (response.ok) {
        const data = await response.json()
        toast({
          title: "Email sent!",
          description: `Journal entry shared with ${emailForSharing.trim()} successfully.`,
        })
        
        setEmailForSharing('')
        setShareModalOpen(false)
      } else {
        const errorData = await response.json().catch(() => ({}))
        toast({
          title: "Email failed",
          description: errorData.error || 'Unable to send email. Please try again.',
          variant: "destructive"
        })
      }
    } catch (error) {
      toast({
        title: "Connection error",
        description: 'Unable to connect to server. Please check your connection.',
        variant: "destructive"
      })
      console.error('Error sending email:', error)
    } finally {
      setIsSendingEmail(false)
    }
  }


  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background border-b border-border px-4 py-3">
        <div className="flex items-center justify-between gap-4">
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
                My Journal
              </h1>
              <p className="text-xs text-muted-foreground">Your personal thoughts and reflections</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Search bar - inline with title and avatar */}
            <div className="w-full max-w-80 min-w-0 relative md:w-80">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search your journal entries..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setTimeout(() => setSearchFocused(false), 150)} // Delay to allow clicks
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSearch(searchQuery)
                    setSearchFocused(false) // Hide dropdown after search
                  }
                }}
                className="pl-10 pr-4"
                data-testid="input-search-my-journal"
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
            
            {/* Filter button */}
            <Popover open={filterOpen} onOpenChange={setFilterOpen}>
              <PopoverTrigger asChild>
                <Button 
                  variant={hasActiveFilters() ? 'default' : 'ghost'} 
                  size="icon" 
                  data-testid="button-filter"
                >
                  <Filter className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-0" align="end">
                <div className="p-4 space-y-4">
                  <h3 className="text-sm font-medium text-foreground mb-3">Filter Results</h3>
                  
                  {/* People Filter Section */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
                        <User className="h-4 w-4" />
                        People
                      </h4>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPeopleFilterOpen(!peopleFilterOpen)}
                        data-testid="toggle-people-filter"
                      >
                        {peopleFilterOpen ? 'Hide' : 'Show'}
                      </Button>
                    </div>
                    
                    {peopleFilterOpen && (
                      <div className="space-y-2">
                        <Popover open={peopleSearchOpen} onOpenChange={setPeopleSearchOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              role="combobox"
                              aria-expanded={peopleSearchOpen}
                              className="w-full justify-between text-sm"
                              data-testid="button-select-people"
                            >
                              {selectedPeople.length > 0
                                ? `${selectedPeople.length} person${selectedPeople.length === 1 ? '' : 's'} selected`
                                : isLoadingPeople 
                                  ? "Loading people..." 
                                  : "Select people..."}
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[300px] p-0">
                            <Command>
                              <CommandInput 
                                placeholder="Search people or type new name..." 
                                value={peopleSearchValue}
                                onValueChange={setPeopleSearchValue}
                                data-testid="input-people-search"
                              />
                              <CommandList>
                                <CommandEmpty>
                                  {peopleSearchValue.trim() && (
                                    <div className="p-2">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="w-full"
                                        onClick={() => {
                                          const newPerson = peopleSearchValue.trim()
                                          if (newPerson && !selectedPeople.includes(newPerson)) {
                                            setSelectedPeople([...selectedPeople, newPerson])
                                            setPeopleSearchValue('')
                                            setPeopleSearchOpen(false)
                                          }
                                        }}
                                        data-testid={`button-create-person-${peopleSearchValue.trim()}`}
                                      >
                                        <Plus className="mr-2 h-4 w-4" />
                                        Create "{peopleSearchValue.trim()}"
                                      </Button>
                                    </div>
                                  )}
                                </CommandEmpty>
                                <CommandGroup>
                                  {historicalPeople
                                    .filter(person => {
                                      const fullName = `${person.firstName} ${person.lastName || ''}`.trim()
                                      return fullName.toLowerCase().includes(peopleSearchValue.toLowerCase()) ||
                                             person.firstName.toLowerCase().includes(peopleSearchValue.toLowerCase())
                                    })
                                    .map((person) => {
                                      const fullName = `${person.firstName} ${person.lastName || ''}`.trim()
                                      return (
                                        <CommandItem
                                          key={person.id}
                                          value={fullName}
                                          onSelect={() => {
                                            if (selectedPeople.includes(person.firstName)) {
                                              setSelectedPeople(selectedPeople.filter(p => p !== person.firstName))
                                            } else {
                                              setSelectedPeople([...selectedPeople, person.firstName])
                                            }
                                            setPeopleSearchValue('')
                                            setPeopleSearchOpen(false)
                                          }}
                                          data-testid={`option-person-${person.firstName}`}
                                        >
                                          <Check
                                            className={`mr-2 h-4 w-4 ${
                                              selectedPeople.includes(person.firstName) ? "opacity-100" : "opacity-0"
                                            }`}
                                          />
                                          {fullName}
                                        </CommandItem>
                                      )
                                    })}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                        
                        {selectedPeople.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {selectedPeople.map((person, index) => (
                              <Badge 
                                key={index}
                                variant="secondary" 
                                className="cursor-pointer text-xs"
                                onClick={() => setSelectedPeople(selectedPeople.filter((_, i) => i !== index))}
                                data-testid={`people-filter-${person}`}
                              >
                                {person} ×
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  
                  {/* Date Filter Section */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        Date Range
                      </h4>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDateFilterOpen(!dateFilterOpen)}
                        data-testid="toggle-date-filter"
                      >
                        {dateFilterOpen ? 'Hide' : 'Show'}
                      </Button>
                    </div>
                    
                    {dateFilterOpen && (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs text-muted-foreground mb-1 block">From</label>
                            <Input
                              type="date"
                              value={dateRange.from || ''}
                              onChange={(e) => setDateRange(prev => ({ ...prev, from: e.target.value }))}
                              data-testid="input-date-from"
                              className="text-sm"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground mb-1 block">To</label>
                            <Input
                              type="date"
                              value={dateRange.to || ''}
                              onChange={(e) => setDateRange(prev => ({ ...prev, to: e.target.value }))}
                              data-testid="input-date-to"
                              className="text-sm"
                            />
                          </div>
                        </div>
                        {(dateRange.from || dateRange.to) && (
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => setDateRange({})}
                            className="w-full"
                            data-testid="button-clear-date-filter"
                          >
                            Clear Date Filter
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                  
                  {/* Clear All Filters */}
                  {(selectedPeople.length > 0 || dateRange.from || dateRange.to) && (
                    <div className="pt-2 border-t border-border">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => {
                          setSelectedPeople([])
                          setDateRange({})
                        }}
                        className="w-full"
                        data-testid="button-clear-all-filters"
                      >
                        Clear All Filters
                      </Button>
                    </div>
                  )}
                </div>
              </PopoverContent>
            </Popover>
            
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
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <div>
                <p className="text-lg font-semibold text-foreground">{stats.entriesThisWeek ?? 0}</p>
                <p className="text-xs text-muted-foreground">This week</p>
              </div>
            </div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 bg-accent rounded-full" />
              <div>
                <p className="text-lg font-semibold text-foreground">{stats.daysSinceLastEntry ?? 0}</p>
                <p className="text-xs text-muted-foreground">Days since last entry</p>
              </div>
            </div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 bg-primary rounded-full" />
              <div>
                <p className="text-lg font-semibold text-foreground">{stats.dayStreak ?? 0}</p>
                <p className="text-xs text-muted-foreground">Day streak</p>
              </div>
            </div>
          </Card>
        </div>
      </div>


      {/* Journal feed */}
      <main className="flex-1">
        <ScrollArea className="h-full">
          <div className="p-4 space-y-4 pb-20"> {/* Extra bottom padding for navigation */}
            {/* Search Status Bar - Show when searching */}
            {searchQuery.trim() && (
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border">
                <div className="flex items-center gap-2">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Search: "{searchQuery}"</span>
                  {isSearching && (
                    <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
                  )}
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setSearchQuery('')}
                  data-testid="button-clear-search"
                >
                  Clear
                </Button>
              </div>
            )}
            
            {/* Create Entry CTA - only show when there are entries and not searching */}
            {!isLoading && !error && !searchQuery.trim() && displayEntries.length > 0 && (
              <div className="mb-6">
                <Button 
                  size="default"
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium"
                  onClick={handleCreateNew}
                  data-testid="button-create-entry"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create New Entry
                </Button>
              </div>
            )}
            
            {/* Search Loading state */}
            {isSearching && searchQuery.trim() && (
              <div className="text-center py-12">
                <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4" />
                <p className="text-sm text-muted-foreground">Searching your journal entries...</p>
              </div>
            )}
            
            {/* Regular Loading state */}
            {isLoading && !searchQuery.trim() && (
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
            
            {/* Search Results */}
            {!isSearching && searchQuery.trim() && filteredEntries.length > 0 && (
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground mb-4">
                  Found {filteredEntries.length} result{filteredEntries.length !== 1 ? 's' : ''}
                </div>
                {filteredEntries.map((entry) => (
                  <JournalEntryCard
                    key={entry.id}
                    entry={entry}
                    onEdit={handleEdit}
                    onShare={handleShare}
                    onDelete={handleDelete}
                    showUserInfo={false}
                  />
                ))}
              </div>
            )}
            
            {/* No Search Results */}
            {!isSearching && searchQuery.trim() && filteredEntries.length === 0 && (
              <div className="text-center py-12" data-testid="no-search-results">
                <div className="h-16 w-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                  <Search className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium text-foreground mb-2">No results found</h3>
                <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">
                  No journal entries match "{searchQuery}". Try different keywords or check your spelling.
                </p>
                <Button 
                  variant="outline"
                  onClick={() => setSearchQuery('')}
                  data-testid="button-clear-search-no-results"
                >
                  Clear Search
                </Button>
              </div>
            )}
            
            {/* Regular entries - only show when not searching */}
            {!isLoading && !error && !searchQuery.trim() && filteredEntries.map((entry) => (
              <JournalEntryCard
                key={entry.id}
                entry={entry}
                onEdit={handleEdit}
                onShare={handleShare}
                onDelete={handleDelete}
                showUserInfo={false}
              />
            ))}
            
            {/* Empty state - only show when not searching */}
            {!isLoading && !error && !searchQuery.trim() && displayEntries.length === 0 && (
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
            
            {/* Email Sharing */}
            <div>
              <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                Share via Email
              </h4>
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    type="email"
                    placeholder="Enter email address..."
                    value={emailForSharing}
                    onChange={(e) => setEmailForSharing(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !isSendingEmail) {
                        handleEmailShare()
                      }
                    }}
                    disabled={isSendingEmail}
                    data-testid="input-share-email"
                    className="flex-1"
                  />
                  <Button 
                    onClick={handleEmailShare}
                    disabled={!emailForSharing.trim() || isSendingEmail}
                    data-testid="button-send-email"
                  >
                    {isSendingEmail ? (
                      <>
                        <div className="animate-spin h-4 w-4 mr-2 border-2 border-current border-t-transparent rounded-full" />
                        Sending...
                      </>
                    ) : (
                      'Send'
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  The recipient will receive an email with a link to view your journal entry publicly.
                </p>
              </div>
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
                {typeof navigator !== 'undefined' && 'share' in navigator && (
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