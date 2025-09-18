import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Camera, Image, Users, Globe, Lock, Save, X, Upload } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useQuery } from '@tanstack/react-query'
import { apiRequest, queryClient } from '@/lib/queryClient'
import RecordButton from '@/components/RecordButton'
import { ObjectUploader } from '@/components/ObjectUploader'
import UserSelector from '@/components/UserSelector'
import { cn } from '@/lib/utils'

type PrivacyLevel = 'private' | 'shared' | 'public'

interface RecordDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editEntryId?: string | null
  onSaveSuccess?: () => void
}

export default function RecordDialog({ open, onOpenChange, editEntryId, onSaveSuccess }: RecordDialogProps) {
  const isEditMode = !!editEntryId
  
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
    }
  }, [editEntry, isEditMode])
  
  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      // Only reset when dialog actually closes, not when creating new entries
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
    }
  }, [open])

  // Reset form when switching from edit mode to create mode
  useEffect(() => {
    if (open && !isEditMode && !editEntry) {
      // Reset form for new entries only when dialog opens for creation
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
    }
  }, [open, isEditMode, editEntry])
  
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
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-semibold">
              {isEditMode ? 'Edit Entry' : 'New Journal Entry'}
            </DialogTitle>
            <Button 
              onClick={handleSave}
              disabled={!content.trim() || isSaving}
              size="sm"
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
                  Save
                </>
              )}
            </Button>
          </div>
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
      </DialogContent>
    </Dialog>
  )
}