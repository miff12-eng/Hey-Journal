import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Search, X, User, Mail } from 'lucide-react'
import { useDebounce } from '@/hooks/use-debounce'

type User = {
  id: string
  email: string
  username?: string
  firstName?: string
  lastName?: string
  profileImageUrl?: string
}

interface UserSelectorProps {
  selectedUsers: User[]
  onUsersChange: (users: User[]) => void
  placeholder?: string
  className?: string
}

export default function UserSelector({ 
  selectedUsers, 
  onUsersChange, 
  placeholder = "Search by email or name...",
  className = ""
}: UserSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const debouncedQuery = useDebounce(searchQuery, 300)

  // Search for users
  const { data: searchResults = [], isLoading } = useQuery({
    queryKey: ['/api/users/search', debouncedQuery],
    enabled: debouncedQuery.length >= 2,
    queryFn: async () => {
      const response = await fetch(`/api/users/search?q=${encodeURIComponent(debouncedQuery)}&limit=10`)
      if (!response.ok) throw new Error('Failed to search users')
      return response.json()
    }
  })

  const addUser = (user: User) => {
    if (!selectedUsers.find(u => u.id === user.id)) {
      onUsersChange([...selectedUsers, user])
    }
    setSearchQuery('')
  }

  const removeUser = (userId: string) => {
    onUsersChange(selectedUsers.filter(u => u.id !== userId))
  }

  const getUserDisplayName = (user: User) => {
    if (user.firstName && user.lastName) {
      return `${user.firstName} ${user.lastName}`
    }
    if (user.firstName) return user.firstName
    if (user.username) return user.username
    return user.email
  }

  const getUserInitials = (user: User) => {
    if (user.firstName && user.lastName) {
      return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase()
    }
    if (user.firstName) return user.firstName[0].toUpperCase()
    if (user.username) return user.username[0].toUpperCase()
    return user.email[0].toUpperCase()
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={placeholder}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
          data-testid="input-user-search"
        />
      </div>

      {/* Search Results */}
      {debouncedQuery.length >= 2 && (
        <div className="border border-border rounded-md">
          <ScrollArea className="max-h-48">
            {isLoading ? (
              <div className="p-4 text-center text-muted-foreground">
                Searching users...
              </div>
            ) : searchResults.length > 0 ? (
              <div className="p-2">
                {searchResults.map((user: User) => (
                  <Button
                    key={user.id}
                    variant="ghost"
                    className="w-full justify-start h-auto p-3 hover-elevate"
                    onClick={() => addUser(user)}
                    disabled={selectedUsers.some(u => u.id === user.id)}
                    data-testid={`button-add-user-${user.id}`}
                  >
                    <Avatar className="h-8 w-8 mr-3">
                      <AvatarImage src={user.profileImageUrl} alt={getUserDisplayName(user)} />
                      <AvatarFallback>
                        {getUserInitials(user)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 text-left">
                      <div className="font-medium text-foreground">
                        {getUserDisplayName(user)}
                      </div>
                      <div className="text-sm text-muted-foreground flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {user.email}
                      </div>
                    </div>
                    {selectedUsers.some(u => u.id === user.id) && (
                      <Badge variant="secondary" className="ml-2">
                        Selected
                      </Badge>
                    )}
                  </Button>
                ))}
              </div>
            ) : (
              <div className="p-4 text-center text-muted-foreground">
                No users found for "{debouncedQuery}"
              </div>
            )}
          </ScrollArea>
        </div>
      )}

      {/* Selected Users */}
      {selectedUsers.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-foreground mb-2">
            Shared with ({selectedUsers.length})
          </h4>
          <div className="space-y-2">
            {selectedUsers.map((user) => (
              <div 
                key={user.id} 
                className="flex items-center justify-between p-2 bg-muted/50 rounded-md"
                data-testid={`selected-user-${user.id}`}
              >
                <div className="flex items-center gap-3">
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={user.profileImageUrl} alt={getUserDisplayName(user)} />
                    <AvatarFallback className="text-xs">
                      {getUserInitials(user)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="text-sm font-medium text-foreground">
                      {getUserDisplayName(user)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {user.email}
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeUser(user.id)}
                  data-testid={`button-remove-user-${user.id}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}