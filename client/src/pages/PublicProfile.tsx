import { useParams } from "wouter"
import { useQuery } from "@tanstack/react-query"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { User, Calendar, FileText, ArrowLeft } from "lucide-react"
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

export default function PublicProfile() {
  const { username } = useParams<{ username: string }>()

  // Fetch user profile
  const userQuery = useQuery<PublicUser>({
    queryKey: ["/api/public/users", username]
  })

  // Fetch user entries
  const entriesQuery = useQuery<{ entries: PublicJournalEntry[] }>({
    queryKey: ["/api/public/users", username, "entries"],
    enabled: !!userQuery.data
  })

  if (userQuery.isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center space-y-4">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto" />
          <p className="text-sm text-muted-foreground">Loading profile...</p>
        </div>
      </div>
    )
  }

  if (userQuery.error) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-2xl mx-auto">
          <div className="text-center space-y-4 py-12">
            <User className="w-16 h-16 mx-auto text-muted-foreground opacity-50" />
            <h1 className="text-2xl font-bold">User Not Found</h1>
            <p className="text-muted-foreground">
              The user @{username} doesn't exist or their profile is private.
            </p>
            <Link href="/public">
              <Button variant="outline" data-testid="button-back-search">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Search
              </Button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const user = userQuery.data!
  
  const formatName = (user: PublicUser) => {
    if (user.firstName || user.lastName) {
      return `${user.firstName || ""} ${user.lastName || ""}`.trim()
    }
    return null
  }

  const getInitials = (user: PublicUser) => {
    const initials = (user.firstName?.[0] || "") + (user.lastName?.[0] || "")
    return initials || user.username[0]?.toUpperCase() || "?"
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Back Button */}
        <Link href="/public">
          <Button variant="ghost" size="sm" data-testid="button-back">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Search
          </Button>
        </Link>

        {/* Profile Header */}
        <Card>
          <CardContent className="p-8">
            <div className="flex flex-col sm:flex-row items-start gap-6">
              <Avatar className="w-24 h-24">
                <AvatarImage src={user.profileImageUrl || undefined} />
                <AvatarFallback className="text-2xl">
                  {getInitials(user)}
                </AvatarFallback>
              </Avatar>
              
              <div className="flex-1 space-y-4">
                <div>
                  <h1 className="text-3xl font-bold" data-testid="text-username">
                    @{user.username}
                  </h1>
                  {formatName(user) && (
                    <p className="text-xl text-muted-foreground" data-testid="text-full-name">
                      {formatName(user)}
                    </p>
                  )}
                </div>
                
                {user.bio && (
                  <p className="text-muted-foreground" data-testid="text-bio">
                    {user.bio}
                  </p>
                )}
                
                <div className="flex items-center gap-4">
                  <Badge variant="secondary" data-testid="badge-entries-count">
                    <FileText className="w-3 h-3 mr-1" />
                    {user.publicEntriesCount} public entries
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Journal Entries */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Public Journal Entries
            </CardTitle>
          </CardHeader>
          <CardContent>
            {entriesQuery.isLoading && (
              <div className="text-center py-8">
                <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full mx-auto" />
                <p className="mt-2 text-sm text-muted-foreground">Loading entries...</p>
              </div>
            )}

            {entriesQuery.data?.entries.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No public entries yet</p>
              </div>
            )}

            <div className="space-y-4">
              {entriesQuery.data?.entries.map((entry) => (
                <Card key={entry.id} className="hover-elevate">
                  <CardContent className="p-6">
                    <Link href={`/e/${entry.id}`}>
                      <div className="space-y-3" data-testid={`entry-card-${entry.id}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Calendar className="w-4 h-4" />
                            {new Date(entry.createdAt).toLocaleDateString(undefined, {
                              year: "numeric",
                              month: "long",
                              day: "numeric"
                            })}
                          </div>
                        </div>
                        
                        {entry.title && (
                          <h3 className="text-xl font-semibold" data-testid={`text-entry-title-${entry.id}`}>
                            {entry.title}
                          </h3>
                        )}
                        
                        <p className="text-muted-foreground line-clamp-3">
                          {entry.content}
                        </p>
                        
                        {entry.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {entry.tags.map((tag) => (
                              <Badge key={tag} variant="outline" className="text-xs">
                                #{tag}
                              </Badge>
                            ))}
                          </div>
                        )}

                        {entry.audioUrl && (
                          <div className="pt-2">
                            <Badge variant="secondary" className="text-xs">
                              🎵 Audio Entry
                            </Badge>
                          </div>
                        )}
                      </div>
                    </Link>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}