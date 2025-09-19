import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Play, Pause, Volume2, VolumeX } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AudioPlayerProps {
  audioUrl: string
  className?: string
  showFullControls?: boolean
}

export default function AudioPlayer({ 
  audioUrl, 
  className,
  showFullControls = true 
}: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isMuted, setIsMuted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasInteracted, setHasInteracted] = useState(false)
  
  const audioRef = useRef<HTMLAudioElement>(null)
  const progressRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleLoadedMetadata = () => {
      setDuration(audio.duration)
      setIsLoading(false)
    }

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime)
    }

    const handleEnded = () => {
      setIsPlaying(false)
      setCurrentTime(0)
    }

    const handleError = (e?: Event) => {
      const errorEvent = e as ErrorEvent
      console.error('Audio load error:', {
        audioUrl,
        error: errorEvent?.error,
        message: errorEvent?.message,
        readyState: audio.readyState,
        networkState: audio.networkState
      })
      
      // Different error messages based on the audio state
      if (audio.networkState === 3) { // NETWORK_NO_SOURCE
        setError('Audio file not accessible')
      } else if (audio.readyState === 0) { // HAVE_NOTHING
        setError('Audio unavailable - may require login')
      } else {
        setError('Audio unavailable')
      }
      setIsLoading(false)
    }

    const handleCanPlay = () => {
      setIsLoading(false)
    }

    audio.addEventListener('loadedmetadata', handleLoadedMetadata)
    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('error', handleError)
    audio.addEventListener('canplay', handleCanPlay)

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('error', handleError)
      audio.removeEventListener('canplay', handleCanPlay)
    }
  }, [audioUrl])

  const togglePlayPause = async () => {
    const audio = audioRef.current
    if (!audio) return

    try {
      if (isPlaying) {
        audio.pause()
        setIsPlaying(false)
      } else {
        // Mark that user has interacted
        setHasInteracted(true)
        await audio.play()
        setIsPlaying(true)
      }
    } catch (err: any) {
      console.error('Error playing audio:', {
        audioUrl,
        error: err?.name,
        message: err?.message,
        code: err?.code,
        hasInteracted,
        readyState: audio.readyState,
        networkState: audio.networkState
      })
      
      // Handle specific mobile browser audio policy errors
      if (err?.name === 'NotAllowedError' || err?.name === 'AbortError') {
        setError('Audio requires user interaction - tap to play')
      } else if (err?.name === 'NotSupportedError') {
        setError('Audio format not supported')
      } else {
        setError('Failed to play audio')
      }
    }
  }

  const toggleMute = () => {
    const audio = audioRef.current
    if (!audio) return

    audio.muted = !audio.muted
    setIsMuted(audio.muted)
  }

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current
    const progressBar = progressRef.current
    if (!audio || !progressBar) return

    const rect = progressBar.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const progressWidth = rect.width
    const clickedTime = (clickX / progressWidth) * duration

    audio.currentTime = clickedTime
    setCurrentTime(clickedTime)
  }

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60)
    const seconds = Math.floor(time % 60)
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0

  if (error) {
    return (
      <div className={cn(
        "flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-md",
        className
      )}>
        <VolumeX className="h-4 w-4 text-destructive" />
        <span className="text-sm text-destructive">{error}</span>
      </div>
    )
  }

  return (
    <div className={cn(
      "flex items-center gap-3 p-3 bg-muted/30 border rounded-md",
      className
    )}>
      <audio ref={audioRef} src={audioUrl} preload="metadata" />
      
      {/* Play/Pause Button */}
      <Button
        size="icon"
        variant="ghost"
        onClick={togglePlayPause}
        disabled={isLoading}
        className="h-8 w-8 flex-shrink-0"
        data-testid="button-audio-play-pause"
      >
        {isLoading ? (
          <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        ) : isPlaying ? (
          <Pause className="h-4 w-4" />
        ) : (
          <Play className="h-4 w-4" />
        )}
      </Button>

      {/* Progress Bar and Time */}
      <div className="flex-1 space-y-1">
        {/* Progress Bar */}
        <div 
          ref={progressRef}
          className="h-2 bg-muted rounded-full cursor-pointer group"
          onClick={handleProgressClick}
        >
          <div 
            className="h-full bg-primary rounded-full transition-all group-hover:bg-primary/80"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
        
        {/* Time Display */}
        {showFullControls && (
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        )}
      </div>

      {/* Mute Button */}
      {showFullControls && (
        <Button
          size="icon"
          variant="ghost"
          onClick={toggleMute}
          className="h-8 w-8 flex-shrink-0"
          data-testid="button-audio-mute"
        >
          {isMuted ? (
            <VolumeX className="h-4 w-4" />
          ) : (
            <Volume2 className="h-4 w-4" />
          )}
        </Button>
      )}

      {/* Audio icon for compact view */}
      {!showFullControls && (
        <Volume2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      )}
    </div>
  )
}