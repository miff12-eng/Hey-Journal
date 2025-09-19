import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Search as SearchIcon, Filter, Calendar, Hash, User, Clock, Sparkles, Brain } from 'lucide-react'
import JournalEntryCard from '@/components/JournalEntryCard'
import ThemeToggle from '@/components/ThemeToggle'
import { JournalEntryWithUser } from '@shared/schema'
import { useMutation } from '@tanstack/react-query'
import { apiRequest } from '@/lib/queryClient'
import { Link } from 'wouter'

// Function to parse AI answer and convert entry references to links
function parseAnswerWithLinks(answer: string, relevantEntries?: EnhancedSearchResult[]): React.ReactNode[] {
  // Split on both UUID format and title format patterns (case-insensitive)
  const parts = answer.split(/(\[entry:\s*["']?[^[\]]+["']?\s*\])/gi)
  
  return parts.map((part, index) => {
    // First try UUID format (including quoted UUIDs, case-insensitive)
    const uuidMatch = part.match(/\[entry:\s*["']?([a-fA-F0-9-]{8}-[a-fA-F0-9-]{4}-[a-fA-F0-9-]{4}-[a-fA-F0-9-]{4}-[a-fA-F0-9-]{12})["']?\s*\]/i)
    if (uuidMatch) {
      const entryId = uuidMatch[1]
      return (
        <Link key={index} href={`/e/${entryId}`} data-testid={`link-entry-${entryId}`}>
          <span className="text-blue-600 dark:text-blue-400 underline hover:text-blue-800 dark:hover:text-blue-300 cursor-pointer">
            this entry
          </span>
        </Link>
      )
    }

    // Try title format as fallback
    const titleMatch = part.match(/\[entry:\s*["']?([^[\]"']+)["']?\s*\]/)
    if (titleMatch && relevantEntries) {
      const title = titleMatch[1].trim()
      // Find matching entry by title
      const matchingEntry = relevantEntries.find(entry => 
        entry.title === title || 
        (entry.snippet && entry.snippet.includes(`Title: ${title}`))
      )
      
      if (matchingEntry) {
        return (
          <Link key={index} href={`/e/${matchingEntry.entryId}`}>
            <span className="text-blue-600 dark:text-blue-400 underline hover:text-blue-800 dark:hover:text-blue-300 cursor-pointer">
              this entry
            </span>
          </Link>
        )
      }
    }
    
    return <span key={index}>{part}</span>
  })
}

// AnswerCard component for displaying AI-generated answers
interface AnswerCardProps {
  answer: string
  confidence: number
  executionTime: number
  totalResults: number
  relevantEntries?: EnhancedSearchResult[]
}

function AnswerCard({ answer, confidence, executionTime, totalResults, relevantEntries }: AnswerCardProps) {
  const parsedAnswer = parseAnswerWithLinks(answer, relevantEntries)
  
  return (
    <Card className="p-6 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20 border-blue-200 dark:border-blue-800 mb-6" data-testid="answer-card">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0">
          <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
        </div>
        <div className="flex-1 space-y-3">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-blue-900 dark:text-blue-100">AI Answer</h3>
            <Badge variant="outline" className="text-xs border-blue-300 text-blue-700 dark:border-blue-600 dark:text-blue-300">
              {Math.round(confidence * 100)}% confident
            </Badge>
          </div>
          <div className="text-blue-800 dark:text-blue-200 leading-relaxed" data-testid="answer-text">
            {parsedAnswer}
          </div>
          <div className="flex items-center gap-4 text-xs text-blue-600 dark:text-blue-400">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {executionTime}ms
            </span>
            <span className="flex items-center gap-1">
              <Hash className="w-3 h-3" />
              {totalResults} source{totalResults !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>
    </Card>
  )
}

// Search types
type SearchMode = 'semantic'
type FilterType = 'all' | 'tags' | 'date'

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

// Conversational search response with AI-generated answer
interface ConversationalSearchResponse {
  query: string
  mode: string // 'conversational'
  answer: string
  relevantEntries: EnhancedSearchResult[]
  confidence: number
  totalResults: number
  executionTime: number
}

export default function Search() {
  const [searchQuery, setSearchQuery] = useState('')
  const [hasSearched, setHasSearched] = useState(false)
  const [searchMode, setSearchMode] = useState<SearchMode>('semantic')
  const [activeFilter, setActiveFilter] = useState<FilterType>('all')
  const [searchResults, setSearchResults] = useState<EnhancedSearchResult[]>([])
  const [conversationalResult, setConversationalResult] = useState<ConversationalSearchResponse | null>(null)
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [dateRange, setDateRange] = useState<{from?: string, to?: string}>({})
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null)
  const [expandedEntry, setExpandedEntry] = useState<JournalEntryWithUser | null>(null)
  const [isLoadingEntry, setIsLoadingEntry] = useState(false)
  
  // Enhanced search mutation using AI conversational search
  const searchMutation = useMutation({
    mutationFn: async (params: { query: string; mode: SearchMode; filters?: any }) => {
      console.log('🚀 Performing enhanced AI conversational search:', params);
      
      // Create AbortController for timeout handling
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, 30000); // 30 second timeout
      
      try {
        const response = await fetch('/api/search/enhanced', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: params.query,
            mode: 'conversational', // Use conversational mode for AI answers + citations
            limit: 20,
            filters: params.filters || {},
            previousMessages: [] // Empty for single-shot Q&A
          }),
          credentials: 'include', // Maintain session consistency
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          const text = await response.text() || response.statusText;
          throw new Error(`${response.status}: ${text}`);
        }
        
        const data = await response.json() as ConversationalSearchResponse;
        console.log('🎯 Conversational search results:', data);
        return data;
      } catch (error) {
        clearTimeout(timeoutId);
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error('Search timed out. Please try with a simpler query.');
        }
        throw error;
      }
    },
    onMutate: () => {
      setHasSearched(true); // Set immediately when search starts
    },
    onSuccess: (data) => {
      setConversationalResult(data);
      setSearchResults(data.relevantEntries); // Set citations as search results for consistency
    },
    onError: (error) => {
      console.error('Search error:', error);
      setConversationalResult(null);
      setSearchResults([]);
    }
  });

  // Build filters object based on selected values and active filter
  const buildFilters = () => {
    const filters: any = {};
    
    // Add filter type based on active filter
    if (activeFilter !== 'all') {
      filters.filterType = activeFilter;
    }
    
    if (selectedTags.length > 0) {
      filters.tags = selectedTags;
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

  // Manual search function - triggers only when user presses Enter
  const performSearch = () => {
    if (searchQuery.trim()) {
      searchMutation.mutate({ 
        query: searchQuery, 
        mode: searchMode,
        filters: buildFilters()
      });
    } else {
      setSearchResults([]);
    }
  };

  // Handle Enter key press in search input
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      performSearch();
    }
  };

  // Debounced search effect for filters
  useEffect(() => {
    if (hasSearched && searchQuery.trim()) {
      // Debounce date input changes to prevent multiple searches while typing
      const timeoutId = setTimeout(() => {
        // Only perform search if date inputs are complete or empty
        const isDateRangeValid = (!dateRange.from || dateRange.from.match(/^\d{4}-\d{2}-\d{2}$/)) &&
                                 (!dateRange.to || dateRange.to.match(/^\d{4}-\d{2}-\d{2}$/));
        
        if (isDateRangeValid) {
          performSearch();
        }
      }, 500); // 500ms debounce
      
      return () => clearTimeout(timeoutId);
    }
  }, [activeFilter, selectedTags, dateRange]);

  // Fetch full journal entry
  const fetchFullEntry = async (entryId: string) => {
    setIsLoadingEntry(true);
    try {
      const response = await fetch(`/api/journal/entries/${entryId}`, {
        credentials: 'include'
      });
      if (response.ok) {
        const entry = await response.json() as JournalEntryWithUser;
        setExpandedEntry(entry);
        setExpandedEntryId(entryId);
      } else {
        console.error('Failed to fetch entry:', response.statusText);
      }
    } catch (error) {
      console.error('Error fetching entry:', error);
    } finally {
      setIsLoadingEntry(false);
    }
  };

  // Handle view full entry
  const handleViewFullEntry = (entryId: string) => {
    if (expandedEntryId === entryId) {
      // If already expanded, collapse it
      setExpandedEntryId(null);
      setExpandedEntry(null);
    } else {
      // Expand the entry
      fetchFullEntry(entryId);
    }
  };


  const filters = [
    { key: 'all' as const, label: 'All', icon: SearchIcon },
    { key: 'tags' as const, label: 'Tags', icon: Hash },
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
            placeholder="Ask questions about your journal entries... (Press Enter to search)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
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

        {/* Filter configuration panels */}
        {activeFilter === 'tags' && (
          <div className="mt-4 p-3 bg-muted/50 rounded-lg border border-border">
            <h3 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
              <Hash className="h-4 w-4" />
              Tag Filter
            </h3>
            <div className="space-y-2">
              <Input
                placeholder="Enter tags (e.g., travel, work, gratitude)"
                value={selectedTags.join(', ')}
                onChange={(e) => {
                  const tags = e.target.value.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
                  setSelectedTags(tags);
                }}
                data-testid="input-tag-filter"
              />
              {selectedTags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {selectedTags.map((tag, index) => (
                    <Badge 
                      key={index}
                      variant="secondary" 
                      className="cursor-pointer"
                      onClick={() => setSelectedTags(selectedTags.filter((_, i) => i !== index))}
                      data-testid={`tag-filter-${tag}`}
                    >
                      {tag} ×
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeFilter === 'date' && (
          <div className="mt-4 p-3 bg-muted/50 rounded-lg border border-border">
            <h3 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Date Range Filter
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">From</label>
                <Input
                  type="date"
                  value={dateRange.from || ''}
                  onChange={(e) => setDateRange(prev => ({ ...prev, from: e.target.value }))}
                  data-testid="input-date-from"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">To</label>
                <Input
                  type="date"
                  value={dateRange.to || ''}
                  onChange={(e) => setDateRange(prev => ({ ...prev, to: e.target.value }))}
                  data-testid="input-date-to"
                />
              </div>
            </div>
            {(dateRange.from || dateRange.to) && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setDateRange({})}
                className="mt-2"
                data-testid="button-clear-date-filter"
              >
                Clear Date Filter
              </Button>
            )}
          </div>
        )}
      </header>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6 pb-20">
          {/* Search results */}
          {searchQuery && hasSearched && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-foreground">
                  {searchMutation.isPending ? 'Searching...' : 
                    hasSearched ? `${searchMutation.data?.totalResults || 0} result${(searchMutation.data?.totalResults || 0) !== 1 ? 's' : ''} for "${searchQuery}"` : ''
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
                <div className="space-y-6">
                  {/* AI answer loading skeleton */}
                  <Card className="p-6 border-primary/20 bg-primary/5">
                    <div className="animate-pulse">
                      <div className="flex items-center gap-2 mb-4">
                        <div className="h-5 w-5 bg-muted rounded-full"></div>
                        <div className="h-4 bg-muted rounded w-32"></div>
                      </div>
                      <div className="space-y-3">
                        <div className="h-4 bg-muted rounded w-full"></div>
                        <div className="h-4 bg-muted rounded w-4/5"></div>
                        <div className="h-4 bg-muted rounded w-3/4"></div>
                      </div>
                      <div className="flex items-center gap-4 mt-4 pt-4 border-t border-border">
                        <div className="h-3 bg-muted rounded w-20"></div>
                        <div className="h-3 bg-muted rounded w-16"></div>
                        <div className="h-3 bg-muted rounded w-24"></div>
                      </div>
                    </div>
                  </Card>
                  
                  {/* Citations loading skeleton */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-4 bg-muted rounded animate-pulse"></div>
                      <div className="h-4 bg-muted rounded w-40 animate-pulse"></div>
                    </div>
                    {[...Array(2)].map((_, i) => (
                      <Card key={i} className="p-4 animate-pulse">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="h-5 bg-muted rounded w-16"></div>
                          <div className="h-3 bg-muted rounded w-32"></div>
                        </div>
                        <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                        <div className="h-3 bg-muted rounded w-full mb-1"></div>
                        <div className="h-3 bg-muted rounded w-2/3"></div>
                      </Card>
                    ))}
                  </div>
                </div>
              ) : conversationalResult ? (
                <div className="space-y-6">
                  {/* AI-generated answer */}
                  <AnswerCard 
                    answer={conversationalResult.answer}
                    confidence={conversationalResult.confidence}
                    executionTime={conversationalResult.executionTime}
                    totalResults={conversationalResult.totalResults}
                    relevantEntries={conversationalResult.relevantEntries}
                  />
                  
                  {/* Supporting entries/citations */}
                  {conversationalResult.relevantEntries && conversationalResult.relevantEntries.length > 0 && (
                    <div className="space-y-4">
                      <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2" data-testid="citations-header">
                        <Hash className="w-4 h-4" />
                        Supporting Entries ({conversationalResult.relevantEntries.length})
                      </h4>
                      <div className="space-y-4">
                        {conversationalResult.relevantEntries.map((result) => (
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
                                  handleViewFullEntry(result.entryId);
                                }}
                                disabled={isLoadingEntry}
                                data-testid={`button-view-entry-${result.entryId}`}>
                          {isLoadingEntry && expandedEntryId === result.entryId ? 
                            'Loading...' : 
                            expandedEntryId === result.entryId ? 'Close Entry' : 'View Full Entry'
                          }
                        </Button>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Sparkles className="w-3 h-3" />
                          AI Enhanced Search
                        </div>
                      </div>

                      {/* Expanded entry view */}
                      {expandedEntryId === result.entryId && expandedEntry && (
                        <div className="mt-4 border-t border-border pt-4">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="text-sm font-medium text-foreground">Full Entry</h4>
                            <Button variant="ghost" size="sm" 
                                    onClick={() => {
                                      setExpandedEntryId(null);
                                      setExpandedEntry(null);
                                    }}
                                    data-testid={`button-close-entry-${result.entryId}`}>
                              Close
                            </Button>
                          </div>
                          <JournalEntryCard 
                            entry={expandedEntry}
                            onEdit={() => {}}
                            onShare={() => {}}
                            onDelete={() => {}}
                            className="border-0 shadow-none p-0"
                          />
                        </div>
                      )}
                    </Card>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : searchMutation.error ? (
                <Card className="p-8 text-center border-destructive/20 bg-destructive/5">
                  <div className="flex flex-col items-center">
                    <div className="p-3 rounded-full bg-destructive/10 mb-4">
                      <SearchIcon className="h-8 w-8 text-destructive" />
                    </div>
                    <h3 className="text-lg font-medium text-foreground mb-2">AI Search Failed</h3>
                    <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
                      {(() => {
                        const errorMessage = searchMutation.error instanceof Error ? searchMutation.error.message.toLowerCase() : '';
                        if (errorMessage.includes('openai') || errorMessage.includes('ai service')) {
                          return "AI service is temporarily unavailable. Please try again in a moment.";
                        }
                        if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
                          return "Search timed out. Your query might be too complex. Try using simpler terms.";
                        }
                        if (errorMessage.includes('network') || errorMessage.includes('failed to fetch') || errorMessage.includes('fetch')) {
                          return "Network connection issue. Please check your internet and try again.";
                        }
                        return "Unable to search your journal entries right now. This might be due to a temporary AI service issue.";
                      })()}
                    </p>
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => searchMutation.mutate({ query: searchQuery, mode: searchMode, filters: buildFilters() })}
                        data-testid="button-retry-search"
                        disabled={searchMutation.isPending}
                      >
                        {searchMutation.isPending ? 'Retrying...' : 'Try Again'}
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => {
                          setSearchQuery("");
                          setHasSearched(false);
                        }}
                        data-testid="button-clear-search"
                      >
                        Clear Search
                      </Button>
                    </div>
                    <details className="mt-4 text-xs text-muted-foreground max-w-sm">
                      <summary className="cursor-pointer hover:text-foreground">Technical Details</summary>
                      <p className="mt-2 text-left bg-muted p-2 rounded text-xs font-mono">
                        {searchMutation.error instanceof Error ? searchMutation.error.message : 'Unknown error occurred'}
                      </p>
                    </details>
                  </div>
                </Card>
              ) : (
                <Card className="p-8 text-center border-amber-200/50 bg-amber-50/50">
                  <div className="flex flex-col items-center">
                    <div className="p-3 rounded-full bg-amber-100 mb-4">
                      <SearchIcon className="h-8 w-8 text-amber-600" />
                    </div>
                    <h3 className="text-lg font-medium text-foreground mb-2">No matching entries found</h3>
                    <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
                      AI couldn't find journal entries that match your question. Try asking differently or about topics you've definitely written about.
                    </p>
                    <div className="bg-muted/50 rounded-lg p-4 mb-4 max-w-sm">
                      <p className="text-xs font-medium text-muted-foreground mb-2">Try asking:</p>
                      <div className="text-xs text-muted-foreground space-y-1">
                        <p>• "What did I write about [specific topic]?"</p>
                        <p>• "Show me entries from [time period]"</p>
                        <p>• "Find entries where I felt [emotion]"</p>
                        <p>• "What are my thoughts on [subject]?"</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => {
                          setSearchQuery("");
                          setHasSearched(false);
                        }}
                        data-testid="button-clear-search"
                      >
                        Clear Search
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => searchMutation.mutate({ query: searchQuery, mode: searchMode, filters: buildFilters() })}
                        data-testid="button-retry-search"
                      >
                        Try Again
                      </Button>
                    </div>
                  </div>
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