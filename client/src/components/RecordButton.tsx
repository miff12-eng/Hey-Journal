import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Mic, MicOff, Square } from 'lucide-react'
import { cn } from '@/lib/utils'

interface RecordButtonProps {
  onRecordingStart?: () => void
  onRecordingStop?: (audioBlob: Blob) => void
  onTranscriptionUpdate?: (text: string) => void
  className?: string
  disabled?: boolean
}

export default function RecordButton({
  onRecordingStart,
  onRecordingStop,
  onTranscriptionUpdate,
  className,
  disabled = false
}: RecordButtonProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [amplitude, setAmplitude] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animationRef = useRef<number>(null)

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      
      // Set up audio analysis for visualization
      const audioContext = new AudioContext()
      const source = audioContext.createMediaStreamSource(stream)
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      analyserRef.current = analyser

      // Start amplitude monitoring
      const dataArray = new Uint8Array(analyser.frequencyBinCount)
      const updateAmplitude = () => {
        if (analyserRef.current && isRecording) {
          analyserRef.current.getByteFrequencyData(dataArray)
          const average = dataArray.reduce((a, b) => a + b) / dataArray.length
          setAmplitude(average / 255)
          animationRef.current = requestAnimationFrame(updateAmplitude)
        }
      }

      mediaRecorderRef.current = new MediaRecorder(stream)
      audioChunksRef.current = []

      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data)
      }

      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' })
        onRecordingStop?.(audioBlob)
        stream.getTracks().forEach(track => track.stop())
      }

      mediaRecorderRef.current.start()
      setIsRecording(true)
      onRecordingStart?.()
      updateAmplitude()
    } catch (error) {
      console.error('Error starting recording:', error)
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      setAmplitude(0)
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }

  const handleClick = () => {
    if (disabled) return
    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }

  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [])

  const buttonSize = isRecording ? 'h-20 w-20' : 'h-16 w-16'
  const pulseScale = 1 + (amplitude * 0.3)

  return (
    <div className="relative flex items-center justify-center">
      {/* Pulse animation background */}
      {isRecording && (
        <div 
          className="absolute rounded-full bg-accent/30 animate-pulse"
          style={{
            width: '120px',
            height: '120px',
            transform: `scale(${pulseScale})`
          }}
        />
      )}
      
      {/* Main record button */}
      <Button
        onClick={handleClick}
        disabled={disabled || isProcessing}
        className={cn(
          buttonSize,
          'rounded-full transition-all duration-200 relative z-10',
          isRecording 
            ? 'bg-destructive hover:bg-destructive text-destructive-foreground border-destructive-border' 
            : 'bg-accent hover:bg-accent text-accent-foreground border-accent-border',
          className
        )}
        data-testid={isRecording ? "button-stop-recording" : "button-start-recording"}
      >
        {isProcessing ? (
          <div className="animate-spin h-6 w-6 border-2 border-current border-t-transparent rounded-full" />
        ) : isRecording ? (
          <Square className="h-6 w-6" fill="currentColor" />
        ) : (
          <Mic className="h-6 w-6" />
        )}
      </Button>

      {/* Recording indicator */}
      {isRecording && (
        <div className="absolute -top-2 -right-2 h-4 w-4 bg-destructive rounded-full animate-pulse border-2 border-background" />
      )}
    </div>
  )
}