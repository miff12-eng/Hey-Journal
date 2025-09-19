import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Camera, Image, Users, Globe, Lock, Save, X, Upload, UserPlus, Loader2, Search, Plus, User } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useQuery } from '@tanstack/react-query'
import { apiRequest, queryClient } from '@/lib/queryClient'
import RecordButton from '@/components/RecordButton'
import { ObjectUploader } from '@/components/ObjectUploader'
import UserSelector from '@/components/UserSelector'
import { cn } from '@/lib/utils'
import type { Person } from '@shared/schema'

type PrivacyLevel = 'private' | 'shared' | 'public'

interface RecordDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editEntryId?: string | null
  onSaveSuccess?: () => void
}

export default function RecordDialog({ open, onOpenChange, editEntryId, onSaveSuccess }: RecordDialogProps) {
  const isEditMode = !!editEntryId
  const hasInitializedRef = useRef(false)
  
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [newTag, setNewTag] = useState('')
  const [privacy, setPrivacy] = useState<PrivacyLevel>('private')
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [mediaUrls, setMediaUrls] = useState<string[]>([])
  const [audioUrl, setAudioUrl] = useState<string>('')
  const [audioPlayable, setAudioPlayable] = useState<boolean>(false)
  const [isSaving, setIsSaving] = useState(false)
  const [selectedUsers, setSelectedUsers] = useState<{id: string, email: string, username?: string, firstName?: string, lastName?: string, profileImageUrl?: string}[]>([])
  // People tagging state
  const [selectedPeople, setSelectedPeople] = useState<{id: string, firstName: string, lastName: string | null}[]>([])
  const [isScanning, setIsScanning] = useState(false)
  const [suggestions, setSuggestions] = useState<{
    existingPeople: {id: string, firstName: string, lastName: string | null}[];
    newPeople: {originalText: string, firstName: string, lastName: string | null, confidence: string}[];
  } | null>(null)
  const [showSuggestions, setShowSuggestions] = useState(false)

  // Manual person search and creation state
  const [personSearchQuery, setPersonSearchQuery] = useState('')
  const [showPersonSearch, setShowPersonSearch] = useState(false)
  const [isCreatingPerson, setIsCreatingPerson] = useState(false)
  const [newPersonForm, setNewPersonForm] = useState({
    firstName: '',
    lastName: '',
    notes: ''
  })
  const { toast } = useToast()
  
  // Fetch entry data when in edit mode
  const { data: editEntry, isLoading: isLoadingEntry, error } = useQuery({
    queryKey: ['/api/journal/entries', editEntryId],
    enabled: isEditMode && open, // Only fetch when dialog is open and we're in edit mode
    queryFn: async () => {
      const response = await fetch(`/api/journal/entries/${editEntryId}`, {
        credentials: 'include'
      })
      if (!response.ok) {
        throw new Error('Failed to fetch entry')
      }
      return response.json()
    }
  })

  // Fetch people for manual search
  const { data: allPeople, isLoading: isLoadingPeople } = useQuery<Person[]>({
    queryKey: ['/api/people'],
    enabled: open && showPersonSearch
  })
  
  // Populate form when entry data is loaded
  useEffect(() => {
    if (editEntry && isEditMode) {
      setTitle(editEntry.title || '')
      setContent(editEntry.content || '')
      setTags(editEntry.tags || [])
      setPrivacy(editEntry.privacy || 'private')
      setMediaUrls(editEntry.mediaUrls || [])
      setAudioUrl(editEntry.audioUrl || '')
      setAudioPlayable(editEntry.audioPlayable || false)
      
      // Load sharing information if entry is shared
      if (editEntry.privacy === 'shared' && editEntry.id) {
        loadSharingInfo(editEntry.id)
      }

      // Load existing person tags for this entry
      if (editEntry.id) {
        loadPersonTags(editEntry.id)
      }
    }
  }, [editEntry, isEditMode])

  // Load existing person tags for an entry
  const loadPersonTags = async (entryId: string) => {
    try {
      const response = await fetch(`/api/journal/entries/${entryId}/people`, {
        credentials: 'include'
      })
      
      if (response.ok) {
        const personTags = await response.json()
        // Set the selected people based on existing tags
        const selectedPeopleFromTags = personTags.map((tag: any) => ({
          id: tag.person.id,
          firstName: tag.person.firstName,
          lastName: tag.person.lastName
        }))
        setSelectedPeople(selectedPeopleFromTags)
      } else if (response.status !== 404) {
        // 404 is okay (no person tags), but other errors should be logged
        console.error('Failed to load person tags for entry:', entryId, response.status)
      } else {
        setSelectedPeople([])
      }
    } catch (error) {
      console.error('Error loading person tags:', error)
    }
  }
  
  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      // Reset everything when dialog closes
      setTitle('')
      setContent('')
      setTags([])
      setNewTag('')
      setPrivacy('private')
      setIsRecording(false)
      setIsTranscribing(false)
      setMediaUrls([])
      setAudioUrl('')
      setAudioPlayable(false)
      setIsSaving(false)
      setSelectedUsers([])
      setSelectedPeople([])
      setSuggestions(null)
      setShowSuggestions(false)
      setIsScanning(false)
      // Reset manual person state
      setPersonSearchQuery('')
      setShowPersonSearch(false)
      setIsCreatingPerson(false)
      setNewPersonForm({ firstName: '', lastName: '', notes: '' })
      hasInitializedRef.current = false
    }
  }, [open])

  // Initialize form for new entries (only once per dialog opening)
  useEffect(() => {
    if (open && !isEditMode && !hasInitializedRef.current) {
      // Reset form for new entries only once when dialog opens
      setTitle('')
      setContent('')
      setTags([])
      setNewTag('')
      setPrivacy('private')
      setIsRecording(false)
      setIsTranscribing(false)
      setMediaUrls([])
      setAudioUrl('')
      setAudioPlayable(false)
      setIsSaving(false)
      setSelectedUsers([])
      hasInitializedRef.current = true
    }
  }, [open, isEditMode])
  
  // Function to load existing sharing information
  const loadSharingInfo = async (entryId: string) => {
    try {
      const response = await fetch(`/api/journal/entries/${entryId}/sharing`)
      if (response.ok) {
        const sharingData = await response.json()
        setSelectedUsers(sharingData.sharedWith || [])
      }
    } catch (error) {
      console.error('Failed to load sharing info:', error)
    }
  }

  const handleRecordingStart = () => {
    setIsRecording(true)
    console.log('Recording started')
  }

  const handleRecordingStop = (audioBlob: Blob) => {
    setIsRecording(false)
    setIsTranscribing(true)
    console.log('Recording stopped, processing...', audioBlob.size)
    
    // Process audio: transcription + upload to storage
    const processAudio = async () => {
      try {
        // Step 1: Transcribe the audio
        const formData = new FormData()
        formData.append('audio', audioBlob, 'recording.wav')
        
        const transcriptionResponse = await fetch('/api/ai/transcribe', {
          method: 'POST',
          body: formData,
          credentials: 'include'
        })
        
        let transcription = ''
        if (transcriptionResponse.ok) {
          const data = await transcriptionResponse.json()
          transcription = data.text || 'Unable to transcribe audio'
          setContent(prev => prev + (prev ? '\n\n' : '') + transcription)
        } else {
          console.error('Transcription failed:', transcriptionResponse.status)
          transcription = 'Transcription failed. Please try again.'
          setContent(prev => prev + (prev ? '\n\n' : '') + transcription)
        }

        // Step 2: Upload audio file to object storage
        try {
          console.log('🎵 Uploading audio file to storage...')
          
          // Get upload URL
          const uploadResponse = await fetch('/api/photos/upload', {
            method: 'POST',
            credentials: 'include'
          })
          
          if (!uploadResponse.ok) {
            throw new Error('Failed to get upload URL')
          }
          
          const { uploadURL, objectPath } = await uploadResponse.json()
          console.log('🔗 Got upload URL for audio:', objectPath)
          
          // Upload audio file directly to object storage
          const audioFile = new File([audioBlob], 'recording.wav', { type: 'audio/wav' })
          const directUploadResponse = await fetch(uploadURL, {
            method: 'PUT',
            body: audioFile,
            headers: {
              'Content-Type': 'audio/wav'
            }
          })
          
          if (!directUploadResponse.ok) {
            throw new Error('Failed to upload audio file')
          }
          
          // Audio uploaded successfully - store URL but keep private by default
          setAudioUrl(objectPath)
          setAudioPlayable(false) // Default to private for user privacy
          console.log('✅ Audio file uploaded successfully (private):', objectPath)
          toast({
            title: "Voice recorded!",
            description: "Your audio has been transcribed and saved privately. You can enable playback sharing in the audio settings.",
          })
          
        } catch (uploadError) {
          console.error('Audio upload error:', uploadError)
          // Continue even if upload fails - user still has transcription
          toast({
            title: "Audio transcribed",
            description: "Voice was transcribed but audio file couldn't be saved.",
            variant: "destructive"
          })
        }
        
      } catch (error) {
        console.error('Audio processing error:', error)
        setContent(prev => prev + (prev ? '\n\n' : '') + 'Audio processing error. Please check your connection.')
        toast({
          title: "Processing failed",
          description: "Unable to process your recording. Please try again.",
          variant: "destructive"
        })
      } finally {
        setIsTranscribing(false)
      }
    }
    
    processAudio()
  }

  const handleTranscriptionUpdate = (text: string) => {
    setContent(text)
  }

  const addTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()])
      setNewTag('')
    }
  }

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove))
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      addTag()
    }
  }

  const handlePhotoUpload = (uploadedUrls: string[]) => {
    setMediaUrls(prev => [...prev, ...uploadedUrls])
    toast({
      title: "Photos uploaded!",
      description: `${uploadedUrls.length} photo${uploadedUrls.length > 1 ? 's' : ''} added to your entry.`,
    })
  }

  const removePhoto = (index: number) => {
    setMediaUrls(prev => prev.filter((_, i) => i !== index))
  }

  const handleSave = async () => {
    const entry = {
      title: title.trim(),
      content: content.trim(),
      tags,
      privacy,
      mediaUrls,
      audioUrl: audioUrl || undefined,
      audioPlayable: audioPlayable
    }
    console.log(isEditMode ? 'Updating entry:' : 'Saving entry:', entry)
    
    setIsSaving(true)
    try {
      const url = isEditMode ? `/api/journal/entries/${editEntryId}` : '/api/journal/entries'
      const method = isEditMode ? 'PUT' : 'POST'
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          title: entry.title || undefined,
          content: entry.content,
          tags: entry.tags,
          privacy: entry.privacy,
          mediaUrls: mediaUrls,
          audioUrl: audioUrl || undefined,
          audioPlayable: audioPlayable
        })
      })
      
      if (response.ok) {
        const data = await response.json()
        const entryId = data.entry?.id || editEntryId
        
        // Invalidate caches to refresh achievements and stats immediately
        queryClient.invalidateQueries({ queryKey: ['/api/journal/entries'] })
        queryClient.invalidateQueries({ queryKey: ['/api/journal/entries', 'own'] }) // Specific invalidation for My Journal
        queryClient.invalidateQueries({ queryKey: ['/api/journal/stats'] })
        queryClient.invalidateQueries({ queryKey: ['/api/journal/achievements'] })
        
        // Handle sharing for shared entries with selected users
        if (privacy === 'shared' && selectedUsers.length > 0 && entryId) {
          try {
            const userIds = selectedUsers.map(user => user.id)
            const shareResponse = await fetch(`/api/journal/entries/${entryId}/share`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              credentials: 'include',
              body: JSON.stringify({ userIds })
            })
            
            if (!shareResponse.ok) {
              console.error('Failed to share entry with selected users')
              toast({
                title: "Partial success",
                description: "Entry saved but sharing failed. You can manage sharing from the feed.",
                variant: "destructive"
              })
            } else {
              console.log('Entry shared successfully with users:', userIds)
            }
          } catch (shareError) {
            console.error('Error sharing entry:', shareError)
          }
        }

        // Handle person tagging for selected people
        if (selectedPeople.length > 0 && entryId) {
          try {
            const tagPromises = selectedPeople.map(async (person) => {
              const tagResponse = await fetch(`/api/journal/entries/${entryId}/people/${person.id}`, {
                method: 'POST',
                credentials: 'include'
              })
              
              if (!tagResponse.ok) {
                console.error(`Failed to tag person ${person.firstName} ${person.lastName}`)
                return false
              } else {
                console.log(`Tagged person ${person.firstName} ${person.lastName} successfully`)
                return true
              }
            })

            const results = await Promise.allSettled(tagPromises)
            const successful = results.filter(r => r.status === 'fulfilled' && r.value === true).length
            const failed = results.length - successful

            if (failed > 0) {
              toast({
                title: "Partial success",
                description: `Entry saved but ${failed} person tags failed. ${successful} people were tagged successfully.`,
                variant: "destructive"
              })
            } else if (successful > 0) {
              console.log(`Successfully tagged ${successful} people in entry`)
            }
          } catch (tagError) {
            console.error('Error tagging people in entry:', tagError)
            toast({
              title: "Partial success", 
              description: "Entry saved but people tagging failed. You can tag people manually later.",
              variant: "destructive"
            })
          }
        }
        
        // Success! For new entries, clear the form. For edits, keep the form populated
        if (!isEditMode) {
          setTitle('')
          setContent('')
          setTags([])
          setPrivacy('private')
          setMediaUrls([])
          setAudioUrl('')
          setAudioPlayable(false)
          setSelectedUsers([])
          setSelectedPeople([])
          setSuggestions(null)
          setShowSuggestions(false)
        }
        
        toast({
          title: isEditMode ? "Entry updated!" : "Entry saved!",
          description: isEditMode ? "Your journal entry has been updated successfully." : "Your journal entry has been saved successfully.",
        })
        
        console.log(isEditMode ? 'Entry updated successfully:' : 'Entry saved successfully:', data)
        
        // Invalidate queries to refresh the data
        queryClient.invalidateQueries({ queryKey: ['/api/journal/entries'] })
        queryClient.invalidateQueries({ queryKey: ['/api/journal/entries', 'own'] }) // Specific invalidation for My Journal
        if (isEditMode) {
          queryClient.invalidateQueries({ queryKey: ['/api/journal/entries', editEntryId] })
        }
        
        // Show AI-suggested tags if any were added (only for new entries)
        if (!isEditMode && data.analysis?.suggestedTags?.length > 0) {
          toast({
            title: "AI suggestions added",
            description: `Added suggested tags: ${data.analysis.suggestedTags.join(', ')}`,
          })
        }
        
        // Close dialog and call success callback
        onOpenChange(false)
        onSaveSuccess?.()
        
      } else {
        const errorData = await response.json().catch(() => ({}))
        toast({
          title: "Save failed",
          description: errorData.error || 'Unable to save entry. Please try again.',
          variant: "destructive"
        })
        console.error('Failed to save entry:', errorData.error || 'Unknown error')
      }
    } catch (error) {
      toast({
        title: "Connection error",
        description: 'Unable to connect to server. Please check your connection.',
        variant: "destructive"
      })
      console.error('Error saving entry:', error)
    } finally {
      setIsSaving(false)
    }
  }

  // Handle scanning text for people names
  const handleScanForPeople = async () => {
    if (!content.trim()) {
      toast({
        title: "No content to scan",
        description: "Please write some content in your entry first.",
        variant: "destructive"
      })
      return
    }

    setIsScanning(true)
    try {
      // First, get AI insights to detect mentioned people
      const response = await fetch('/api/ai/analyze-text', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ 
          text: content,
          analysisType: 'people' // Focus on people detection
        })
      })

      if (!response.ok) {
        throw new Error('Failed to scan for people')
      }

      const aiResult = await response.json()
      const mentionedPeople = aiResult.mentionedPeople || []
      
      if (mentionedPeople.length === 0) {
        setSuggestions({ existingPeople: [], newPeople: [] })
        setShowSuggestions(true)
        toast({
          title: "No people detected",
          description: "AI didn't detect any names in your entry.",
        })
        return
      }

      // Get existing people to match against
      const peopleResponse = await fetch('/api/people', {
        credentials: 'include'
      })
      
      if (!peopleResponse.ok) {
        throw new Error('Failed to fetch existing people')
      }

      const existingPeople = await peopleResponse.json()
      const existingNames = new Set(
        existingPeople.map((person: any) => 
          `${person.firstName || ''} ${person.lastName || ''}`.trim().toLowerCase()
        )
      )

      // Separate into existing and new people
      const existingSuggestions: {id: string, firstName: string, lastName: string | null}[] = []
      const newSuggestions: {originalText: string, firstName: string, lastName: string | null, confidence: string}[] = []

      for (const name of mentionedPeople) {
        const nameParts = name.trim().split(/\s+/)
        const firstName = nameParts[0]
        const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : null
        const fullName = `${firstName} ${lastName || ''}`.trim().toLowerCase()

        // Check if this person already exists
        const existingPerson = existingPeople.find((person: any) => 
          `${person.firstName || ''} ${person.lastName || ''}`.trim().toLowerCase() === fullName
        )

        if (existingPerson) {
          // Don't add duplicates to existing suggestions
          if (!existingSuggestions.find(p => p.id === existingPerson.id)) {
            existingSuggestions.push({
              id: existingPerson.id,
              firstName: existingPerson.firstName,
              lastName: existingPerson.lastName
            })
          }
        } else {
          // Add as new person suggestion
          const confidence = name.length > 1 && /^[A-Za-z\s'-]+$/.test(name) ? 'high' : 'medium'
          newSuggestions.push({
            originalText: name,
            firstName,
            lastName,
            confidence
          })
        }
      }

      setSuggestions({
        existingPeople: existingSuggestions,
        newPeople: newSuggestions
      })
      setShowSuggestions(true)

      toast({
        title: "People detected!",
        description: `Found ${existingSuggestions.length} existing people and ${newSuggestions.length} new names.`,
      })

    } catch (error) {
      console.error('Error scanning for people:', error)
      toast({
        title: "Scan failed",
        description: "Unable to scan for people. Please try again.",
        variant: "destructive"
      })
    } finally {
      setIsScanning(false)
    }
  }

  // Handle toggling people selection (with deduplication)
  const togglePersonSelection = (person: {id: string, firstName: string, lastName: string | null}, isExisting: boolean) => {
    if (isExisting) {
      setSelectedPeople(prev => {
        const isSelected = prev.find(p => p.id === person.id)
        if (isSelected) {
          return prev.filter(p => p.id !== person.id)
        } else {
          // Ensure no duplicates by ID
          if (prev.some(p => p.id === person.id)) {
            return prev
          }
          return [...prev, person]
        }
      })
    }
  }

  // Handle creating and selecting new people
  const handleCreateAndSelectNewPerson = async (suggestion: {originalText: string, firstName: string, lastName: string | null}) => {
    try {
      const personData = {
        firstName: suggestion.firstName,
        lastName: suggestion.lastName || '',
        notes: `Mentioned in journal entry: "${title || 'Untitled'}"`
      }

      const response = await apiRequest('POST', '/api/people', personData)
      const newPerson = await response.json()
      
      // Add to selected people
      setSelectedPeople(prev => [...prev, {
        id: newPerson.id,
        firstName: newPerson.firstName,
        lastName: newPerson.lastName
      }])

      // Remove from new suggestions and add to existing
      setSuggestions(prev => {
        if (!prev) return prev
        return {
          existingPeople: [...prev.existingPeople, {
            id: newPerson.id,
            firstName: newPerson.firstName,
            lastName: newPerson.lastName
          }],
          newPeople: prev.newPeople.filter(p => p.originalText !== suggestion.originalText)
        }
      })

      toast({
        title: "Person created!",
        description: `${suggestion.firstName} ${suggestion.lastName || ''} has been added to your people.`,
      })

    } catch (error) {
      console.error('Error creating person:', error)
      toast({
        title: "Creation failed",
        description: "Unable to create person. Please try again.",
        variant: "destructive"
      })
    }
  }

  // Manual person creation function
  const handleCreateManualPerson = async () => {
    if (!newPersonForm.firstName.trim()) {
      toast({
        title: "First name required",
        description: "Please enter a first name for the person.",
        variant: "destructive"
      })
      return
    }

    setIsCreatingPerson(true)
    try {
      const personData = {
        firstName: newPersonForm.firstName.trim(),
        lastName: newPersonForm.lastName.trim() || '',
        notes: newPersonForm.notes.trim() || `Added from journal entry: "${title || 'Untitled'}"`
      }

      const response = await apiRequest('POST', '/api/people', personData)
      const newPerson = await response.json()
      
      // Normalize lastName and add to selected people (with deduplication)
      const normalizedPerson = {
        id: newPerson.id,
        firstName: newPerson.firstName,
        lastName: newPerson.lastName || null
      }

      setSelectedPeople(prev => {
        // Check for duplicates
        if (prev.some(p => p.id === normalizedPerson.id)) {
          return prev
        }
        return [...prev, normalizedPerson]
      })

      // Clear form and invalidate cache
      setNewPersonForm({ firstName: '', lastName: '', notes: '' })
      queryClient.invalidateQueries({ queryKey: ['/api/people'] })

      toast({
        title: "Person created!",
        description: `${newPerson.firstName} ${newPerson.lastName || ''} has been added and tagged.`,
      })

    } catch (error) {
      console.error('Error creating person:', error)
      toast({
        title: "Creation failed",
        description: "Unable to create person. Please try again.",
        variant: "destructive"
      })
    } finally {
      setIsCreatingPerson(false)
    }
  }

  // Helper functions for person management
  const getPersonDisplayName = (person: Person) => 
    `${person.firstName}${person.lastName ? ` ${person.lastName}` : ''}`

  const getPersonInitials = (person: Person) => 
    `${person.firstName[0]}${person.lastName?.[0] || ''}`

  // Filter people based on search query
  const filteredPeople = allPeople?.filter((person) => {
    if (!personSearchQuery.trim()) return true
    const query = personSearchQuery.toLowerCase()
    const fullName = getPersonDisplayName(person).toLowerCase()
    return fullName.includes(query)
  }) || []

  // Toggle manual person search
  const togglePersonSearch = () => {
    setShowPersonSearch(!showPersonSearch)
    if (!showPersonSearch) {
      setPersonSearchQuery('')
    }
  }

  const privacyOptions = [
    { value: 'private' as const, label: 'Private', icon: Lock, description: 'Only you can see this' },
    { value: 'shared' as const, label: 'Shared', icon: Users, description: 'Share with specific people' },
    { value: 'public' as const, label: 'Public', icon: Globe, description: 'Everyone can see this' }
  ]

  // Show loading state when in edit mode and fetching entry
  if (isEditMode && isLoadingEntry) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden">
          <div className="flex items-center justify-center h-64">
            <div className="text-center space-y-4">
              <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto" />
              <p className="text-sm text-muted-foreground">Loading entry for editing...</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    )
  }
  
  // Show error state if entry fetch failed in edit mode
  if (isEditMode && !editEntry && !isLoadingEntry) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden">
          <div className="flex flex-col items-center justify-center h-64">
            <div className="text-center space-y-4 max-w-md">
              <div className="h-16 w-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto">
                <X className="h-8 w-8 text-destructive" />
              </div>
              <h3 className="text-lg font-medium text-foreground">Entry not found</h3>
              <p className="text-sm text-muted-foreground">
                The journal entry you're trying to edit could not be found or you don't have permission to edit it.
              </p>
              <Button onClick={() => onOpenChange(false)} variant="outline">
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden p-0">
        <DialogHeader className="px-6 py-4 border-b border-border">
          <DialogTitle className="text-lg font-semibold">
            {isEditMode ? 'Edit Entry' : 'New Journal Entry'}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-100px)]">
          <div className="px-6 py-4">
            {/* Recording interface */}
            <div className="mb-6 py-6 bg-gradient-to-b from-background to-muted/30 -mx-6 px-6 rounded-lg">
              <div className="text-center space-y-4">
                <h2 className="text-xl font-medium text-foreground">Voice Recording</h2>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                  {isRecording ? 'Recording in progress... Speak clearly for better transcription' :
                   isTranscribing ? 'Processing your recording with AI transcription...' :
                   'Tap the button below to start recording your thoughts'}
                </p>
                
                <div className="flex justify-center py-4">
                  <RecordButton
                    onRecordingStart={handleRecordingStart}
                    onRecordingStop={handleRecordingStop}
                    onTranscriptionUpdate={handleTranscriptionUpdate}
                    disabled={isTranscribing}
                  />
                </div>
                
                {isTranscribing && (
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
                    Transcribing with AI...
                  </div>
                )}
                
                {/* Audio playback control - only show when audio is available */}
                {audioUrl && (
                  <div className="mt-6 pt-4 border-t border-border/50">
                    <div className="flex items-center justify-center gap-3">
                      <Label htmlFor="audio-playable" className="text-sm font-medium text-foreground">
                        Make audio playable in feed
                      </Label>
                      <Switch 
                        id="audio-playable"
                        checked={audioPlayable}
                        onCheckedChange={setAudioPlayable}
                        data-testid="switch-audio-playable"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground text-center mt-2 max-w-xs mx-auto">
                      When enabled, others can play your voice recording from the feed
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Entry form */}
            <div className="space-y-6">
              {/* Title */}
              <div className="space-y-2">
                <Label htmlFor="title" className="text-sm font-medium text-foreground">Title (optional)</Label>
                <Input
                  id="title"
                  placeholder="Give your entry a title..."
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  data-testid="input-entry-title"
                />
              </div>

              {/* Content */}
              <div className="space-y-2">
                <Label htmlFor="content" className="text-sm font-medium text-foreground">Your thoughts</Label>
                <Textarea
                  id="content"
                  placeholder="Start typing or use voice recording above..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="min-h-32 resize-none"
                  data-testid="textarea-entry-content"
                />
              </div>

              {/* People Section */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    People
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Tag people mentioned in your entry. AI can automatically detect names for you.
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {/* Add People Controls */}
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="flex-1 justify-center hover-elevate"
                        onClick={handleScanForPeople}
                        disabled={isScanning || !content.trim()}
                        data-testid="button-scan-people"
                      >
                        {isScanning ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Scanning...
                          </>
                        ) : (
                          <>
                            <UserPlus className="h-4 w-4 mr-2" />
                            Scan Text
                          </>
                        )}
                      </Button>
                      <Button
                        variant={showPersonSearch ? "default" : "outline"}
                        className="flex-1 justify-center hover-elevate"
                        onClick={togglePersonSearch}
                        data-testid="button-manual-add"
                      >
                        <Search className="h-4 w-4 mr-2" />
                        Manual Add
                      </Button>
                    </div>

                    {/* Manual Person Search and Creation */}
                    {showPersonSearch && (
                      <div className="space-y-3 border rounded-lg p-3 bg-muted/50">
                        {/* Search Existing People */}
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Search Existing People</Label>
                          <div className="relative">
                            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              placeholder="Search by name..."
                              value={personSearchQuery}
                              onChange={(e) => setPersonSearchQuery(e.target.value)}
                              className="pl-8"
                              data-testid="input-person-search"
                            />
                          </div>
                        </div>

                        {/* People Search Results */}
                        {personSearchQuery.trim() && (
                          <div className="space-y-1 max-h-32 overflow-y-auto">
                            {isLoadingPeople ? (
                              <div className="flex items-center justify-center py-4" data-testid="status-people-loading">
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                <span className="text-xs text-muted-foreground">Searching people...</span>
                              </div>
                            ) : filteredPeople.length > 0 ? (
                              filteredPeople.map((person) => {
                                const isSelected = selectedPeople.find(p => p.id === person.id)
                                return (
                                  <div
                                    key={person.id}
                                    className={cn(
                                      "flex items-center gap-3 p-2 rounded-lg border cursor-pointer transition-colors hover-elevate text-sm",
                                      isSelected ? 'border-primary bg-primary/10' : 'border-border'
                                    )}
                                    onClick={() => togglePersonSelection({
                                      id: person.id,
                                      firstName: person.firstName,
                                      lastName: person.lastName
                                    }, true)}
                                    data-testid={`person-search-result-${person.id}`}
                                  >
                                    <Avatar className="h-6 w-6">
                                      <AvatarFallback className="text-xs">
                                        {getPersonInitials(person)}
                                      </AvatarFallback>
                                    </Avatar>
                                    <span className="flex-1">{getPersonDisplayName(person)}</span>
                                    <div className={cn(
                                      'h-3 w-3 rounded-full border transition-colors',
                                      isSelected ? 'border-primary bg-primary' : 'border-muted-foreground'
                                    )}>
                                      {isSelected && (
                                        <div className="h-full w-full rounded-full bg-background scale-50" />
                                      )}
                                    </div>
                                  </div>
                                )
                              })
                            ) : (
                              <div className="text-center py-2">
                                <p className="text-xs text-muted-foreground mb-2">
                                  No people found matching "{personSearchQuery}"
                                </p>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setNewPersonForm(prev => ({
                                    ...prev,
                                    firstName: personSearchQuery.split(' ')[0] || '',
                                    lastName: personSearchQuery.split(' ').slice(1).join(' ') || ''
                                  }))}
                                  data-testid="button-create-from-search"
                                >
                                  <Plus className="h-3 w-3 mr-1" />
                                  Create "{personSearchQuery}"
                                </Button>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Create New Person Form */}
                        <div className="space-y-2 pt-2 border-t">
                          <Label className="text-sm font-medium">Create New Person</Label>
                          <div className="grid grid-cols-2 gap-2">
                            <Input
                              placeholder="First name *"
                              value={newPersonForm.firstName}
                              onChange={(e) => setNewPersonForm(prev => ({ ...prev, firstName: e.target.value }))}
                              data-testid="input-manual-first-name"
                            />
                            <Input
                              placeholder="Last name"
                              value={newPersonForm.lastName}
                              onChange={(e) => setNewPersonForm(prev => ({ ...prev, lastName: e.target.value }))}
                              data-testid="input-manual-last-name"
                            />
                          </div>
                          <Textarea
                            placeholder="Notes about this person..."
                            value={newPersonForm.notes}
                            onChange={(e) => setNewPersonForm(prev => ({ ...prev, notes: e.target.value }))}
                            className="resize-none"
                            rows={2}
                            data-testid="textarea-manual-notes"
                          />
                          <Button
                            onClick={handleCreateManualPerson}
                            disabled={!newPersonForm.firstName.trim() || isCreatingPerson}
                            className="w-full"
                            data-testid="button-create-manual-person"
                          >
                            {isCreatingPerson ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Creating...
                              </>
                            ) : (
                              <>
                                <Plus className="h-4 w-4 mr-2" />
                                Create & Tag Person
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Selected People Display */}
                    {selectedPeople.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium mb-2">Tagged People:</h4>
                        <div className="flex flex-wrap gap-2">
                          {selectedPeople.map((person) => (
                            <Badge 
                              key={person.id} 
                              variant="secondary"
                              className="gap-1 cursor-pointer hover-elevate"
                              onClick={() => togglePersonSelection(person, true)}
                              data-testid={`tagged-person-${person.id}`}
                            >
                              {person.firstName} {person.lastName || ''}
                              <X className="h-3 w-3" />
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* People Suggestions */}
                    {showSuggestions && suggestions && (
                      <div className="space-y-3">
                        {suggestions.existingPeople.length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium mb-2">Existing People:</h4>
                            <div className="space-y-2">
                              {suggestions.existingPeople.map((person) => {
                                const isSelected = selectedPeople.find(p => p.id === person.id)
                                return (
                                  <div
                                    key={person.id}
                                    className={cn(
                                      "flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors hover-elevate",
                                      isSelected ? 'border-primary bg-primary/10' : 'border-border'
                                    )}
                                    onClick={() => togglePersonSelection(person, true)}
                                    data-testid={`existing-person-${person.id}`}
                                  >
                                    <span className="text-sm font-medium">
                                      {person.firstName} {person.lastName || ''}
                                    </span>
                                    <div className={cn(
                                      'h-4 w-4 rounded-full border-2 transition-colors',
                                      isSelected ? 'border-primary bg-primary' : 'border-muted-foreground'
                                    )}>
                                      {isSelected && (
                                        <div className="h-full w-full rounded-full bg-background scale-50" />
                                      )}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}

                        {suggestions.newPeople.length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium mb-2">New People:</h4>
                            <div className="space-y-2">
                              {suggestions.newPeople.map((suggestion, index) => (
                                <div
                                  key={`${suggestion.originalText}-${index}`}
                                  className="flex items-center justify-between p-3 rounded-lg border border-border hover-elevate"
                                  data-testid={`new-person-suggestion-${index}`}
                                >
                                  <div className="flex-1">
                                    <span className="text-sm font-medium">
                                      {suggestion.firstName} {suggestion.lastName || ''}
                                    </span>
                                    <div className="flex items-center gap-2 mt-1">
                                      <Badge variant="outline" className="text-xs">
                                        {suggestion.confidence}
                                      </Badge>
                                      <span className="text-xs text-muted-foreground">
                                        from "{suggestion.originalText}"
                                      </span>
                                    </div>
                                  </div>
                                  <Button
                                    size="sm"
                                    onClick={() => handleCreateAndSelectNewPerson(suggestion)}
                                    data-testid={`create-person-${index}`}
                                  >
                                    <UserPlus className="h-3 w-3 mr-1" />
                                    Create & Tag
                                  </Button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {suggestions.existingPeople.length === 0 && suggestions.newPeople.length === 0 && (
                          <p className="text-sm text-muted-foreground text-center py-4" data-testid="no-people-detected">
                            No people detected in your entry.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Media upload */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Image className="h-4 w-4" />
                    Attachments
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <ObjectUploader
                      maxNumberOfFiles={5}
                      maxFileSize={10485760} // 10MB
                      onComplete={handlePhotoUpload}
                      buttonClassName="w-full"
                    >
                      <Button variant="outline" className="w-full justify-center hover-elevate">
                        <Camera className="h-4 w-4 mr-2" />
                        Add Photos
                      </Button>
                    </ObjectUploader>
                    
                    {mediaUrls.length > 0 && (
                      <div className="grid grid-cols-3 gap-2">
                        {mediaUrls.map((url, index) => (
                          <div key={index} className="relative">
                            <div className="aspect-square bg-muted rounded-md flex items-center justify-center relative overflow-hidden">
                              <img 
                                src={url} 
                                alt={`Photo ${index + 1}`}
                                className="w-full h-full object-cover"
                                data-testid={`photo-${index}`}
                              />
                              <Button
                                variant="destructive"
                                size="icon"
                                className="absolute top-1 right-1 h-6 w-6"
                                onClick={() => removePhoto(index)}
                                data-testid={`button-remove-photo-${index}`}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Tags */}
              <div className="space-y-3">
                <Label className="text-sm font-medium text-foreground">Tags</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Add a tag..."
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyPress={handleKeyPress}
                    className="flex-1"
                    data-testid="input-new-tag"
                  />
                  <Button onClick={addTag} variant="outline" size="sm" data-testid="button-add-tag">
                    Add
                  </Button>
                </div>
                
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {tags.map((tag) => (
                      <Badge 
                        key={tag} 
                        variant="secondary" 
                        className="gap-1 cursor-pointer hover-elevate"
                        onClick={() => removeTag(tag)}
                        data-testid={`tag-${tag}`}
                      >
                        #{tag}
                        <X className="h-3 w-3" />
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* Privacy settings */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Privacy & Sharing</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {privacyOptions.map((option) => {
                    const Icon = option.icon
                    return (
                      <div 
                        key={option.value}
                        className={cn(
                          'flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors hover-elevate',
                          privacy === option.value ? 'border-primary bg-primary/5' : 'border-border'
                        )}
                        onClick={() => setPrivacy(option.value)}
                        data-testid={`privacy-option-${option.value}`}
                      >
                        <div className="flex items-center gap-3">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="font-medium text-sm">{option.label}</p>
                            <p className="text-xs text-muted-foreground">{option.description}</p>
                          </div>
                        </div>
                        <div className={cn(
                          'h-4 w-4 rounded-full border-2 transition-colors',
                          privacy === option.value ? 'border-primary bg-primary' : 'border-muted-foreground'
                        )}>
                          {privacy === option.value && (
                            <div className="h-full w-full rounded-full bg-background scale-50" />
                          )}
                        </div>
                      </div>
                    )
                  })}
                  
                  {/* User selector for shared privacy */}
                  {privacy === 'shared' && (
                    <div className="mt-4 pt-4 border-t border-border">
                      <Label className="text-sm font-medium text-foreground mb-3 block">Share with users</Label>
                      <UserSelector
                        selectedUsers={selectedUsers}
                        onUsersChange={setSelectedUsers}
                        placeholder="Search by email or name to add users..."
                        className=""
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </ScrollArea>
        
        <DialogFooter className="px-6 py-4 border-t border-border">
          <Button 
            onClick={handleSave}
            disabled={!content.trim() || isSaving}
            data-testid="button-save-entry"
          >
            {isSaving ? (
              <>
                <div className="animate-spin h-4 w-4 mr-2 border-2 border-current border-t-transparent rounded-full" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                {isEditMode ? 'Update' : 'Save'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}