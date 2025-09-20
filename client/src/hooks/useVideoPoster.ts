import { useEffect, useState } from 'react'

export function useVideoPoster(videoUrl: string, isVideo: boolean) {
  const [posterUrl, setPosterUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!isVideo || !videoUrl) {
      setPosterUrl(null)
      return
    }

    const generatePoster = async () => {
      try {
        // Create a temporary video element
        const video = document.createElement('video')
        video.crossOrigin = 'anonymous'
        video.muted = true
        video.preload = 'metadata'
        
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        
        if (!ctx) return

        // Wait for video metadata to load
        await new Promise((resolve, reject) => {
          video.onloadedmetadata = resolve
          video.onerror = reject
          video.src = videoUrl
        })

        // Set canvas dimensions to match video
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight

        // Seek to first frame and capture
        video.currentTime = 0.1 // Slightly after start to avoid black frames
        
        await new Promise((resolve) => {
          video.onseeked = resolve
        })

        // Draw the frame to canvas
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        
        // Convert to data URL
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8)
        setPosterUrl(dataUrl)

        // Clean up
        video.remove()
      } catch (error) {
        console.debug('Failed to generate video poster:', error)
        setPosterUrl(null)
      }
    }

    generatePoster()
  }, [videoUrl, isVideo])

  return posterUrl
}