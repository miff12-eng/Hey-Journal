import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { useToast } from '@/hooks/use-toast'
import { Search, Users, UserPlus, UserCheck, UserX, UserMinus, Shield, Clock, CheckCircle2, X, Loader2 } from 'lucide-react'
import { apiRequest, queryClient } from '@/lib/queryClient'
import { PublicUser, UserConnection, UserConnectionWithUser, User } from '@shared/schema'

interface ConnectionManagerProps {
  isOpen: boolean
  onClose: () => void
}

interface ConnectionStatusResponse {
  status: UserConnection | null
}

export default function ConnectionManager({ isOpen, onClose }: ConnectionManagerProps) {
  const [activeTab, setActiveTab] = useState('search')
  const [searchQuery, setSearchQuery] = useState('')
  const { toast } = useToast()

  // Get current user data
  const { data: currentUser } = useQuery({
    queryKey: ['/api/users/me'],
  })

  // Search users query
  const { data: searchResults = [], isLoading: isSearching } = useQuery<PublicUser[]>({
    queryKey: ['/api/connections/search', { q: searchQuery }],
    enabled: searchQuery.length >= 2,
  })

  // Connection requests queries
  const { data: receivedRequests = [], isLoading: isLoadingReceived } = useQuery<UserConnectionWithUser[]>({
    queryKey: ['/api/connections/requests', 'received'],
  })

  const { data: sentRequests = [], isLoading: isLoadingSent } = useQuery<UserConnectionWithUser[]>({
    queryKey: ['/api/connections/requests', 'sent'],
  })

  // Current connections query
  const { data: connections = [], isLoading: isLoadingConnections } = useQuery<UserConnectionWithUser[]>({
    queryKey: ['/api/connections'],
  })

  // Send connection request mutation
  const sendRequestMutation = useMutation({
    mutationFn: async (recipientId: string) => {
      const res = await apiRequest('POST', '/api/connections/request', { recipientId })
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/connections/requests', 'sent'] })
      toast({ title: 'Connection request sent!' })
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to send request',
        description: error.message || 'Something went wrong',
        variant: 'destructive'
      })
    }
  })

  // Accept connection request mutation
  const acceptRequestMutation = useMutation({
    mutationFn: async (requestId: string) => {
      const res = await apiRequest('POST', `/api/connections/accept/${requestId}`)
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/connections/requests'] })
      queryClient.invalidateQueries({ queryKey: ['/api/connections'] })
      toast({ title: 'Connection request accepted!' })
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to accept request',
        description: error.message || 'Something went wrong',
        variant: 'destructive'
      })
    }
  })

  // Reject connection request mutation
  const rejectRequestMutation = useMutation({
    mutationFn: async (requestId: string) => {
      const res = await apiRequest('POST', `/api/connections/reject/${requestId}`)
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/connections/requests'] })
      toast({ title: 'Connection request rejected' })
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to reject request',
        description: error.message || 'Something went wrong',
        variant: 'destructive'
      })
    }
  })

  // Block user mutation
  const blockUserMutation = useMutation({
    mutationFn: async (recipientId: string) => {
      const res = await apiRequest('POST', '/api/connections/block', { recipientId })
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/connections'] })
      queryClient.invalidateQueries({ queryKey: ['/api/connections/requests'] })
      toast({ title: 'User blocked successfully' })
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to block user',
        description: error.message || 'Something went wrong',
        variant: 'destructive'
      })
    }
  })

  // Unblock user mutation
  const unblockUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest('DELETE', `/api/connections/block/${userId}`)
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/connections'] })
      toast({ title: 'User unblocked successfully' })
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to unblock user',
        description: error.message || 'Something went wrong',
        variant: 'destructive'
      })
    }
  })


  // Helper function to get connection status for a user
  const getConnectionStatusForUser = (userId: string) => {
    // Check if user is already connected
    const existingConnection = connections.find((conn: UserConnectionWithUser) => 
      (conn.requester.id === userId || conn.recipient.id === userId) && 
      conn.status === 'accepted'
    )
    if (existingConnection) return 'connected'

    // Check if user is blocked
    const blockedConnection = connections.find((conn: UserConnectionWithUser) => 
      (conn.requester.id === userId || conn.recipient.id === userId) && 
      conn.status === 'blocked'
    )
    if (blockedConnection) return 'blocked'

    // Check if there's a pending request (either sent or received)
    const pendingReceived = receivedRequests.find((req: UserConnectionWithUser) => 
      req.requester.id === userId && req.status === 'pending'
    )
    if (pendingReceived) return 'request_received'

    const pendingSent = sentRequests.find((req: UserConnectionWithUser) => 
      req.recipient.id === userId && req.status === 'pending'
    )
    if (pendingSent) return 'request_sent'

    return 'none'
  }

  const renderUserCard = (user: PublicUser, showActions = true) => {
    const connectionStatus = getConnectionStatusForUser(user.id)
    
    return (
    <Card key={user.id} className="w-full" data-testid={`card-user-${user.id}`}>
      <CardHeader className="flex flex-row items-center space-y-0 pb-2">
        <Avatar className="h-10 w-10 mr-3">
          <AvatarImage src={user.profileImageUrl || undefined} data-testid={`img-avatar-${user.id}`} />
          <AvatarFallback data-testid={`text-avatar-fallback-${user.id}`}>
            {user.firstName?.[0] || user.lastName?.[0] || user.username[0].toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h4 className="font-semibold" data-testid={`text-username-${user.id}`}>
              @{user.username}
            </h4>
          </div>
          {(user.firstName || user.lastName) && (
            <p className="text-sm text-muted-foreground" data-testid={`text-name-${user.id}`}>
              {user.firstName} {user.lastName}
            </p>
          )}
          {user.bio && (
            <p className="text-sm text-muted-foreground mt-1" data-testid={`text-bio-${user.id}`}>
              {user.bio}
            </p>
          )}
        </div>
      </CardHeader>
      {showActions && (
        <CardContent className="pt-0">
          <div className="flex gap-2 flex-wrap items-center">
            {connectionStatus === 'connected' && (
              <Badge variant="default" data-testid={`badge-connected-${user.id}`}>
                <UserCheck className="h-3 w-3 mr-1" />
                Connected
              </Badge>
            )}
            {connectionStatus === 'blocked' && (
              <Badge variant="destructive" data-testid={`badge-blocked-${user.id}`}>
                <Shield className="h-3 w-3 mr-1" />
                Blocked
              </Badge>
            )}
            {connectionStatus === 'request_received' && (
              <Badge variant="secondary" data-testid={`badge-request-received-${user.id}`}>
                <Clock className="h-3 w-3 mr-1" />
                Request Received
              </Badge>
            )}
            {connectionStatus === 'request_sent' && (
              <Badge variant="secondary" data-testid={`badge-request-sent-${user.id}`}>
                <Clock className="h-3 w-3 mr-1" />
                Request Sent
              </Badge>
            )}
            
            {connectionStatus === 'none' && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => sendRequestMutation.mutate(user.id)}
                disabled={sendRequestMutation.isPending}
                data-testid={`button-connect-${user.id}`}
              >
                {sendRequestMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="h-4 w-4 mr-2" />
                )}
                Connect
              </Button>
            )}
            
            {connectionStatus !== 'blocked' && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => blockUserMutation.mutate(user.id)}
                disabled={blockUserMutation.isPending}
                data-testid={`button-block-${user.id}`}
              >
                {blockUserMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Shield className="h-4 w-4 mr-2" />
                )}
                Block
              </Button>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  )
  }

  const renderConnectionRequestCard = (request: UserConnectionWithUser, type: 'received' | 'sent') => {
    const otherUser = type === 'received' ? request.requester : request.recipient
    const isReceived = type === 'received'
    
    return (
      <Card key={request.id} className="w-full" data-testid={`card-request-${request.id}`}>
        <CardHeader className="flex flex-row items-center space-y-0 pb-2">
          <Avatar className="h-10 w-10 mr-3">
            <AvatarImage src={otherUser.profileImageUrl || undefined} />
            <AvatarFallback>
              {otherUser.firstName?.[0] || otherUser.lastName?.[0] || (otherUser.username?.[0] || 'U').toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h4 className="font-semibold" data-testid={`text-request-username-${request.id}`}>
                @{otherUser.username || 'unknown'}
              </h4>
              <Badge variant={request.status === 'pending' ? 'secondary' : 'outline'} data-testid={`badge-status-${request.id}`}>
                <Clock className="h-3 w-3 mr-1" />
                {request.status}
              </Badge>
            </div>
            {(otherUser.firstName || otherUser.lastName) && (
              <p className="text-sm text-muted-foreground">
                {otherUser.firstName} {otherUser.lastName}
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {isReceived ? 'Wants to connect with you' : 'You sent a connection request'}
            </p>
          </div>
        </CardHeader>
        {isReceived && request.status === 'pending' && (
          <CardContent className="pt-0">
            <div className="flex gap-2">
              <Button 
                variant="default" 
                size="sm"
                onClick={() => acceptRequestMutation.mutate(request.id)}
                disabled={acceptRequestMutation.isPending}
                data-testid={`button-accept-${request.id}`}
              >
                {acceptRequestMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                )}
                Accept
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => rejectRequestMutation.mutate(request.id)}
                disabled={rejectRequestMutation.isPending}
                data-testid={`button-reject-${request.id}`}
              >
                {rejectRequestMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <X className="h-4 w-4 mr-2" />
                )}
                Reject
              </Button>
            </div>
          </CardContent>
        )}
      </Card>
    )
  }

  const renderConnectionCard = (connection: UserConnectionWithUser) => {
    // Determine which user is the "other" user (not the current user)
    const otherUser = connection.requester.id === (currentUser as User)?.id ? connection.recipient : connection.requester
    
    return (
      <Card key={connection.id} className="w-full" data-testid={`card-connection-${connection.id}`}>
        <CardHeader className="flex flex-row items-center space-y-0 pb-2">
          <Avatar className="h-10 w-10 mr-3">
            <AvatarImage src={otherUser.profileImageUrl || undefined} />
            <AvatarFallback>
              {otherUser.firstName?.[0] || otherUser.lastName?.[0] || (otherUser.username?.[0] || 'U').toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h4 className="font-semibold" data-testid={`text-connection-username-${connection.id}`}>
                @{otherUser.username || 'unknown'}
              </h4>
              {connection.status === 'accepted' && (
                <Badge variant="default" data-testid={`badge-connected-${connection.id}`}>
                  <UserCheck className="h-3 w-3 mr-1" />
                  Connected
                </Badge>
              )}
              {connection.status === 'blocked' && (
                <Badge variant="destructive" data-testid={`badge-blocked-${connection.id}`}>
                  <Shield className="h-3 w-3 mr-1" />
                  Blocked
                </Badge>
              )}
            </div>
            {(otherUser.firstName || otherUser.lastName) && (
              <p className="text-sm text-muted-foreground">
                {otherUser.firstName} {otherUser.lastName}
              </p>
            )}
            {otherUser.bio && (
              <p className="text-sm text-muted-foreground mt-1">
                {otherUser.bio}
              </p>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex gap-2">
            {connection.status === 'blocked' ? (
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => unblockUserMutation.mutate(otherUser.id)}
                disabled={unblockUserMutation.isPending}
                data-testid={`button-unblock-${connection.id}`}
              >
                {unblockUserMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UserCheck className="h-4 w-4 mr-2" />
                )}
                Unblock
              </Button>
            ) : (
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => blockUserMutation.mutate(otherUser.id)}
                disabled={blockUserMutation.isPending}
                data-testid={`button-block-connection-${connection.id}`}
              >
                {blockUserMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Shield className="h-4 w-4 mr-2" />
                )}
                Block
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[800px] h-[80vh] flex flex-col" data-testid="dialog-connection-manager">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Manage Connections
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="search" data-testid="tab-search">
              <Search className="h-4 w-4 mr-2" />
              Search
            </TabsTrigger>
            <TabsTrigger value="requests" data-testid="tab-requests">
              <UserPlus className="h-4 w-4 mr-2" />
              Requests
              {(receivedRequests.length > 0 || sentRequests.length > 0) && (
                <Badge className="ml-2 h-5 w-5 rounded-full text-xs p-0 flex items-center justify-center">
                  {receivedRequests.length + sentRequests.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="connections" data-testid="tab-connections">
              <UserCheck className="h-4 w-4 mr-2" />
              Connected
              {connections.filter((c: UserConnectionWithUser) => c.status === 'accepted').length > 0 && (
                <Badge variant="secondary" className="ml-2 h-5 w-5 rounded-full text-xs p-0 flex items-center justify-center">
                  {connections.filter((c: UserConnectionWithUser) => c.status === 'accepted').length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="blocked" data-testid="tab-blocked">
              <Shield className="h-4 w-4 mr-2" />
              Blocked
              {connections.filter((c: UserConnectionWithUser) => c.status === 'blocked').length > 0 && (
                <Badge variant="destructive" className="ml-2 h-5 w-5 rounded-full text-xs p-0 flex items-center justify-center">
                  {connections.filter((c: UserConnectionWithUser) => c.status === 'blocked').length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="search" className="flex-1 flex flex-col">
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search users by username, name, or bio..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-users"
                />
              </div>
              
              <ScrollArea className="flex-1">
                {searchQuery.length < 2 ? (
                  <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-8 text-center">
                      <Search className="h-12 w-12 text-muted-foreground mb-4" />
                      <h3 className="font-semibold text-lg mb-2">Find People to Connect</h3>
                      <p className="text-muted-foreground">
                        Type at least 2 characters to search for users
                      </p>
                    </CardContent>
                  </Card>
                ) : isSearching ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                ) : searchResults.length === 0 ? (
                  <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-8 text-center">
                      <UserX className="h-12 w-12 text-muted-foreground mb-4" />
                      <h3 className="font-semibold text-lg mb-2">No Results Found</h3>
                      <p className="text-muted-foreground">
                        No users found matching "{searchQuery}"
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-4">
                    {searchResults.map((user: PublicUser) => renderUserCard(user))}
                  </div>
                )}
              </ScrollArea>
            </div>
          </TabsContent>

          <TabsContent value="requests" className="flex-1 flex flex-col">
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold text-lg mb-3">Received Requests</h3>
                <ScrollArea className="max-h-[300px]">
                  {isLoadingReceived ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                  ) : receivedRequests.length === 0 ? (
                    <Card className="border-dashed">
                      <CardContent className="flex flex-col items-center justify-center py-6 text-center">
                        <UserPlus className="h-8 w-8 text-muted-foreground mb-2" />
                        <p className="text-muted-foreground">No connection requests received</p>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-3">
                      {receivedRequests.map((request: UserConnectionWithUser) => 
                        renderConnectionRequestCard(request, 'received')
                      )}
                    </div>
                  )}
                </ScrollArea>
              </div>

              <Separator />

              <div>
                <h3 className="font-semibold text-lg mb-3">Sent Requests</h3>
                <ScrollArea className="max-h-[300px]">
                  {isLoadingSent ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                  ) : sentRequests.length === 0 ? (
                    <Card className="border-dashed">
                      <CardContent className="flex flex-col items-center justify-center py-6 text-center">
                        <Clock className="h-8 w-8 text-muted-foreground mb-2" />
                        <p className="text-muted-foreground">No pending requests sent</p>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-3">
                      {sentRequests.map((request: UserConnectionWithUser) => 
                        renderConnectionRequestCard(request, 'sent')
                      )}
                    </div>
                  )}
                </ScrollArea>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="connections" className="flex-1 flex flex-col">
            <ScrollArea className="flex-1">
              {isLoadingConnections ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : connections.filter((c: UserConnectionWithUser) => c.status === 'accepted').length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="flex flex-col items-center justify-center py-8 text-center">
                    <UserCheck className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="font-semibold text-lg mb-2">No Connections Yet</h3>
                    <p className="text-muted-foreground">
                      Start by searching for people to connect with
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {connections
                    .filter((connection: UserConnectionWithUser) => connection.status === 'accepted')
                    .map((connection: UserConnectionWithUser) => renderConnectionCard(connection))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="blocked" className="flex-1 flex flex-col">
            <ScrollArea className="flex-1">
              {isLoadingConnections ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : connections.filter((c: UserConnectionWithUser) => c.status === 'blocked').length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="flex flex-col items-center justify-center py-8 text-center">
                    <Shield className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="font-semibold text-lg mb-2">No Blocked Users</h3>
                    <p className="text-muted-foreground">
                      Users you block will appear here
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {connections
                    .filter((connection: UserConnectionWithUser) => connection.status === 'blocked')
                    .map((connection: UserConnectionWithUser) => renderConnectionCard(connection))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}