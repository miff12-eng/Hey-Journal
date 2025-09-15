import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Search, Users, FileText } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "wouter"

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

  // Search users query
  const usersQuery = useQuery<PublicUser[]>({
    queryKey: ["/api/public/users/search", query],
    enabled: !!query.trim() && activeTab === "users"
  })

  // Search entries query
  const entriesQuery = useQuery<{ entries: PublicJournalEntry[] }>({
    queryKey: ["/api/public/entries/search", query],
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

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">Public Journal Search</h1>
          <p className="text-muted-foreground">
            Discover public profiles and journal entries from the community
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
                              <Link href={`/u/${entry.user.username}`} className="hover:underline">
                                @{entry.user.username}
                              </Link>
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
  )
}