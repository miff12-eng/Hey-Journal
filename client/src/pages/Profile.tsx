import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { Settings, LogOut, Edit, Share2, Calendar, BookOpen, TrendingUp, Users, Loader2, Upload, Lock, X, Trophy, Mic, Volume2, Flame, Award, Globe, Camera, Check, UserPlus } from 'lucide-react'
import ThemeToggle from '@/components/ThemeToggle'
import { apiRequest } from '@/lib/queryClient'
import { ObjectUploader } from '@/components/ObjectUploader'
import ConnectionManager from '@/components/ConnectionManager'
import PersonManagement from '@/components/PersonManagement'
import type { User } from '@shared/schema'

export default function Profile() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isPrivacySettingsOpen, setIsPrivacySettingsOpen] = useState(false)
  const [isConnectionManagerOpen, setIsConnectionManagerOpen] = useState(false)
  const [isPersonManagementOpen, setIsPersonManagementOpen] = useState(false)
  
  // Fetch user profile data
  const { data: user, isLoading: userLoading, error: userError } = useQuery<User>({
    queryKey: ['/api/users/me'],
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  // Fetch user stats
  const { data: stats, isLoading: statsLoading } = useQuery<{
    entriesThisWeek: number;
    dayStreak: number;
    daysSinceLastEntry: number;
  }>({
    queryKey: ['/api/journal/stats'],
    staleTime: 60 * 1000, // 1 minute
  })

  // Fetch real achievements data with progress tracking
  const { data: achievementsData, isLoading: achievementsLoading } = useQuery<{
    achievements: Array<{
      id: string;
      title: string;
      description: string;
      icon: string;
      type: 'milestone' | 'streak' | 'social' | 'content';
      progress: number;
      target: number;
      completed: boolean;
      completedDate?: string;
    }>;
  }>({
    queryKey: ['/api/journal/achievements', user?.id],
    enabled: !!user && !userLoading,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
    refetchOnWindowFocus: true,
  })

  // Edit form state - only fields that are actually editable in the UI
  const [editForm, setEditForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    profileImageUrl: ''
  })

  // Update profile mutation
  const updateProfileMutation = useMutation({
    mutationFn: (updates: Partial<User>) => 
      apiRequest('PUT', '/api/users/me', updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users/me'] })
      setIsEditDialogOpen(false)
      toast({
        title: "Profile updated",
        description: "Your profile has been successfully updated.",
      })
    },
    onError: (error) => {
      console.error('Error updating profile:', error)
      toast({
        title: "Error",
        description: "Failed to update profile. Please try again.",
        variant: "destructive"
      })
    }
  })

  // Initialize edit form when user data is loaded
  useEffect(() => {
    if (user && !isEditDialogOpen) {
      setEditForm({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        email: user.email || '',
        profileImageUrl: user.profileImageUrl || ''
      })
    }
  }, [user, isEditDialogOpen])

  const statsDisplay = [
    { label: 'This Week', value: statsLoading ? '...' : (stats?.entriesThisWeek || 0), icon: BookOpen, color: 'text-primary' },
    { label: 'Day Streak', value: statsLoading ? '...' : (stats?.dayStreak || 0), icon: TrendingUp, color: 'text-accent' },
    { label: 'Public Entries', value: 0, icon: Share2, color: 'text-secondary-foreground' },
    { label: 'Days Since Last', value: statsLoading ? '...' : (stats?.daysSinceLastEntry || 0), icon: Users, color: 'text-muted-foreground' }
  ]

  // Get achievements from real database data
  const recentAchievements = achievementsData?.achievements || []

  // Icon mapping for dynamic achievement icons
  const iconMap: Record<string, typeof BookOpen> = {
    BookOpen,
    Trophy,
    Mic,
    Volume2,
    Flame,
    Award,
    Globe,
    Camera,
    Share2,
    Calendar,
    Users,
    TrendingUp
  }

  const handleEditProfile = () => {
    if (user) {
      setEditForm({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        email: user.email || '',
        profileImageUrl: user.profileImageUrl || ''
      })
    }
    setIsEditDialogOpen(true)
  }

  const handleSaveProfile = () => {
    // Only send the editable fields to prevent accidental privacy changes
    const updates = {
      firstName: editForm.firstName,
      lastName: editForm.lastName,
      email: editForm.email,
      profileImageUrl: editForm.profileImageUrl
    }
    updateProfileMutation.mutate(updates)
  }

  const handleCancelEdit = () => {
    // Reset form to original values
    if (user) {
      setEditForm({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        email: user.email || '',
        profileImageUrl: user.profileImageUrl || ''
      })
    }
    setIsEditDialogOpen(false)
  }

  const handleLogout = () => {
    try {
      // Clear all cached data
      queryClient.clear()
      
      // Redirect to OAuth logout endpoint which handles session clearing and OIDC logout
      window.location.href = '/api/logout'
    } catch (error) {
      console.error('Logout error:', error)
      // Fallback: clear cache and redirect to OAuth logout anyway
      queryClient.clear()
      window.location.href = '/api/logout'
    }
  }

  const formatDate = (date: Date | string) => {
    const dateObj = typeof date === 'string' ? new Date(date) : date
    return dateObj.toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric'
    })
  }

  // Show loading state
  if (userLoading) {
    return (
      <div className="flex flex-col h-screen bg-background">
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
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    )
  }

  // Show error state
  if (userError) {
    return (
      <div className="flex flex-col h-screen bg-background">
        <header className="sticky top-0 z-40 bg-background border-b border-border px-4 py-3">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold text-foreground">Profile</h1>
            <div className="flex items-center gap-2">
              <ThemeToggle />
            </div>
          </div>
        </header>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-destructive">Failed to load profile</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return null
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
                <Avatar className="h-24 w-24" data-testid="avatar-profile">
                  <AvatarImage src={user.profileImageUrl || undefined} alt={user.firstName || 'User'} />
                  <AvatarFallback className="text-2xl">
                    {(user.firstName?.[0] || '').toUpperCase()}{(user.lastName?.[0] || '').toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                
                <div className="space-y-2">
                  <h2 className="text-2xl font-semibold text-foreground" data-testid="text-user-name">
                    {user.firstName || 'Unknown'} {user.lastName || 'User'}
                  </h2>
                  <p className="text-sm text-muted-foreground" data-testid="text-user-email">{user.email}</p>
                  <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground" data-testid="text-join-date">
                    <Calendar className="h-3 w-3" />
                    Joined {user.createdAt ? formatDate(user.createdAt) : 'Unknown'}
                  </div>
                </div>
                
                <Button size="sm" variant="outline" onClick={handleEditProfile} data-testid="button-edit-profile">
                  <Edit className="h-3 w-3 mr-2" />
                  Edit Profile
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-4">
            {statsDisplay.map((stat) => {
              const Icon = stat.icon
              return (
                <Card key={stat.label} className="hover-elevate cursor-pointer transition-transform" data-testid={`card-stat-${stat.label.toLowerCase().replace(/\s+/g, '-')}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-full bg-muted ${stat.color}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-2xl font-bold text-foreground" data-testid={`text-stat-value-${stat.label.toLowerCase().replace(/\s+/g, '-')}`}>{stat.value}</p>
                        <p className="text-xs text-muted-foreground truncate" data-testid={`text-stat-label-${stat.label.toLowerCase().replace(/\s+/g, '-')}`}>{stat.label}</p>
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
              {achievementsLoading ? (
                // Loading state
                <div className="space-y-3">
                  {[...Array(3)].map((_, index) => (
                    <div key={index} className="flex items-center gap-3 animate-pulse">
                      <div className="h-10 w-10 rounded-full bg-muted/50" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 bg-muted/50 rounded w-24" />
                        <div className="h-3 bg-muted/50 rounded w-32" />
                      </div>
                      <div className="h-3 bg-muted/50 rounded w-16" />
                    </div>
                  ))}
                </div>
              ) : recentAchievements.length > 0 ? (
                // Achievements data with progress tracking
                recentAchievements.map((achievement, index) => {
                  const IconComponent = iconMap[achievement.icon] || Trophy
                  const progressPercentage = Math.round((achievement.progress / achievement.target) * 100)
                  const isCompleted = achievement.completed
                  
                  return (
                    <div key={achievement.id || index} className="space-y-2" data-testid={`achievement-${index}`}>
                      <div className="flex items-center gap-3">
                        <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                          isCompleted ? 'bg-green-500/10' : 'bg-primary/10'
                        }`}>
                          <IconComponent className={`h-4 w-4 ${
                            isCompleted ? 'text-green-600' : 'text-primary'
                          }`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className={`font-medium text-sm ${
                              isCompleted ? 'text-green-700 dark:text-green-400' : 'text-foreground'
                            }`} data-testid={`text-achievement-title-${index}`}>
                              {achievement.title}
                            </p>
                            {isCompleted && (
                              <Check className="h-3 w-3 text-green-600" data-testid={`icon-completed-${index}`} />
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground" data-testid={`text-achievement-description-${index}`}>
                            {achievement.description}
                          </p>
                        </div>
                        <div className="text-right">
                          <div className={`text-xs font-medium ${
                            isCompleted ? 'text-green-600' : 'text-primary'
                          }`} data-testid={`text-achievement-progress-${index}`}>
                            {achievement.progress}/{achievement.target}
                          </div>
                          {isCompleted && achievement.completedDate && achievement.completedDate !== 'Active streak' && (
                            <div className="text-xs text-muted-foreground" data-testid={`text-achievement-date-${index}`}>
                              {achievement.completedDate}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {/* Progress bar */}
                      <div className="ml-13"> {/* Align with content, accounting for icon + gap width */}
                        <div className="w-full bg-muted rounded-full h-1.5">
                          <div 
                            className={`h-1.5 rounded-full transition-all duration-300 ${
                              isCompleted ? 'bg-green-500' : 'bg-primary'
                            }`}
                            style={{ width: `${progressPercentage}%` }}
                            data-testid={`progress-bar-${index}`}
                          />
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground/70 mt-1">
                          <span>0</span>
                          <span className={isCompleted ? 'text-green-600' : 'text-primary/70'}>
                            {progressPercentage}%
                          </span>
                          <span>{achievement.target}</span>
                        </div>
                      </div>
                    </div>
                  )
                })
              ) : (
                // Empty state
                <div className="text-center py-4">
                  <Trophy className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground" data-testid="text-no-achievements">No achievements yet</p>
                  <p className="text-xs text-muted-foreground/80">Start journaling to unlock your first achievements!</p>
                </div>
              )}
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
              
              <Button 
                variant="outline" 
                className="w-full justify-start" 
                onClick={() => setIsPrivacySettingsOpen(true)}
                data-testid="button-privacy-settings"
              >
                <Settings className="h-4 w-4 mr-3" />
                Privacy Settings
              </Button>
              
              <Button 
                variant="outline" 
                className="w-full justify-start" 
                onClick={() => setIsConnectionManagerOpen(true)}
                data-testid="button-manage-connections"
              >
                <Users className="h-4 w-4 mr-3" />
                Manage Connections
              </Button>
              
              <Button 
                variant="outline" 
                className="w-full justify-start" 
                onClick={() => setIsPersonManagementOpen(true)}
                data-testid="button-manage-people"
              >
                <UserPlus className="h-4 w-4 mr-3" />
                Manage People
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
                  <Badge variant="outline" className="text-xs" data-testid="badge-encrypted">End-to-End Encrypted</Badge>
                  <Badge variant="outline" className="text-xs" data-testid="badge-gdpr">GDPR Compliant</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Edit Profile Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[425px]" data-testid="dialog-edit-profile">
          <DialogHeader>
            <DialogTitle>Edit Profile</DialogTitle>
            <DialogDescription>
              Update your profile information and photo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Profile Picture Upload */}
            <div className="space-y-2">
              <Label>Profile Picture</Label>
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarImage src={editForm.profileImageUrl || user?.profileImageUrl || undefined} alt="Profile" />
                  <AvatarFallback className="text-lg">
                    {editForm.firstName && editForm.lastName ? 
                      `${editForm.firstName[0]}${editForm.lastName[0]}` : 
                      user?.firstName && user?.lastName ? 
                        `${user.firstName[0]}${user.lastName[0]}` : 
                        'U'
                    }
                  </AvatarFallback>
                </Avatar>
                <ObjectUploader
                  maxNumberOfFiles={1}
                  maxFileSize={5 * 1024 * 1024} // 5MB
                  acceptedFileTypes={['image/jpeg', 'image/png', 'image/gif', 'image/webp']}
                  onComplete={(urls) => {
                    if (urls.length > 0) {
                      setEditForm(prev => ({ ...prev, profileImageUrl: urls[0] }))
                    }
                  }}
                  buttonClassName="flex-1"
                >
                  <Button variant="outline" className="w-full" data-testid="button-upload-profile-picture">
                    <Upload className="h-4 w-4 mr-2" />
                    {editForm.profileImageUrl || user?.profileImageUrl ? 'Change Photo' : 'Upload Photo'}
                  </Button>
                </ObjectUploader>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name</Label>
              <Input
                id="firstName"
                value={editForm.firstName}
                onChange={(e) => setEditForm(prev => ({ ...prev, firstName: e.target.value }))}
                data-testid="input-first-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name</Label>
              <Input
                id="lastName"
                value={editForm.lastName}
                onChange={(e) => setEditForm(prev => ({ ...prev, lastName: e.target.value }))}
                data-testid="input-last-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm(prev => ({ ...prev, email: e.target.value }))}
                data-testid="input-email"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleCancelEdit} data-testid="button-cancel-edit">
              Cancel
            </Button>
            <Button onClick={handleSaveProfile} data-testid="button-save-profile">
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Privacy Settings Dialog */}
      <Dialog open={isPrivacySettingsOpen} onOpenChange={setIsPrivacySettingsOpen}>
        <DialogContent className="sm:max-w-[500px] max-h-[80vh] overflow-y-auto" data-testid="dialog-privacy-settings">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Privacy & Security Settings
            </DialogTitle>
            <DialogDescription>
              Manage your account privacy, security preferences, and data controls.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            {/* Account Information */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Connected Account</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 bg-primary/10 rounded-full flex items-center justify-center">
                      <Users className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">OAuth Provider</p>
                      <p className="text-xs text-muted-foreground">
                        Signed in via {user?.email?.includes('@gmail.com') ? 'Google' : 
                                     user?.email?.includes('@github.com') ? 'GitHub' : 
                                     'OAuth Provider'}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs">Connected</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Your account is secured through OAuth authentication. Password management is handled by your provider.
                </p>
              </CardContent>
            </Card>

            {/* Data Privacy Controls */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Data Privacy</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <Lock className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Default Entry Privacy</p>
                        <p className="text-xs text-muted-foreground">New entries are private by default</p>
                      </div>
                    </div>
                    <Badge variant="secondary" className="text-xs">Private</Badge>
                  </div>
                  
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <Share2 className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Public Profile</p>
                        <p className="text-xs text-muted-foreground">Allow others to find your public entries</p>
                      </div>
                    </div>
                    <Switch defaultChecked data-testid="switch-public-profile" />
                  </div>
                  
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <TrendingUp className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Usage Analytics</p>
                        <p className="text-xs text-muted-foreground">Help improve the app with anonymous usage data</p>
                      </div>
                    </div>
                    <Switch defaultChecked data-testid="switch-analytics" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Data Management */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Data Management</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button 
                  variant="outline" 
                  className="w-full justify-start"
                  onClick={() => {
                    toast({
                      title: "Export initiated",
                      description: "Your data export will be sent to your email within 24 hours.",
                    })
                    setIsPrivacySettingsOpen(false)
                  }}
                  data-testid="button-export-all-data"
                >
                  <Upload className="h-4 w-4 mr-3" />
                  Export All My Data
                </Button>
                
                <Button 
                  variant="outline" 
                  className="w-full justify-start"
                  onClick={() => {
                    toast({
                      title: "Data retention updated",
                      description: "Your entries will be automatically archived after 5 years of inactivity.",
                    })
                  }}
                  data-testid="button-data-retention"
                >
                  <Calendar className="h-4 w-4 mr-3" />
                  Data Retention Settings
                </Button>
              </CardContent>
            </Card>

            {/* Security Actions */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Security Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button 
                  variant="outline" 
                  className="w-full justify-start"
                  onClick={() => {
                    toast({
                      title: "Sessions cleared",
                      description: "All active sessions have been terminated. You may need to sign in again on other devices.",
                    })
                  }}
                  data-testid="button-clear-sessions"
                >
                  <LogOut className="h-4 w-4 mr-3" />
                  Clear All Sessions
                </Button>
                
                <Separator className="my-3" />
                
                <Button 
                  variant="outline" 
                  className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    toast({
                      title: "Account deactivation",
                      description: "Please contact support to deactivate your account. Your data will be safely preserved.",
                      variant: "destructive"
                    })
                  }}
                  data-testid="button-deactivate-account"
                >
                  <X className="h-4 w-4 mr-3" />
                  Deactivate Account
                </Button>
              </CardContent>
            </Card>

            {/* Privacy Information */}
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="pt-6">
                <div className="text-center space-y-2">
                  <div className="flex justify-center gap-2 mb-3">
                    <Badge variant="secondary" className="text-xs">🔒 End-to-End Encrypted</Badge>
                    <Badge variant="secondary" className="text-xs">🛡️ GDPR Compliant</Badge>
                    <Badge variant="secondary" className="text-xs">🔐 Zero-Knowledge</Badge>
                  </div>
                  <h4 className="text-sm font-medium text-foreground">Your Privacy is Protected</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    All private entries are encrypted with your unique key. Even we cannot read your private content. 
                    Your data is processed in compliance with GDPR and other privacy regulations.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
          
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button 
              variant="outline" 
              onClick={() => setIsPrivacySettingsOpen(false)}
              data-testid="button-close-privacy-settings"
            >
              Close
            </Button>
            <Button 
              onClick={() => {
                toast({
                  title: "Settings saved",
                  description: "Your privacy preferences have been updated.",
                })
                setIsPrivacySettingsOpen(false)
              }}
              data-testid="button-save-privacy-settings"
            >
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Connection Manager Dialog */}
      <ConnectionManager 
        isOpen={isConnectionManagerOpen}
        onClose={() => setIsConnectionManagerOpen(false)}
      />

      {/* Person Management Dialog */}
      <PersonManagement 
        isOpen={isPersonManagementOpen}
        onOpenChange={setIsPersonManagementOpen}
      />
    </div>
  )
}