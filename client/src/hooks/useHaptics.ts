import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'

const isNative = typeof window !== 'undefined' && (
  window.location.protocol === 'capacitor:' || 
  window.location.protocol === 'ionic:'
)

export function useHaptics() {
  const impact = async (style: 'light' | 'medium' | 'heavy' = 'medium') => {
    if (!isNative) return
    
    try {
      const styleMap = {
        light: ImpactStyle.Light,
        medium: ImpactStyle.Medium,
        heavy: ImpactStyle.Heavy
      }
      await Haptics.impact({ style: styleMap[style] })
    } catch (error) {
      console.log('Haptics not available:', error)
    }
  }

  const notification = async (type: 'success' | 'warning' | 'error' = 'success') => {
    if (!isNative) return
    
    try {
      const typeMap = {
        success: NotificationType.Success,
        warning: NotificationType.Warning,
        error: NotificationType.Error
      }
      await Haptics.notification({ type: typeMap[type] })
    } catch (error) {
      console.log('Haptics not available:', error)
    }
  }

  const selection = async () => {
    if (!isNative) return
    
    try {
      await Haptics.selectionStart()
      setTimeout(() => Haptics.selectionEnd(), 50)
    } catch (error) {
      console.log('Haptics not available:', error)
    }
  }

  return {
    impact,
    notification,
    selection
  }
}
