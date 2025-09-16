import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Camera, Image, Users, Globe, Lock, Save, X, Upload } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useLocation } from 'wouter'
import { useQuery, useMutation } from '@tanstack/react-query'
import { apiRequest, queryClient } from '@/lib/queryClient'
import RecordButton from '@/components/RecordButton'
import { ObjectUploader } from '@/components/ObjectUploader'
import ThemeToggle from '@/components/ThemeToggle'
import { cn } from '@/lib/utils'

type PrivacyLevel = 'private' | 'shared' | 'public'

export default function Record() {
  const search = typeof window !== 'undefined' ? window.location.search : ''
  const urlParams = new URLSearchParams(search)
  const editEntryId = urlParams.get('edit')
  const isEditMode = !!editEntryId
  
  // Debug logging
  console.log('🔍 Record Debug - search:', search)
  console.log('🔍 Record Debug - editEntryId:', editEntryId)
  console.log('🔍 Record Debug - isEditMode:', isEditMode)
  
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [newTag, setNewTag] = useState('')
  const [privacy, setPrivacy] = useState<PrivacyLevel>('private')
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [mediaUrls, setMediaUrls] = useState<string[]>([])
  const [isSaving, setIsSaving] = useState(false)
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
    }
  }, [editEntry, isEditMode])
  
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
    
    // Call real OpenAI Whisper transcription API
    const transcribeAudio = async () => {
      try {
        const formData = new FormData()
        formData.append('audio', audioBlob, 'recording.wav')
        
        const response = await fetch('/api/ai/transcribe', {
          method: 'POST',
          body: formData,
          credentials: 'include'
        })
        
        if (response.ok) {
          const data = await response.json()
          const transcription = data.text || 'Unable to transcribe audio'
          setContent(prev => prev + (prev ? '\n\n' : '') + transcription)
        } else {
          console.error('Transcription failed:', response.status)
          setContent(prev => prev + (prev ? '\n\n' : '') + 'Transcription failed. Please try again.')
        }
      } catch (error) {
        console.error('Transcription error:', error)
        setContent(prev => prev + (prev ? '\n\n' : '') + 'Transcription error. Please check your connection.')
      } finally {
        setIsTranscribing(false)
      }
    }
    
    transcribeAudio()
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
      mediaUrls
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
          mediaUrls: mediaUrls
        })
      })
      
      if (response.ok) {
        const data = await response.json()
        
        // Success! For new entries, clear the form. For edits, keep the form populated
        if (!isEditMode) {
          setTitle('')
          setContent('')
          setTags([])
          setPrivacy('private')
          setMediaUrls([])
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
        </div>
      </div>

      {/* Entry form */}
      <div className="flex-1 px-4 py-4 space-y-6 pb-20">
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
                <div className="flex items-center gap-2">
                  <Camera className="h-4 w-4" />
                  Add Photos
                </div>
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
          </CardContent>
        </Card>
      </div>
    </div>
  )
}