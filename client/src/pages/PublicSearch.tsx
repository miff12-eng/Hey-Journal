import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Search, Users, FileText, Mic, LogIn, ArrowRight } from "lucide-react"
import AudioPlayer from "@/components/AudioPlayer"
import { useQuery } from "@tanstack/react-query"
import { Link, useLocation } from "wouter"
import { useAuth } from "@/hooks/useAuth"
import ThemeToggle from "@/components/ThemeToggle"

interface PublicUser {
  id: string
  username: string
  firstName: string | null
  lastName: string | null
  bio: string | null
  profileImageUrl: string | null
  publicEntriesCount: number
}

interface PublicJournalEntry {
  id: string
  userId: string
  title: string | null
  content: string
  audioUrl: string | null
  audioPlayable: boolean
  mediaUrls: string[]
  tags: string[]
  createdAt: string
  updatedAt: string
  user: {
    id: string
    username: string
    firstName: string | null
    lastName: string | null
    bio: string | null
    profileImageUrl: string | null
  }
}

export default function PublicSearch() {
  const [query, setQuery] = useState("")
  const [activeTab, setActiveTab] = useState("users")
  const { login } = useAuth()
  const [, setLocation] = useLocation()

  // Search users query
  const usersQuery = useQuery<PublicUser[]>({
    queryKey: [`/api/public/users/search?q=${encodeURIComponent(query)}`],
    enabled: !!query.trim() && activeTab === "users"
  })

  // Search entries query
  const entriesQuery = useQuery<{ entries: PublicJournalEntry[] }>({
    queryKey: [`/api/public/entries/search?q=${encodeURIComponent(query)}`],
    enabled: !!query.trim() && activeTab === "entries"
  })

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    // Trigger refetch when form is submitted
    if (activeTab === "users") {
      usersQuery.refetch()
    } else {
      entriesQuery.refetch()
    }
  }

  const formatName = (user: PublicUser | PublicJournalEntry["user"]) => {
    if (user.firstName || user.lastName) {
      return `${user.firstName || ""} ${user.lastName || ""}`.trim()
    }
    return user.username
  }

  const getInitials = (user: PublicUser | PublicJournalEntry["user"]) => {
    const initials = (user.firstName?.[0] || "") + (user.lastName?.[0] || "")
    return initials || user.username[0]?.toUpperCase() || "?"
  }

  const handleUsernameClick = (event: React.MouseEvent, username: string) => {
    event.stopPropagation()
    setLocation(`/u/${username}`)
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Top Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/public">
            <div className="flex items-center gap-2 cursor-pointer hover-elevate rounded-lg p-2 -m-2">
              <div className="h-8 w-8 bg-primary rounded-lg flex items-center justify-center">
                <Mic className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="text-lg font-semibold text-foreground">Journal</span>
            </div>
          </Link>
          
          <div className="flex items-center gap-3">
            <Button 
              onClick={login} 
              size="sm" 
              className="flex items-center gap-2"
              data-testid="button-login"
            >
              <LogIn className="h-4 w-4" />
              Sign In
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto p-4 space-y-6">
        {/* Welcome Hero Section */}
        <div className="text-center space-y-4 py-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-medium">
            <Search className="h-3 w-3" />
            Public Discovery
          </div>
          <h1 className="text-4xl font-bold text-foreground">
            Discover Amazing Stories
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Explore public profiles and journal entries from our community. 
            Ready to start your own journaling journey?
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center pt-4">
            <Button 
              onClick={login} 
              size="lg"
              className="flex items-center gap-2 text-base px-8"
              data-testid="button-get-started-hero"
            >
              Get Started Free
              <ArrowRight className="h-4 w-4" />
            </Button>
            <p className="text-sm text-muted-foreground">
              Join thousands using Journal to capture their thoughts
            </p>
          </div>
        </div>

        {/* Search Section */}
        <div className="space-y-4">
          <div className="text-center">
            <h2 className="text-2xl font-semibold text-foreground mb-2">Browse Public Content</h2>
            <p className="text-muted-foreground">
              Search through public profiles and journal entries to discover inspiring stories
            </p>
          </div>

        {/* Search Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="w-5 h-5" />
              Search
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSearch} className="flex gap-2">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search users or journal entries..."
                data-testid="input-search-query"
              />
              <Button type="submit" data-testid="button-search">
                Search
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Results Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="users" className="flex items-center gap-2" data-testid="tab-users">
              <Users className="w-4 h-4" />
              Users
            </TabsTrigger>
            <TabsTrigger value="entries" className="flex items-center gap-2" data-testid="tab-entries">
              <FileText className="w-4 h-4" />
              Entries
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="space-y-4">
            {usersQuery.isLoading && (
              <div className="text-center py-8">
                <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto" />
                <p className="mt-2 text-sm text-muted-foreground">Searching users...</p>
              </div>
            )}

            {usersQuery.data && usersQuery.data.length === 0 && query.trim() && (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No users found for "{query}"</p>
              </div>
            )}

            <div className="grid gap-4">
              {usersQuery.data?.map((user) => (
                <Card key={user.id} className="hover-elevate">
                  <CardContent className="p-6">
                    <Link href={`/u/${user.username}`}>
                      <div className="flex items-start gap-4" data-testid={`user-card-${user.id}`}>
                        <Avatar className="w-12 h-12">
                          <AvatarImage src={user.profileImageUrl || undefined} />
                          <AvatarFallback>
                            {getInitials(user)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 space-y-2">
                          <div>
                            <h3 className="font-semibold text-lg" data-testid={`text-username-${user.id}`}>
                              @{user.username}
                            </h3>
                            <p className="text-muted-foreground">{formatName(user)}</p>
                          </div>
                          {user.bio && (
                            <p className="text-sm text-muted-foreground line-clamp-2">
                              {user.bio}
                            </p>
                          )}
                          <Badge variant="secondary" data-testid={`badge-entries-${user.id}`}>
                            {user.publicEntriesCount} public entries
                          </Badge>
                        </div>
                      </div>
                    </Link>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="entries" className="space-y-4">
            {entriesQuery.isLoading && (
              <div className="text-center py-8">
                <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto" />
                <p className="mt-2 text-sm text-muted-foreground">Searching entries...</p>
              </div>
            )}

            {entriesQuery.data?.entries.length === 0 && query.trim() && (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No entries found for "{query}"</p>
              </div>
            )}

            <div className="grid gap-4">
              {entriesQuery.data?.entries.map((entry) => (
                <Card key={entry.id} className="hover-elevate">
                  <CardContent className="p-6">
                    <Link href={`/e/${entry.id}`}>
                      <div className="space-y-3" data-testid={`entry-card-${entry.id}`}>
                        <div className="flex items-start gap-3">
                          <Avatar className="w-8 h-8">
                            <AvatarImage src={entry.user.profileImageUrl || undefined} />
                            <AvatarFallback>
                              {getInitials(entry.user)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <p className="text-sm text-muted-foreground">
                              <button 
                                onClick={(e) => handleUsernameClick(e, entry.user.username)}
                                className="hover:underline cursor-pointer text-muted-foreground"
                                data-testid={`button-username-${entry.user.id}`}
                              >
                                @{entry.user.username}
                              </button>
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(entry.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        
                        {entry.title && (
                          <h3 className="font-semibold text-lg" data-testid={`text-entry-title-${entry.id}`}>
                            {entry.title}
                          </h3>
                        )}
                        
                        <p className="text-sm line-clamp-3">{entry.content}</p>
                        
                        {entry.audioUrl && entry.audioPlayable && (
                          <div className="mt-3">
                            <AudioPlayer 
                              audioUrl={entry.audioUrl}
                              showFullControls={true}
                              className="w-full"
                            />
                          </div>
                        )}
                        
                        {entry.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {entry.tags.map((tag) => (
                              <Badge key={tag} variant="outline" className="text-xs">
                                #{tag}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </Link>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
        </div>
      </div>
    </div>
  )
}