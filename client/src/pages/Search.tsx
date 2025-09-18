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
type SearchMode = 'semantic'
type FilterType = 'all' | 'tags' | 'date' | 'people' | 'sentiment'

// Enhanced search result from the backend API
interface EnhancedSearchResult {
  entryId: string
  similarity: number
  snippet: string
  title?: string
  matchReason: string
}

interface EnhancedSearchResponse {
  query: string
  mode: string // 'hybrid' | 'keyword' | 'vector'
  results: EnhancedSearchResult[]
  totalResults: number
  executionTime: number
}

export default function Search() {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchMode, setSearchMode] = useState<SearchMode>('semantic')
  const [activeFilter, setActiveFilter] = useState<FilterType>('all')
  const [searchResults, setSearchResults] = useState<EnhancedSearchResult[]>([])
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [selectedSentiment, setSelectedSentiment] = useState<'positive' | 'neutral' | 'negative' | ''>('')
  const [dateRange, setDateRange] = useState<{from?: string, to?: string}>({})
  
  // Enhanced search mutation using AI semantic search
  const searchMutation = useMutation({
    mutationFn: async (params: { query: string; mode: SearchMode; filters?: any }) => {
      console.log('🚀 Performing enhanced AI search:', params);
      const response = await apiRequest('POST', '/api/search/enhanced', {
        query: params.query,
        mode: params.mode === 'semantic' ? 'hybrid' : 'keyword', // Map semantic to hybrid for better results
        limit: 20,
        filters: params.filters || {}
      });
      const data = await response.json() as EnhancedSearchResponse;
      console.log('🎯 Enhanced search results:', data);
      return data;
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
        

        {/* Search input */}
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Ask questions about your journal entries..."
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
                  {searchMutation.isPending ? 'Searching...' : 
                    `${searchMutation.data?.totalResults || 0} result${(searchMutation.data?.totalResults || 0) !== 1 ? 's' : ''} for "${searchQuery}"`
                  }
                </h3>
                <div className="flex gap-2">
                  <Badge variant="outline" className="text-xs" data-testid="search-mode-indicator">
                    AI Search
                  </Badge>
                  {searchMutation.data?.executionTime && (
                    <Badge variant="secondary" className="text-xs" data-testid="search-time">
                      {searchMutation.data.executionTime}ms
                    </Badge>
                  )}
                </div>
              </div>
              
              {searchMutation.isPending ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <Card key={i} className="p-4 animate-pulse">
                      <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                      <div className="h-3 bg-muted rounded w-1/2 mb-1"></div>
                      <div className="h-3 bg-muted rounded w-2/3"></div>
                    </Card>
                  ))}
                </div>
              ) : searchMutation.data && searchMutation.data.results && searchMutation.data.results.length > 0 ? (
                <div className="space-y-4">
                  {searchMutation.data.results.map((result) => (
                    <Card key={result.entryId} className="p-4 hover-elevate cursor-pointer" 
                          onClick={() => console.log('Navigate to entry:', result.entryId)}
                          data-testid={`search-result-${result.entryId}`}>
                      {/* Match reason and similarity score */}
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                        <Badge variant="outline" className="px-1.5 py-0.5 text-xs">
                          <Brain className="w-3 h-3 mr-1" />
                          {(result.similarity * 100).toFixed(0)}% match
                        </Badge>
                        <span className="italic">{result.matchReason}</span>
                      </div>
                      
                      {/* Entry title */}
                      {result.title && (
                        <h3 className="font-medium text-foreground mb-2 line-clamp-2">
                          {result.title}
                        </h3>
                      )}
                      
                      {/* Entry snippet */}
                      <p className="text-sm text-muted-foreground line-clamp-3 mb-3">
                        {result.snippet}
                      </p>
                      
                      {/* View full entry link */}
                      <div className="flex items-center justify-between">
                        <Button variant="outline" size="sm" 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  console.log('View full entry:', result.entryId);
                                }}
                                data-testid={`button-view-entry-${result.entryId}`}>
                          View Full Entry
                        </Button>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Sparkles className="w-3 h-3" />
                          AI Enhanced Search
                        </div>
                      </div>
                    </Card>
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
                    Try rephrasing your question or asking about different topics in your journal.
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
              )}
            </div>
          )}
          
          {/* Empty state when no search */}
          {!searchQuery && (
            <Card className="p-8 text-center mt-8">
              <SearchIcon className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-xl font-medium text-foreground mb-2">AI-Powered Journal Search</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
                Ask questions about your journal entries using natural language. AI will understand the meaning and context to find relevant entries.
              </p>
              <div className="space-y-2 text-xs text-muted-foreground max-w-sm mx-auto">
                <p><strong>Try asking:</strong></p>
                <p>• "What entries mention my family?"</p>
                <p>• "Show me my thoughts about work"</p>
                <p>• "Find entries where I felt grateful"</p>
                <p>• "What did I write about last month?"</p>
              </div>
            </Card>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}