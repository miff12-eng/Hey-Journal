import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { useToast } from '@/hooks/use-toast'
import { Search, Plus, Edit, Trash2, Users, Loader2, UserPlus, Sparkles, BookOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { apiRequest } from '@/lib/queryClient'
import type { Person } from '@shared/schema'

interface PersonFormData {
  firstName: string
  lastName: string
  notes: string
}

interface PersonSuggestion {
  originalText: string
  firstName: string
  lastName: string | null
  notes: string
  entryId: string
  confidence: 'high' | 'medium' | 'low'
}

interface PersonManagementProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
}

export default function PersonManagement({ isOpen, onOpenChange }: PersonManagementProps) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  
  // State management
  const [searchQuery, setSearchQuery] = useState('')
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null)
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<string>>(new Set())
  const [showSuggestions, setShowSuggestions] = useState(true)
  const [personForm, setPersonForm] = useState<PersonFormData>({
    firstName: '',
    lastName: '',
    notes: ''
  })

  // Fetch people data
  const { data: people, isLoading: peopleLoading } = useQuery<Person[]>({
    queryKey: ['/api/people'],
    enabled: isOpen
  })

  // Fetch person suggestions from the consolidated backend endpoint
  const { data: suggestionsResponse, isLoading: suggestionsLoading, error: suggestionsError } = useQuery<{
    suggestions: Array<{
      entryId: string;
      entryTitle: string;
      originalText: string;
      firstName: string;
      lastName: string | null;
      notes: string;
      confidence: 'high' | 'medium' | 'low';
    }>;
    totalEntries: number;
  }>({
    queryKey: ['/api/people/suggestions'],
    enabled: isOpen,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  // Use suggestions from the consolidated endpoint
  const allPersonSuggestions = suggestionsResponse?.suggestions || []

  // Create person mutation
  const createPersonMutation = useMutation({
    mutationFn: (data: PersonFormData) => 
      apiRequest('POST', '/api/people', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/people'] })
      setIsCreateDialogOpen(false)
      resetForm()
      toast({
        title: "Person created",
        description: "Successfully added new person to your contacts.",
      })
    },
    onError: (error) => {
      console.error('Error creating person:', error)
      toast({
        title: "Error",
        description: "Failed to create person. Please try again.",
        variant: "destructive"
      })
    }
  })

  // Update person mutation
  const updatePersonMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: PersonFormData }) => 
      apiRequest('PUT', `/api/people/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/people'] })
      setIsEditDialogOpen(false)
      setSelectedPerson(null)
      resetForm()
      toast({
        title: "Person updated",
        description: "Successfully updated person information.",
      })
    },
    onError: (error) => {
      console.error('Error updating person:', error)
      toast({
        title: "Error",
        description: "Failed to update person. Please try again.",
        variant: "destructive"
      })
    }
  })

  // Delete person mutation
  const deletePersonMutation = useMutation({
    mutationFn: (id: string) => 
      apiRequest('DELETE', `/api/people/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/people'] })
      setIsDeleteDialogOpen(false)
      setSelectedPerson(null)
      toast({
        title: "Person deleted",
        description: "Successfully removed person from your contacts.",
      })
    },
    onError: (error) => {
      console.error('Error deleting person:', error)
      toast({
        title: "Error",
        description: "Failed to delete person. Please try again.",
        variant: "destructive"
      })
    }
  })

  // Batch create people from suggestions mutation
  const batchCreatePeopleMutation = useMutation({
    mutationFn: (people: PersonFormData[]) => 
      apiRequest('POST', '/api/people/batch', { people }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/people'] })
      queryClient.invalidateQueries({ queryKey: ['/api/people/suggestions'] })
      toast({
        title: "People created",
        description: `Successfully created ${data.totalCreated} people from suggestions.`,
      })
    },
    onError: (error) => {
      console.error('Error batch creating people:', error)
      toast({
        title: "Error", 
        description: "Failed to create people from suggestions. Please try again.",
        variant: "destructive"
      })
    }
  })

  // Filter people based on search query
  const filteredPeople = people?.filter(person =>
    `${person.firstName} ${person.lastName || ''}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
    person.notes?.toLowerCase().includes(searchQuery.toLowerCase())
  ) || []

  const resetForm = () => {
    setPersonForm({
      firstName: '',
      lastName: '',
      notes: ''
    })
  }

  const handleCreatePerson = () => {
    createPersonMutation.mutate(personForm)
  }

  const handleEditPerson = (person: Person) => {
    setSelectedPerson(person)
    setPersonForm({
      firstName: person.firstName || '',
      lastName: person.lastName || '',
      notes: person.notes || ''
    })
    setIsEditDialogOpen(true)
  }

  const handleUpdatePerson = () => {
    if (!selectedPerson) return
    updatePersonMutation.mutate({ id: selectedPerson.id, data: personForm })
  }

  const handleDeletePerson = (person: Person) => {
    setSelectedPerson(person)
    setIsDeleteDialogOpen(true)
  }

  const confirmDeletePerson = () => {
    if (!selectedPerson) return
    deletePersonMutation.mutate(selectedPerson.id)
  }

  const getPersonInitials = (person: Person) => {
    const first = person.firstName?.[0] || ''
    const last = person.lastName?.[0] || ''
    return (first + last).toUpperCase()
  }

  const getPersonDisplayName = (person: Person) => {
    return `${person.firstName || ''} ${person.lastName || ''}`.trim() || 'Unnamed Person'
  }

  // Handle suggestion selection with unique keys
  const getSuggestionKey = (suggestion: typeof allPersonSuggestions[0]) => {
    return `${suggestion.entryId}:${suggestion.originalText}`
  }

  const handleSuggestionToggle = (suggestionKey: string) => {
    setSelectedSuggestions(prev => {
      const newSet = new Set(prev)
      if (newSet.has(suggestionKey)) {
        newSet.delete(suggestionKey)
      } else {
        newSet.add(suggestionKey)
      }
      return newSet
    })
  }

  const handleCreateFromSuggestions = () => {
    const suggestionsToCreate = allPersonSuggestions.filter(suggestion => 
      selectedSuggestions.has(getSuggestionKey(suggestion))
    )
    
    const peopleToCreate: PersonFormData[] = suggestionsToCreate.map(suggestion => ({
      firstName: suggestion.firstName,
      lastName: suggestion.lastName || '',
      notes: suggestion.notes
    }))
    
    if (peopleToCreate.length > 0) {
      batchCreatePeopleMutation.mutate(peopleToCreate)
      setSelectedSuggestions(new Set()) // Clear selections after creating
    }
  }

  const handleSelectAllSuggestions = () => {
    if (selectedSuggestions.size === allPersonSuggestions.length) {
      // Deselect all
      setSelectedSuggestions(new Set())
    } else {
      // Select all using unique keys
      setSelectedSuggestions(new Set(allPersonSuggestions.map(suggestion => getSuggestionKey(suggestion))))
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-hidden" data-testid="dialog-person-management">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Manage People
          </DialogTitle>
          <DialogDescription>
            Add and manage people mentioned in your journal entries. Keep track of important contacts and relationships.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col h-[70vh] space-y-4">
          {/* Header actions */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search people..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-search-people"
              />
            </div>
            <Button 
              onClick={() => setIsCreateDialogOpen(true)}
              data-testid="button-create-person"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Person
            </Button>
          </div>

          {/* AI Person Suggestions */}
          {allPersonSuggestions.length > 0 && (
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    AI-Detected People ({allPersonSuggestions.length})
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowSuggestions(!showSuggestions)}
                    data-testid="button-toggle-suggestions"
                  >
                    {showSuggestions ? 'Hide' : 'Show'}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  AI found these people mentioned in your recent journal entries. Select names to quickly create Person objects.
                </p>
              </CardHeader>
              {showSuggestions && (
                <CardContent className="pt-0 space-y-3">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSelectAllSuggestions}
                      data-testid="button-select-all-suggestions"
                    >
                      {selectedSuggestions.size === allPersonSuggestions.length ? 'Deselect All' : 'Select All'}
                    </Button>
                    {selectedSuggestions.size > 0 && (
                      <Button
                        size="sm"
                        onClick={handleCreateFromSuggestions}
                        disabled={batchCreatePeopleMutation.isPending}
                        data-testid="button-create-from-suggestions"
                      >
                        {batchCreatePeopleMutation.isPending ? (
                          <>
                            <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                            Creating...
                          </>
                        ) : (
                          <>
                            <UserPlus className="h-3 w-3 mr-2" />
                            Create {selectedSuggestions.size} People
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                  
                  <div className="grid gap-2 max-h-40 overflow-y-auto">
                    {allPersonSuggestions.map((suggestion, index) => {
                      const suggestionKey = getSuggestionKey(suggestion);
                      return (
                        <div 
                          key={suggestionKey}
                          className={cn(
                            "flex items-center gap-3 p-2 rounded border cursor-pointer transition-colors",
                            selectedSuggestions.has(suggestionKey)
                              ? "border-primary bg-primary/10"
                              : "border-border hover:border-primary/50 hover:bg-muted/50"
                          )}
                          onClick={() => handleSuggestionToggle(suggestionKey)}
                          data-testid={`suggestion-${index}`}
                        >
                        <div className="flex items-center">
                          <div className={cn(
                            "w-4 h-4 rounded border-2 flex items-center justify-center",
                            selectedSuggestions.has(suggestionKey)
                              ? "border-primary bg-primary"
                              : "border-muted-foreground"
                          )}>
                            {selectedSuggestions.has(suggestionKey) && (
                              <div className="w-2 h-2 bg-primary-foreground rounded-full" />
                            )}
                          </div>
                        </div>
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="text-xs">
                            {suggestion.firstName[0]}{suggestion.lastName?.[0] || ''}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium" data-testid={`text-suggestion-name-${index}`}>
                            {suggestion.firstName} {suggestion.lastName || ''}
                          </p>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {suggestion.confidence}
                            </Badge>
                            <span className="text-xs text-muted-foreground truncate">
                              from "{suggestion.entryTitle}"
                            </span>
                          </div>
                        </div>
                      </div>
                      )
                    })}
                  </div>
                </CardContent>
              )}
            </Card>
          )}

          {/* People list */}
          <div className="flex-1 overflow-y-auto space-y-3">
            {peopleLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                <span className="text-sm text-muted-foreground">Loading people...</span>
              </div>
            ) : filteredPeople.length > 0 ? (
              filteredPeople.map((person) => (
                <Card key={person.id} className="hover-elevate" data-testid={`person-card-${person.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback>{getPersonInitials(person)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-sm text-foreground" data-testid={`text-person-name-${person.id}`}>
                          {getPersonDisplayName(person)}
                        </h3>
                        {person.notes && (
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-1" data-testid={`text-person-notes-${person.id}`}>
                            {person.notes}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="outline" className="text-xs">
                            <BookOpen className="h-3 w-3 mr-1" />
                            {/* We'll show entry count here later */}
                            0 entries
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => handleEditPerson(person)}
                          data-testid={`button-edit-person-${person.id}`}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => handleDeletePerson(person)}
                          className="text-destructive hover:text-destructive"
                          data-testid={`button-delete-person-${person.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <div className="text-center py-8">
                <Users className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
                <h3 className="text-sm font-medium text-foreground mb-2">
                  {searchQuery ? 'No people found' : 'No people added yet'}
                </h3>
                <p className="text-xs text-muted-foreground mb-4">
                  {searchQuery 
                    ? 'Try adjusting your search terms.' 
                    : 'Add people mentioned in your journal entries to keep track of important contacts.'}
                </p>
                {!searchQuery && (
                  <Button 
                    variant="outline" 
                    onClick={() => setIsCreateDialogOpen(true)}
                    data-testid="button-create-first-person"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Your First Person
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>

      {/* Create Person Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="sm:max-w-[500px]" data-testid="dialog-create-person">
          <DialogHeader>
            <DialogTitle>Add New Person</DialogTitle>
            <DialogDescription>
              Add someone mentioned in your journal entries to your personal contacts.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="create-firstName">First Name *</Label>
              <Input
                id="create-firstName"
                value={personForm.firstName}
                onChange={(e) => setPersonForm(prev => ({ ...prev, firstName: e.target.value }))}
                placeholder="Enter first name"
                data-testid="input-create-first-name"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="create-lastName">Last Name</Label>
              <Input
                id="create-lastName"
                value={personForm.lastName}
                onChange={(e) => setPersonForm(prev => ({ ...prev, lastName: e.target.value }))}
                placeholder="Enter last name (optional)"
                data-testid="input-create-last-name"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="create-notes">Notes</Label>
              <Textarea
                id="create-notes"
                value={personForm.notes}
                onChange={(e) => setPersonForm(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Add notes about this person (relationship, context, etc.)"
                className="resize-none"
                rows={3}
                data-testid="textarea-create-notes"
              />
            </div>
          </div>
          
          <div className="flex justify-end gap-2">
            <Button 
              variant="outline" 
              onClick={() => {
                setIsCreateDialogOpen(false)
                resetForm()
              }}
              data-testid="button-cancel-create"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleCreatePerson}
              disabled={!personForm.firstName.trim() || createPersonMutation.isPending}
              data-testid="button-save-create"
            >
              {createPersonMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Add Person'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Person Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px]" data-testid="dialog-edit-person">
          <DialogHeader>
            <DialogTitle>Edit Person</DialogTitle>
            <DialogDescription>
              Update the information for {selectedPerson ? getPersonDisplayName(selectedPerson) : 'this person'}.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-firstName">First Name *</Label>
              <Input
                id="edit-firstName"
                value={personForm.firstName}
                onChange={(e) => setPersonForm(prev => ({ ...prev, firstName: e.target.value }))}
                placeholder="Enter first name"
                data-testid="input-edit-first-name"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="edit-lastName">Last Name</Label>
              <Input
                id="edit-lastName"
                value={personForm.lastName}
                onChange={(e) => setPersonForm(prev => ({ ...prev, lastName: e.target.value }))}
                placeholder="Enter last name (optional)"
                data-testid="input-edit-last-name"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="edit-notes">Notes</Label>
              <Textarea
                id="edit-notes"
                value={personForm.notes}
                onChange={(e) => setPersonForm(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Add notes about this person (relationship, context, etc.)"
                className="resize-none"
                rows={3}
                data-testid="textarea-edit-notes"
              />
            </div>
          </div>
          
          <div className="flex justify-end gap-2">
            <Button 
              variant="outline" 
              onClick={() => {
                setIsEditDialogOpen(false)
                setSelectedPerson(null)
                resetForm()
              }}
              data-testid="button-cancel-edit"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleUpdatePerson}
              disabled={!personForm.firstName.trim() || updatePersonMutation.isPending}
              data-testid="button-save-edit"
            >
              {updatePersonMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Updating...
                </>
              ) : (
                'Update Person'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Person Alert Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent data-testid="dialog-delete-person">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Person</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedPerson ? getPersonDisplayName(selectedPerson) : 'this person'}? 
              This action cannot be undone, and any tags on journal entries will also be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDeletePerson}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deletePersonMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deletePersonMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete Person'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  )
}