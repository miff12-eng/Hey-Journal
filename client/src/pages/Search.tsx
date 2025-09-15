import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Search as SearchIcon, Filter, Calendar, Hash, User, Clock } from 'lucide-react'
import JournalEntryCard from '@/components/JournalEntryCard'
import ThemeToggle from '@/components/ThemeToggle'
import { JournalEntryWithUser } from '@shared/schema'

export default function Search() {
  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<'all' | 'text' | 'tags' | 'date' | 'people'>('all')
  
  // Mock search results - todo: replace with real search
  const mockResults: JournalEntryWithUser[] = [
    {
      id: '1',
      userId: 'user1',
      title: 'Mindful Morning',
      content: 'Started with meditation and gratitude practice...',
      audioUrl: undefined,
      mediaUrls: [],
      tags: ['meditation', 'morning', 'gratitude'],
      privacy: 'public' as const,
      sharedWith: [],
      createdAt: new Date('2024-01-10T08:00:00Z'),
      updatedAt: new Date('2024-01-10T08:00:00Z'),
      user: {
        id: 'user1',
        email: 'user@example.com',
        firstName: 'Sarah',
        lastName: 'Wilson',
        profileImageUrl: 'https://images.unsplash.com/photo-1494790108755-2616b2dc1193?w=150',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    }
  ]

  const recentSearches = ['morning routine', 'family time', 'travel memories', 'work reflections']
  const suggestedTags = ['meditation', 'gratitude', 'family', 'travel', 'work', 'goals', 'reflection']

  const filters = [
    { key: 'all' as const, label: 'All', icon: SearchIcon },
    { key: 'text' as const, label: 'Text', icon: SearchIcon },
    { key: 'tags' as const, label: 'Tags', icon: Hash },
    { key: 'date' as const, label: 'Date', icon: Calendar },
    { key: 'people' as const, label: 'People', icon: User }
  ]

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background border-b border-border px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-semibold text-foreground">Search</h1>
          <ThemeToggle />
        </div>
        
        {/* Search input */}
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search your journal..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-4"
            data-testid="input-search"
          />
        </div>
        
        {/* Filter buttons */}
        <div className="flex gap-2 mt-3 overflow-x-auto">
          {filters.map((filter) => {
            const Icon = filter.icon
            return (
              <Button
                key={filter.key}
                variant={activeFilter === filter.key ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveFilter(filter.key)}
                className="flex-shrink-0"
                data-testid={`filter-${filter.key}`}
              >
                <Icon className="h-3 w-3 mr-1" />
                {filter.label}
              </Button>
            )
          })}
        </div>
      </header>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6 pb-20">
          {/* Recent searches */}
          {!searchQuery && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Recent Searches
                </h3>
                <div className="flex flex-wrap gap-2">
                  {recentSearches.map((search) => (
                    <Badge 
                      key={search}
                      variant="outline" 
                      className="cursor-pointer hover-elevate"
                      onClick={() => setSearchQuery(search)}
                      data-testid={`recent-search-${search.replace(/\\s+/g, '-')}`}
                    >
                      {search}
                    </Badge>
                  ))}
                </div>
              </div>
              
              <div>
                <h3 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
                  <Hash className="h-4 w-4" />
                  Popular Tags
                </h3>
                <div className="flex flex-wrap gap-2">
                  {suggestedTags.map((tag) => (
                    <Badge 
                      key={tag}
                      variant="secondary" 
                      className="cursor-pointer hover-elevate"
                      onClick={() => setSearchQuery(`#${tag}`)}
                      data-testid={`suggested-tag-${tag}`}
                    >
                      #{tag}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          )}
          
          {/* Search results */}
          {searchQuery && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-foreground">
                  {mockResults.length} result{mockResults.length !== 1 ? 's' : ''} for "{searchQuery}"
                </h3>
                <Button variant="outline" size="sm" data-testid="button-advanced-search">
                  <Filter className="h-3 w-3 mr-1" />
                  Filters
                </Button>
              </div>
              
              {mockResults.length > 0 ? (
                <div className="space-y-4">
                  {mockResults.map((entry) => (
                    <JournalEntryCard
                      key={entry.id}
                      entry={entry}
                      onEdit={(id) => console.log('Edit:', id)}
                      onShare={(id) => console.log('Share:', id)}
                      onDelete={(id) => console.log('Delete:', id)}
                      onPlayAudio={(url) => console.log('Play:', url)}
                    />
                  ))}
                </div>
              ) : (
                <Card className="p-8 text-center">
                  <SearchIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">No results found</h3>
                  <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                    Try adjusting your search terms or filters to find what you are looking for.
                  </p>
                </Card>
              )}
            </div>
          )}
          
          {/* Empty state when no search */}
          {!searchQuery && (
            <Card className="p-8 text-center mt-8">
              <SearchIcon className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-xl font-medium text-foreground mb-2">Search Your Journal</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
                Find specific entries, explore themes, or discover patterns in your writing. Search by keywords, tags, dates, or people mentioned.
              </p>
              <div className="space-y-2 text-xs text-muted-foreground max-w-sm mx-auto">
                <p><strong>Pro tips:</strong></p>
                <p>• Use #tags to find entries with specific themes</p>
                <p>• Search @mentions to find entries about people</p>
                <p>• Type dates like "January 2024" to find entries from specific periods</p>
              </div>
            </Card>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}