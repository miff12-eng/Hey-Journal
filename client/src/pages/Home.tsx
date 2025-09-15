import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Search, Plus, Bell, Filter, TrendingUp } from 'lucide-react'
import JournalEntryCard from '@/components/JournalEntryCard'
import ThemeToggle from '@/components/ThemeToggle'
import { JournalEntryWithUser } from '@shared/schema'
import { useQuery } from '@tanstack/react-query'

type PrivacyFilter = 'all' | 'private' | 'shared' | 'public'

export default function Home() {
  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<PrivacyFilter>('all')
  
  // Fetch real journal entries
  const { data: entries = [], isLoading, error, refetch } = useQuery({
    queryKey: ['/api/journal/entries'],
    refetchInterval: 30000, // Refresh every 30 seconds
  })
  
  // Mock user data - replace with real auth when available
  const mockUser = {
    id: 'mock-user-id',
    firstName: 'Demo',
    lastName: 'User', 
    email: 'user@example.com',
    profileImageUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150'
  }

  // Transform API entries to include user data for display
  const displayEntries: JournalEntryWithUser[] = entries.map(entry => ({
    ...entry,
    user: mockUser, // For now, all entries show current user
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
    console.log('Edit entry:', entryId)
  }

  const handleShare = (entryId: string) => {
    console.log('Share entry:', entryId)
  }

  const handleDelete = (entryId: string) => {
    console.log('Delete entry:', entryId)
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
              <AvatarImage src={mockUser.profileImageUrl} alt={mockUser.firstName} />
              <AvatarFallback>{mockUser.firstName[0]}</AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-lg font-semibold text-foreground">Good morning, {mockUser.firstName}</h1>
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
                <p className="text-lg font-semibold text-foreground">12</p>
                <p className="text-xs text-muted-foreground">This week</p>
              </div>
            </div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 bg-accent rounded-full" />
              <div>
                <p className="text-lg font-semibold text-foreground">5</p>
                <p className="text-xs text-muted-foreground">Recordings</p>
              </div>
            </div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 bg-primary rounded-full" />
              <div>
                <p className="text-lg font-semibold text-foreground">28</p>
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
                onPlayAudio={handlePlayAudio}
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
                <Button size="lg" data-testid="button-create-first-entry">
                  Create Your First Entry
                </Button>
              </div>
            )}
          </div>
        </ScrollArea>
      </main>
    </div>
  )
}