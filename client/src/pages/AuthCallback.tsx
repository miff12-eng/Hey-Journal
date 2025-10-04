import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";

export default function AuthCallback() {
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    const handleCallback = async () => {
      // After successful authentication
      if (!isLoading && isAuthenticated) {
        // Check if we're in the in-app browser opened by Capacitor
        const userAgent = navigator.userAgent || navigator.vendor;
        const isInAppBrowser = userAgent.includes('Safari') && !userAgent.includes('CriOS') && !userAgent.includes('FxiOS');
        
        if (isInAppBrowser && window.location.hostname.includes('replit')) {
          // We're in the Capacitor in-app browser after OAuth
          // Close the browser to return to the main app
          try {
            const { Browser } = await import('@capacitor/browser');
            await Browser.close();
            // User is now back in the main Capacitor WebView with session cookies
          } catch (error) {
            console.error('Failed to close browser:', error);
            // Fallback: show success message
            window.location.href = '/';
          }
        } else {
          // Regular web browser or already in main WebView
          window.location.href = '/';
        }
      }
    };

    handleCallback();
  }, [isAuthenticated, isLoading]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-background" data-testid="auth-callback-loading">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-muted-foreground">Completing login...</p>
      </div>
    </div>
  );
}
