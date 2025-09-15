import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Camera, Image, Users, Globe, Lock, Save, X, Upload } from 'lucide-react'
import RecordButton from '@/components/RecordButton'
import ThemeToggle from '@/components/ThemeToggle'
import { cn } from '@/lib/utils'

type PrivacyLevel = 'private' | 'shared' | 'public'

export default function Record() {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [newTag, setNewTag] = useState('')
  const [privacy, setPrivacy] = useState<PrivacyLevel>('private')
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [attachedFiles, setAttachedFiles] = useState<File[]>([])

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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files)
      setAttachedFiles(prev => [...prev, ...newFiles])
    }
  }

  const removeFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index))
  }

  const handleSave = () => {
    const entry = {
      title: title.trim(),
      content: content.trim(),
      tags,
      privacy,
      attachedFiles
    }
    console.log('Saving entry:', entry)
    // In a real app, this would save to the backend
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
          <h1 className="text-lg font-semibold text-foreground">New Entry</h1>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button 
              onClick={handleSave}
              disabled={!content.trim()}
              size="sm"
              data-testid="button-save-entry"
            >
              <Save className="h-4 w-4 mr-2" />
              Save
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
              <div className="flex gap-2">
                <input
                  type="file"
                  id="photo-upload"
                  accept="image/*"
                  multiple
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <input
                  type="file"
                  id="video-upload"
                  accept="video/*"
                  multiple
                  onChange={handleFileUpload}
                  className="hidden"
                />
                
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => document.getElementById('photo-upload')?.click()}
                  data-testid="button-add-photo"
                >
                  <Camera className="h-4 w-4 mr-2" />
                  Add Photo
                </Button>
                
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => document.getElementById('video-upload')?.click()}
                  data-testid="button-add-video"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Add Video
                </Button>
              </div>
              
              {attachedFiles.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {attachedFiles.map((file, index) => (
                    <div key={index} className="relative">
                      <div className="aspect-square bg-muted rounded-md flex items-center justify-center relative overflow-hidden">
                        {file.type.startsWith('image/') ? (
                          <img 
                            src={URL.createObjectURL(file)} 
                            alt={file.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Upload className="h-6 w-6 text-muted-foreground" />
                        )}
                        <Button
                          variant="destructive"
                          size="icon"
                          className="absolute top-1 right-1 h-6 w-6"
                          onClick={() => removeFile(index)}
                          data-testid={`button-remove-file-${index}`}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 truncate">{file.name}</p>
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