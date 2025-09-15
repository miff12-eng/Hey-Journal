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

export default function Home() {
  const [searchQuery, setSearchQuery] = useState('')
  
  // Mock data for demonstration - todo: replace with real data
  const mockUser = {
    id: 'current-user',
    firstName: 'Alex',
    lastName: 'Chen',
    email: 'alex.chen@example.com',
    profileImageUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150'
  }

  const mockEntries: JournalEntryWithUser[] = [
    {
      id: '1',
      userId: 'user1',
      title: 'Morning Reflections',
      content: "Started the day with meditation and coffee. There's something magical about those quiet morning moments before the world wakes up. I find my thoughts are clearest then, like a still lake reflecting the sky. Today I want to focus on being more present in each moment.",
      audioUrl: 'https://example.com/audio1.mp3',
      mediaUrls: ['https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400'],
      tags: ['morning', 'meditation', 'mindfulness'],
      privacy: 'public' as const,
      sharedWith: [],
      createdAt: new Date('2024-01-15T08:30:00Z'),
      updatedAt: new Date('2024-01-15T08:30:00Z'),
      user: {
        id: 'user1',
        email: 'sarah.wilson@example.com',
        firstName: 'Sarah',
        lastName: 'Wilson',
        profileImageUrl: 'https://images.unsplash.com/photo-1494790108755-2616b2dc1193?w=150',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    },
    {
      id: '2',
      userId: 'user2',
      title: '',
      content: 'Had an incredible conversation with Mom today about her childhood stories. She told me about the time she and her siblings built a treehouse that lasted through three summers. Made me realize how important it is to document these family memories before they fade.',
      audioUrl: undefined,
      mediaUrls: [
        'https://images.unsplash.com/photo-1491013516836-7db643ee125a?w=400',
        'https://images.unsplash.com/photo-1576091160399-112ba8d25d1f?w=400'
      ],
      tags: ['family', 'memories', 'storytelling'],
      privacy: 'shared' as const,
      sharedWith: ['current-user'],
      createdAt: new Date('2024-01-14T19:15:00Z'),
      updatedAt: new Date('2024-01-14T19:15:00Z'),
      user: {
        id: 'user2',
        email: 'mike.rodriguez@example.com',
        firstName: 'Mike',
        lastName: 'Rodriguez',
        profileImageUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    },
    {
      id: '3',
      userId: 'current-user',
      title: 'Weekend Adventure Planning',
      content: "Spent the evening researching hiking trails for this weekend. Found this amazing spot called Eagle Peak - 6 mile round trip with panoramic views. Weather looks perfect. Can't wait to disconnect from screens and reconnect with nature.",
      audioUrl: 'https://example.com/audio3.mp3',
      mediaUrls: [],
      tags: ['hiking', 'adventure', 'nature', 'planning'],
      privacy: 'private' as const,
      sharedWith: [],
      createdAt: new Date('2024-01-14T16:45:00Z'),
      updatedAt: new Date('2024-01-14T16:45:00Z'),
      user: mockUser
    }
  ]

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
          <Button variant="ghost" size="sm" className="bg-primary/10 text-primary" data-testid="filter-all">
            All
          </Button>
          <Button variant="ghost" size="sm" data-testid="filter-private">
            Private
          </Button>
          <Button variant="ghost" size="sm" data-testid="filter-shared">
            Shared
          </Button>
          <Button variant="ghost" size="sm" data-testid="filter-public">
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
            {mockEntries.map((entry) => (
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
            {mockEntries.length === 0 && (
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