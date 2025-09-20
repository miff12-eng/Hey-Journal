import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Camera, Image, Users, Globe, Lock, Save, X, Upload, Sparkles } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useLocation } from 'wouter'
import { useQuery, useMutation } from '@tanstack/react-query'
import { apiRequest, queryClient } from '@/lib/queryClient'
import RecordButton from '@/components/RecordButton'
import { ObjectUploader } from '@/components/ObjectUploader'
import ThemeToggle from '@/components/ThemeToggle'
import UserSelector from '@/components/UserSelector'
import { cn } from '@/lib/utils'

type PrivacyLevel = 'private' | 'shared' | 'public'

export default function Record() {
  const search = typeof window !== 'undefined' ? window.location.search : ''
  const urlParams = new URLSearchParams(search)
  const editEntryId = urlParams.get('edit')
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
  const [suggestions, setSuggestions] = useState<{suggestedTitles: string[], suggestedTags: string[]}>({ suggestedTitles: [], suggestedTags: [] })
  const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState(false)
  const { toast } = useToast()
  
  // Fetch entry data when in edit mode
  const { data: editEntry, isLoading: isLoadingEntry, error } = useQuery({
    queryKey: ['/api/journal/entries', editEntryId],
    enabled: isEditMode,
    queryFn: async () => {
      console.log('🚀 Making API call to fetch entry:', editEntryId)
      const response = await fetch(`/api/journal/entries/${editEntryId}`, {
        credentials: 'include'
      })
      if (!response.ok) {
        console.error('❌ API call failed:', response.status, response.statusText)
        throw new Error('Failed to fetch entry')
      }
      const data = await response.json()
      console.log('✅ API call successful, received data:', data)
      return data
    }
  })
  
  // Debug logging for query state
  console.log('🔍 Query state - isLoadingEntry:', isLoadingEntry)
  console.log('🔍 Query state - editEntry:', editEntry)
  console.log('🔍 Query state - error:', error)
  
  // Populate form when entry data is loaded
  useEffect(() => {
    console.log('🔄 useEffect triggered - editEntry:', editEntry, 'isEditMode:', isEditMode)
    if (editEntry && isEditMode) {
      console.log('📝 Populating form with entry data:', editEntry)
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
  
  // Show loading state when in edit mode and fetching entry
  if (isEditMode && isLoadingEntry) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center space-y-4">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto" />
          <p className="text-sm text-muted-foreground">Loading entry for editing...</p>
        </div>
      </div>
    )
  }
  
  // Show error state if entry fetch failed in edit mode
  if (isEditMode && !editEntry && !isLoadingEntry) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-background">
        <div className="text-center space-y-4 max-w-md">
          <div className="h-16 w-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto">
            <X className="h-8 w-8 text-destructive" />
          </div>
          <h3 className="text-lg font-medium text-foreground">Entry not found</h3>
          <p className="text-sm text-muted-foreground">
            The journal entry you're trying to edit could not be found or you don't have permission to edit it.
          </p>
          <Button onClick={() => window.location.href = '/'} variant="outline">
            Back to Home
          </Button>
        </div>
      </div>
    )
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

  const generateSuggestions = async () => {
    if (!content.trim()) {
      toast({
        title: "No content to analyze",
        description: "Please add some content to your thoughts before generating suggestions.",
        variant: "destructive"
      })
      return
    }

    setIsGeneratingSuggestions(true)
    try {
      const response = await fetch('/api/ai/suggestions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ content })
      })

      if (response.ok) {
        const data = await response.json()
        setSuggestions(data)
        toast({
          title: "Suggestions generated!",
          description: `Found ${data.suggestedTitles.length} title suggestions and ${data.suggestedTags.length} tag suggestions.`,
        })
      } else {
        toast({
          title: "Failed to generate suggestions",
          description: "Unable to generate AI suggestions. Please try again.",
          variant: "destructive"
        })
      }
    } catch (error) {
      toast({
        title: "Connection error",
        description: "Unable to connect to AI service. Please try again.",
        variant: "destructive"
      })
    } finally {
      setIsGeneratingSuggestions(false)
    }
  }

  const applyTitleSuggestion = (suggestedTitle: string) => {
    setTitle(suggestedTitle)
    toast({
      title: "Title applied",
      description: `Title set to: "${suggestedTitle}"`
    })
  }

  const applyTagSuggestion = (suggestedTag: string) => {
    if (!tags.includes(suggestedTag)) {
      setTags([...tags, suggestedTag])
      toast({
        title: "Tag added",
        description: `Added tag: "${suggestedTag}"`
      })
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

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-foreground">
            {isEditMode ? 'Edit Entry' : 'New Entry'}
          </h1>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button 
              onClick={handleSave}
              disabled={!content.trim() || !title.trim() || isSaving}
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
        </div>
      </header>

      {/* Recording interface */}
      <div className="px-4 py-6 bg-gradient-to-b from-background to-muted/30">
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
      <div className="flex-1 px-4 py-4 space-y-6 pb-20">
        {/* Title */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="title" className="text-sm font-medium text-foreground">Title</Label>
            <Button 
              type="button"
              variant="outline" 
              size="sm"
              onClick={generateSuggestions}
              disabled={!content.trim() || isGeneratingSuggestions}
              data-testid="button-generate-suggestions"
            >
              {isGeneratingSuggestions ? (
                <>
                  <div className="animate-spin h-4 w-4 mr-2 border-2 border-current border-t-transparent rounded-full" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  AI Suggest
                </>
              )}
            </Button>
          </div>
          <Input
            id="title"
            placeholder="Give your entry a title..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            data-testid="input-entry-title"
          />
          
          {/* Title suggestions */}
          {suggestions.suggestedTitles.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Suggested Titles:</Label>
              <div className="flex flex-wrap gap-2">
                {suggestions.suggestedTitles.map((suggestedTitle, index) => (
                  <Button
                    key={index}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => applyTitleSuggestion(suggestedTitle)}
                    className="text-xs hover-elevate"
                    data-testid={`button-apply-title-${index}`}
                  >
                    {suggestedTitle}
                  </Button>
                ))}
              </div>
            </div>
          )}
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
                maxFileSize={52428800} // 50MB for videos
                acceptedFileTypes={[
                  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
                  'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo'
                ]}
                onComplete={handlePhotoUpload}
                buttonClassName="w-full"
              >
                <Button variant="outline" className="w-full justify-center hover-elevate">
                  <Camera className="h-4 w-4 mr-2" />
                  Add Photos & Videos
                </Button>
              </ObjectUploader>
              
              {mediaUrls.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {mediaUrls.map((url, index) => {
                    const isVideo = /\.(mp4|webm|mov|avi)$/i.test(url) || url.includes('video/');
                    return (
                      <div key={index} className="relative">
                        <div className="aspect-square bg-muted rounded-md flex items-center justify-center relative overflow-hidden">
                          {isVideo ? (
                            <video 
                              src={url} 
                              className="w-full h-full object-cover"
                              controls
                              muted
                              data-testid={`video-${index}`}
                            />
                          ) : (
                            <img 
                              src={url} 
                              alt={`Photo ${index + 1}`}
                              className="w-full h-full object-cover"
                              data-testid={`photo-${index}`}
                            />
                          )}
                          <Button
                            variant="destructive"
                            size="icon"
                            className="absolute top-1 right-1 h-6 w-6"
                            onClick={() => removePhoto(index)}
                            data-testid={`button-remove-media-${index}`}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
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
          
          {/* Tag suggestions */}
          {suggestions.suggestedTags.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Suggested Tags:</Label>
              <div className="flex flex-wrap gap-2">
                {suggestions.suggestedTags.map((suggestedTag, index) => (
                  <Button
                    key={index}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => applyTagSuggestion(suggestedTag)}
                    className="text-xs hover-elevate"
                    disabled={tags.includes(suggestedTag)}
                    data-testid={`button-apply-tag-${index}`}
                  >
                    #{suggestedTag}
                  </Button>
                ))}
              </div>
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
                  data-testid={`privacy-${option.value}`}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'p-2 rounded-full',
                      privacy === option.value ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                    )}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{option.label}</p>
                      <p className="text-xs text-muted-foreground">{option.description}</p>
                    </div>
                  </div>
                  <Switch 
                    checked={privacy === option.value}
                    onChange={() => setPrivacy(option.value)}
                  />
                </div>
              )
            })}
            
            {/* User selector for shared entries */}
            {privacy === 'shared' && (
              <div className="pt-4 border-t border-border">
                <UserSelector
                  selectedUsers={selectedUsers}
                  onUsersChange={setSelectedUsers}
                  placeholder="Search users by email or name..."
                  className="space-y-3"
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}