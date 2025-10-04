import { GenericOAuth2 } from '@capacitor-community/generic-oauth2';
import { SecureStoragePlugin } from 'capacitor-secure-storage-plugin';

const ISSUER_URL = 'https://replit.com/oidc';

export interface OAuthTokens {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
  token_type?: string;
}

// Secure token storage
export const tokenStorage = {
  async setTokens(tokens: OAuthTokens) {
    await SecureStoragePlugin.set({
      key: 'auth_tokens',
      value: JSON.stringify(tokens)
    });
  },

  async getTokens(): Promise<OAuthTokens | null> {
    try {
      const result = await SecureStoragePlugin.get({ key: 'auth_tokens' });
      return result.value ? JSON.parse(result.value) : null;
    } catch {
      return null;
    }
  },

  async clearTokens() {
    try {
      await SecureStoragePlugin.remove({ key: 'auth_tokens' });
    } catch {
      // Ignore errors if key doesn't exist
    }
  }
};

// OAuth configuration for Capacitor mobile apps
export async function performMobileOAuth(): Promise<OAuthTokens> {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '';
  
  const oauth2Options = {
    appId: import.meta.env.VITE_REPL_ID || '',
    authorizationBaseUrl: `${ISSUER_URL}/authorize`,
    accessTokenEndpoint: `${ISSUER_URL}/token`,
    scope: 'openid email profile offline_access',
    responseType: 'code',
    pkceEnabled: true,
    logsEnabled: true,
    
    web: {
      redirectUrl: `${apiBaseUrl}/auth/callback`,
      windowOptions: 'height=600,left=0,top=0'
    },
    
    ios: {
      redirectUrl: 'com.voicejournal.app:/oauth2callback',
      pkceEnabled: true
    },
    
    android: {
      redirectUrl: 'com.voicejournal.app:/oauth2callback',
    }
  };

  const response = await GenericOAuth2.authenticate(oauth2Options);
  
  const tokens: OAuthTokens = {
    access_token: response.access_token || '',
    refresh_token: response.refresh_token,
    id_token: response.id_token,
    expires_in: response.expires_in,
    token_type: response.token_type
  };

  // Store tokens securely
  await tokenStorage.setTokens(tokens);
  
  return tokens;
}

// Check if user is authenticated
export async function isAuthenticated(): Promise<boolean> {
  const tokens = await tokenStorage.getTokens();
  return tokens !== null && !!tokens.access_token;
}

// Get access token for API requests
export async function getAccessToken(): Promise<string | null> {
  const tokens = await tokenStorage.getTokens();
  return tokens?.access_token || null;
}

// Logout - clear tokens
export async function logout() {
  await tokenStorage.clearTokens();
}
