import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Search as SearchIcon, Filter, Calendar, Hash, User, Clock, Sparkles, Brain } from 'lucide-react'
import JournalEntryCard from '@/components/JournalEntryCard'
import ThemeToggle from '@/components/ThemeToggle'
import { JournalEntryWithUser } from '@shared/schema'
import { useMutation } from '@tanstack/react-query'
import { apiRequest } from '@/lib/queryClient'

// Search types
type SearchMode = 'keyword' | 'semantic'
type FilterType = 'all' | 'tags' | 'date' | 'people' | 'sentiment'

interface SearchMatch {
  field: string
  snippet: string
  score: number
}

interface SearchResult {
  entry: JournalEntryWithUser
  matches: SearchMatch[]
  confidence: number
  matchReason: string
}

interface SearchResponse {
  query: string
  mode: SearchMode
  totalResults: number
  results: SearchResult[]
  executionTime: number
}

export default function Search() {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchMode, setSearchMode] = useState<SearchMode>('keyword')
  const [activeFilter, setActiveFilter] = useState<FilterType>('all')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [selectedSentiment, setSelectedSentiment] = useState<'positive' | 'neutral' | 'negative' | ''>('')
  const [dateRange, setDateRange] = useState<{from?: string, to?: string}>({})
  
  // Search mutation
  const searchMutation = useMutation({
    mutationFn: async (params: { query: string; mode: SearchMode; filters?: any }) => {
      console.log('🔍 Performing search:', params);
      const response = await apiRequest<SearchResponse>('/api/search', {
        method: 'POST',
        body: JSON.stringify({
          query: params.query,
          mode: params.mode,
          limit: 20,
          filters: params.filters || {}
        })
      });
      console.log('📊 Search results:', response);
      return response;
    },
    onSuccess: (data) => {
      setSearchResults(data.results);
    },
    onError: (error) => {
      console.error('Search error:', error);
      setSearchResults([]);
    }
  });

  // Build filters object based on selected values
  const buildFilters = () => {
    const filters: any = {};
    
    if (selectedTags.length > 0) {
      filters.tags = selectedTags;
    }
    
    if (selectedSentiment) {
      filters.sentiment = selectedSentiment;
    }
    
    if (dateRange.from || dateRange.to) {
      filters.dateRange = {};
      if (dateRange.from) filters.dateRange.from = dateRange.from;
      if (dateRange.to) filters.dateRange.to = dateRange.to;
    }
    
    return filters;
  };

  // Perform search when query or filter values change
  useEffect(() => {
    if (searchQuery.trim()) {
      const timer = setTimeout(() => {
        searchMutation.mutate({ 
          query: searchQuery, 
          mode: searchMode,
          filters: buildFilters()
        });
      }, 300); // Debounce search
      return () => clearTimeout(timer);
    } else {
      setSearchResults([]);
    }
  }, [searchQuery, searchMode, selectedTags, selectedSentiment, dateRange]);

  const recentSearches = ['morning routine', 'family time', 'travel memories', 'work reflections']
  const suggestedTags = ['meditation', 'gratitude', 'family', 'travel', 'work', 'goals', 'reflection']

  const filters = [
    { key: 'all' as const, label: 'All', icon: SearchIcon },
    { key: 'tags' as const, label: 'Tags', icon: Hash },
    { key: 'sentiment' as const, label: 'Mood', icon: Sparkles },
    { key: 'date' as const, label: 'Date', icon: Calendar }
  ]

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background border-b border-border px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-semibold text-foreground">Search</h1>
          <ThemeToggle />
        </div>
        
        {/* Search mode toggle */}
        <div className="flex gap-2 mb-3">
          <Button
            variant={searchMode === 'keyword' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSearchMode('keyword')}
            className="flex-1"
            data-testid="mode-keyword"
          >
            <SearchIcon className="h-3 w-3 mr-1" />
            Keyword
          </Button>
          <Button
            variant={searchMode === 'semantic' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSearchMode('semantic')}
            className="flex-1"
            data-testid="mode-semantic"
          >
            <Brain className="h-3 w-3 mr-1" />
            AI Search
          </Button>
        </div>

        {/* Search input */}
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={searchMode === 'keyword' ? "Search by keywords, tags, or content..." : "Ask questions about your journal entries..."}
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
                  {searchMutation.isLoading ? 'Searching...' : 
                    `${searchResults.length} result${searchResults.length !== 1 ? 's' : ''} for "${searchQuery}"`
                  }
                </h3>
                <div className="flex gap-2">
                  <Badge variant="outline" className="text-xs" data-testid="search-mode-indicator">
                    {searchMode === 'semantic' ? 'AI' : 'Keyword'} Mode
                  </Badge>
                  {searchMutation.data?.executionTime && (
                    <Badge variant="secondary" className="text-xs" data-testid="search-time">
                      {searchMutation.data.executionTime}ms
                    </Badge>
                  )}
                </div>
              </div>
              
              {searchMutation.isLoading ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <Card key={i} className="p-4 animate-pulse">
                      <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                      <div className="h-3 bg-muted rounded w-1/2 mb-1"></div>
                      <div className="h-3 bg-muted rounded w-2/3"></div>
                    </Card>
                  ))}
                </div>
              ) : searchResults.length > 0 ? (
                <div className="space-y-4">
                  {searchResults.map((result) => (
                    <div key={result.entry.id} className="space-y-2">
                      {/* Match reason and confidence */}
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline" className="px-1.5 py-0.5 text-xs">
                          {(result.confidence * 100).toFixed(0)}% match
                        </Badge>
                        <span>{result.matchReason}</span>
                      </div>
                      
                      <JournalEntryCard
                        entry={result.entry}
                        onEdit={(id) => console.log('Edit:', id)}
                        onShare={(id) => console.log('Share:', id)}
                        onDelete={(id) => console.log('Delete:', id)}
                        onPlayAudio={(url) => console.log('Play:', url)}
                      />
                      
                      {/* Show match highlights */}
                      {result.matches.length > 0 && (
                        <div className="ml-4 space-y-1">
                          {result.matches.map((match, idx) => (
                            <div key={idx} className="text-xs">
                              <Badge variant="secondary" className="px-1 py-0.5 text-xs mr-1">
                                {match.field}
                              </Badge>
                              <span className="text-muted-foreground italic">
                                "{match.snippet.substring(0, 100)}{match.snippet.length > 100 ? '...' : ''}"
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : searchMutation.error ? (
                <Card className="p-8 text-center border-destructive/20">
                  <SearchIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">Search Error</h3>
                  <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-4">
                    There was an error searching your journal. Please try again.
                  </p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => searchMutation.mutate({ query: searchQuery, mode: searchMode })}
                    data-testid="button-retry-search"
                  >
                    Try Again
                  </Button>
                </Card>
              ) : (
                <Card className="p-8 text-center">
                  <SearchIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">No results found</h3>
                  <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-4">
                    {searchMode === 'semantic' 
                      ? "Try rephrasing your question or asking about different topics in your journal."
                      : "Try different keywords, tags, or filters to find what you're looking for."
                    }
                  </p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setSearchMode(searchMode === 'keyword' ? 'semantic' : 'keyword')}
                    data-testid="button-switch-mode"
                  >
                    Try {searchMode === 'keyword' ? 'AI Search' : 'Keyword Search'}
                  </Button>
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