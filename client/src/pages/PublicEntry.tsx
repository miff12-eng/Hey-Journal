import { useParams } from "wouter"
import { useQuery } from "@tanstack/react-query"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Calendar, FileText, ArrowLeft, Volume2, User } from "lucide-react"
import { Link } from "wouter"

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

export default function PublicEntry() {
  const { entryId } = useParams<{ entryId: string }>()

  // Fetch entry
  const entryQuery = useQuery<PublicJournalEntry>({
    queryKey: [`/api/public/entries/${entryId}`]
  })

  if (entryQuery.isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center space-y-4">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto" />
          <p className="text-sm text-muted-foreground">Loading entry...</p>
        </div>
      </div>
    )
  }

  if (entryQuery.error) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-2xl mx-auto">
          <div className="text-center space-y-4 py-12">
            <FileText className="w-16 h-16 mx-auto text-muted-foreground opacity-50" />
            <h1 className="text-2xl font-bold">Entry Not Found</h1>
            <p className="text-muted-foreground">
              This journal entry doesn't exist or is private.
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

  const entry = entryQuery.data!
  
  const formatName = (user: PublicJournalEntry["user"]) => {
    if (user.firstName || user.lastName) {
      return `${user.firstName || ""} ${user.lastName || ""}`.trim()
    }
    return user.username
  }

  const getInitials = (user: PublicJournalEntry["user"]) => {
    const initials = (user.firstName?.[0] || "") + (user.lastName?.[0] || "")
    return initials || user.username[0]?.toUpperCase() || "?"
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    })
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Back Button */}
        <Link href="/public">
          <Button variant="ghost" size="sm" data-testid="button-back">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Search
          </Button>
        </Link>

        {/* Entry Content */}
        <Card>
          <CardHeader className="border-b">
            {/* Author Info */}
            <div className="flex items-center gap-4">
              <Link href={`/u/${entry.user.username}`}>
                <div className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                  <Avatar className="w-12 h-12">
                    <AvatarImage src={entry.user.profileImageUrl || undefined} />
                    <AvatarFallback>
                      {getInitials(entry.user)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-semibold" data-testid="text-author-username">
                      @{entry.user.username}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatName(entry.user)}
                    </p>
                  </div>
                </div>
              </Link>
            </div>

            {/* Entry Title */}
            {entry.title && (
              <CardTitle className="text-2xl mt-4" data-testid="text-entry-title">
                {entry.title}
              </CardTitle>
            )}

            {/* Meta Info */}
            <div className="flex items-center gap-4 text-sm text-muted-foreground pt-2">
              <div className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                <span data-testid="text-created-at">
                  {formatDate(entry.createdAt)}
                </span>
              </div>
              {entry.audioUrl && entry.audioPlayable && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  <Volume2 className="w-3 h-3" />
                  Audio Entry
                </Badge>
              )}
            </div>
          </CardHeader>

          <CardContent className="p-8">
            {/* Audio Player */}
            {entry.audioUrl && entry.audioPlayable && (
              <div className="mb-6">
                <audio controls className="w-full" data-testid="audio-player">
                  <source src={entry.audioUrl} type="audio/mpeg" />
                  Your browser does not support the audio element.
                </audio>
              </div>
            )}

            {/* Entry Content */}
            <div className="prose prose-gray dark:prose-invert max-w-none">
              <div className="whitespace-pre-wrap text-base leading-relaxed" data-testid="text-entry-content">
                {entry.content}
              </div>
            </div>

            {/* Media URLs */}
            {entry.mediaUrls.length > 0 && (
              <div className="mt-6">
                <h4 className="font-semibold mb-3">Media</h4>
                <div className="grid gap-2">
                  {entry.mediaUrls.map((url, index) => (
                    <div key={index} className="border rounded-lg overflow-hidden">
                      <img 
                        src={url} 
                        alt={`Media ${index + 1}`}
                        className="w-full h-auto"
                        loading="lazy"
                        data-testid={`media-image-${index}`}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tags */}
            {entry.tags.length > 0 && (
              <div className="mt-6">
                <h4 className="font-semibold mb-3">Tags</h4>
                <div className="flex flex-wrap gap-2">
                  {entry.tags.map((tag) => (
                    <Badge key={tag} variant="outline" data-testid={`badge-tag-${tag}`}>
                      #{tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Author Profile Link */}
        <Card className="hover-elevate">
          <CardContent className="p-6">
            <Link href={`/u/${entry.user.username}`}>
              <div className="flex items-center gap-4" data-testid="link-author-profile">
                <Avatar className="w-16 h-16">
                  <AvatarImage src={entry.user.profileImageUrl || undefined} />
                  <AvatarFallback>
                    {getInitials(entry.user)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <h3 className="font-semibold text-lg">@{entry.user.username}</h3>
                  <p className="text-muted-foreground">{formatName(entry.user)}</p>
                  {entry.user.bio && (
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                      {entry.user.bio}
                    </p>
                  )}
                </div>
                <Button variant="outline" size="sm">
                  <User className="w-4 h-4 mr-2" />
                  View Profile
                </Button>
              </div>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}