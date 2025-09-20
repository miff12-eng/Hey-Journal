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
  const [isMobile, setIsMobile] = useState(false)
  const [needsUserInteraction, setNeedsUserInteraction] = useState(false)
  
  const audioRef = useRef<HTMLAudioElement>(null)
  const progressRef = useRef<HTMLDivElement>(null)

  // Detect mobile browsers
  useEffect(() => {
    const detectMobile = () => {
      const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera
      return /android|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent)
    }
    setIsMobile(detectMobile())
  }, [])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleLoadedMetadata = () => {
      setDuration(audio.duration)
      setIsLoading(false)
      console.log('Audio loaded successfully:', {
        audioUrl,
        duration: audio.duration,
        readyState: audio.readyState
      })
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
        networkState: audio.networkState,
        audioError: audio.error?.code,
        audioErrorMessage: audio.error?.message
      })
      
      // Different error messages based on the audio state
      if (audio.networkState === 3) { // NETWORK_NO_SOURCE
        setError('Audio file not accessible')
      } else if (audio.readyState === 0) { // HAVE_NOTHING
        setError('Audio unavailable - may require login')
      } else if (audio.error?.code === 4) { // MEDIA_ERR_SRC_NOT_SUPPORTED
        setError('Audio format not supported')
      } else {
        setError('Audio unavailable')
      }
      setIsLoading(false)
    }

    const handleCanPlay = () => {
      setIsLoading(false)
    }

    // Test audio URL accessibility before setting src
    const testAudioAccess = async () => {
      try {
        const response = await fetch(audioUrl, { 
          method: 'HEAD',
          credentials: 'include' // Include session cookies for authentication
        })
        
        console.log('Audio URL test:', {
          audioUrl,
          status: response.status,
          headers: Object.fromEntries(response.headers.entries())
        })
        
        if (!response.ok) {
          if (response.status === 401) {
            setError('Audio requires login - please refresh the page')
          } else if (response.status === 403) {
            setError('Audio access denied')
          } else if (response.status === 404) {
            setError('Audio file not found')
          } else {
            setError(`Audio unavailable (${response.status})`)
          }
          setIsLoading(false)
          return false
        }
        return true
      } catch (err) {
        console.error('Audio URL test failed:', err)
        setError('Network error - check connection')
        setIsLoading(false)
        return false
      }
    }

    // Test URL access first, then set audio src
    testAudioAccess().then(accessible => {
      if (accessible) {
        audio.src = audioUrl
        
        // On mobile, don't try to load until user interaction
        if (isMobile) {
          setNeedsUserInteraction(true)
          setIsLoading(false)
          console.log('Mobile detected - waiting for user interaction before loading audio')
        }
      }
    })

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
        setNeedsUserInteraction(false)
        
        // On mobile, ensure audio is ready to play after user interaction
        if (isMobile && audio.readyState < 2) {
          console.log('Mobile: Loading audio after user interaction')
          setIsLoading(true)
          try {
            await audio.load()
            // Wait for the audio to be ready
            await new Promise((resolve, reject) => {
              const onCanPlay = () => {
                audio.removeEventListener('canplay', onCanPlay)
                audio.removeEventListener('error', onError)
                resolve(true)
              }
              const onError = () => {
                audio.removeEventListener('canplay', onCanPlay)
                audio.removeEventListener('error', onError)
                reject(new Error('Audio failed to load'))
              }
              audio.addEventListener('canplay', onCanPlay)
              audio.addEventListener('error', onError)
            })
            setIsLoading(false)
          } catch (loadError) {
            setIsLoading(false)
            throw new Error('Audio failed to load on mobile')
          }
        }
        
        await audio.play()
        setIsPlaying(true)
        console.log('Audio playback started successfully', { 
          isMobile, 
          readyState: audio.readyState,
          duration: audio.duration 
        })
      }
    } catch (err: any) {
      console.error('Error playing audio:', {
        audioUrl,
        error: err?.name,
        message: err?.message,
        code: err?.code,
        hasInteracted,
        isMobile,
        readyState: audio.readyState,
        networkState: audio.networkState
      })
      
      // Handle specific mobile browser audio policy errors
      if (err?.name === 'NotAllowedError' || err?.name === 'AbortError') {
        if (isMobile && !hasInteracted) {
          setNeedsUserInteraction(true)
          setError('Tap to enable audio on mobile')
        } else {
          setError('Audio blocked - check browser settings')
        }
      } else if (err?.name === 'NotSupportedError') {
        setError('Audio format not supported on this device')
      } else if (err?.message?.includes('load')) {
        setError('Audio failed to load - check connection')
      } else {
        setError(isMobile ? 'Audio unavailable on mobile' : 'Failed to play audio')
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

  // Show mobile interaction prompt
  if (needsUserInteraction && isMobile) {
    return (
      <div className={cn(
        "flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-md cursor-pointer hover:bg-blue-100",
        className
      )}
      onClick={togglePlayPause}
      data-testid="button-audio-play-pause"
      >
        <Play className="h-4 w-4 text-blue-600" />
        <span className="text-sm text-blue-700">Tap to enable audio</span>
      </div>
    )
  }

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