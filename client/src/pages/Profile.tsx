import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Settings, LogOut, Edit, Share2, Calendar, BookOpen, TrendingUp, Users } from 'lucide-react'
import ThemeToggle from '@/components/ThemeToggle'

export default function Profile() {
  // Mock user data - todo: replace with real user data
  const mockUser = {
    id: 'current-user',
    firstName: 'Alex',
    lastName: 'Chen',
    email: 'alex.chen@example.com',
    profileImageUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150',
    joinedDate: new Date('2023-06-15'),
    streakDays: 28,
    totalEntries: 127,
    publicEntries: 23,
    followers: 45,
    following: 32
  }

  const stats = [
    { label: 'Total Entries', value: mockUser.totalEntries, icon: BookOpen, color: 'text-primary' },
    { label: 'Day Streak', value: mockUser.streakDays, icon: TrendingUp, color: 'text-accent' },
    { label: 'Public Entries', value: mockUser.publicEntries, icon: Share2, color: 'text-secondary-foreground' },
    { label: 'Followers', value: mockUser.followers, icon: Users, color: 'text-muted-foreground' }
  ]

  const recentAchievements = [
    { title: 'Week Warrior', description: '7 days in a row', date: '2 days ago' },
    { title: 'Voice Master', description: '50 voice recordings', date: '1 week ago' },
    { title: 'Social Butterfly', description: 'First shared entry', date: '2 weeks ago' }
  ]

  const handleLogout = () => {
    console.log('Logout triggered')
    // In a real app, this would call the logout API
    window.location.href = '/api/logout'
  }

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric'
    })
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-foreground">Profile</h1>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="ghost" size="icon" data-testid="button-settings">
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto pb-20"> {/* Bottom padding for navigation */}
        <div className="p-4 space-y-6">
          {/* Profile header */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center space-y-4">
                <Avatar className="h-24 w-24">
                  <AvatarImage src={mockUser.profileImageUrl} alt={mockUser.firstName} />
                  <AvatarFallback className="text-2xl">{mockUser.firstName[0]}{mockUser.lastName[0]}</AvatarFallback>
                </Avatar>
                
                <div className="space-y-2">
                  <h2 className="text-2xl font-semibold text-foreground">
                    {mockUser.firstName} {mockUser.lastName}
                  </h2>
                  <p className="text-sm text-muted-foreground">{mockUser.email}</p>
                  <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    Joined {formatDate(mockUser.joinedDate)}
                  </div>
                </div>
                
                <Button size="sm" variant="outline" data-testid="button-edit-profile">
                  <Edit className="h-3 w-3 mr-2" />
                  Edit Profile
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-4">
            {stats.map((stat) => {
              const Icon = stat.icon
              return (
                <Card key={stat.label} className="hover-elevate cursor-pointer transition-transform">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-full bg-muted ${stat.color}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                        <p className="text-xs text-muted-foreground truncate">{stat.label}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {/* Recent achievements */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent Achievements</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {recentAchievements.map((achievement, index) => (
                <div key={index} className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <TrendingUp className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground text-sm">{achievement.title}</p>
                    <p className="text-xs text-muted-foreground">{achievement.description}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{achievement.date}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Quick actions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button variant="outline" className="w-full justify-start" data-testid="button-export-data">
                <Share2 className="h-4 w-4 mr-3" />
                Export Journal Data
              </Button>
              
              <Button variant="outline" className="w-full justify-start" data-testid="button-privacy-settings">
                <Settings className="h-4 w-4 mr-3" />
                Privacy Settings
              </Button>
              
              <Button variant="outline" className="w-full justify-start" data-testid="button-manage-connections">
                <Users className="h-4 w-4 mr-3" />
                Manage Connections
              </Button>
              
              <Separator className="my-3" />
              
              <Button 
                variant="outline" 
                className="w-full justify-start text-destructive hover:text-destructive" 
                onClick={handleLogout}
                data-testid="button-logout"
              >
                <LogOut className="h-4 w-4 mr-3" />
                Log Out
              </Button>
            </CardContent>
          </Card>

          {/* Privacy info */}
          <Card className="bg-muted/50">
            <CardContent className="pt-6">
              <div className="text-center space-y-2">
                <h3 className="text-sm font-medium text-foreground">Your Privacy Matters</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  All your private entries are encrypted and only visible to you. 
                  You have full control over what you share and with whom.
                </p>
                <div className="flex justify-center gap-2 mt-3">
                  <Badge variant="outline" className="text-xs">End-to-End Encrypted</Badge>
                  <Badge variant="outline" className="text-xs">GDPR Compliant</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}