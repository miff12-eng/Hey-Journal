import { RequestHandler } from "express";
import * as client from "openid-client";
import { createRemoteJWKSet, jwtVerify } from "jose";
import memoize from "memoizee";

const ISSUER_URL = process.env.ISSUER_URL || "https://replit.com/oidc";

const getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL(ISSUER_URL),
      process.env.REPL_ID!
    );
  },
  { maxAge: 3600 * 1000 }
);

// Create JWKS fetcher for token validation
const getJWKS = memoize(
  () => {
    return createRemoteJWKSet(new URL(`${ISSUER_URL}/jwks`));
  },
  { maxAge: 3600 * 1000 }
);

// Middleware to authenticate requests with Bearer tokens (ID tokens)
export const authenticateToken: RequestHandler = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: "Unauthorized - No token provided" });
  }

  const idToken = authHeader.substring(7); // Remove 'Bearer ' prefix

  try {
    const JWKS = getJWKS();
    
    // Validate and decode the ID token (JWT)
    const { payload } = await jwtVerify(idToken, JWKS, {
      issuer: ISSUER_URL,
      audience: process.env.REPL_ID,
      clockTolerance: 60,
    });

    // Attach claims to request as user
    req.user = {
      claims: payload,
      sub: payload.sub,
      email: payload.email,
      first_name: payload.first_name,
      last_name: payload.last_name,
      profile_image_url: payload.profile_image_url,
    } as any;
    
    next();
  } catch (error) {
    console.error('Token validation error:', error);
    res.status(401).json({ message: "Unauthorized - Invalid token" });
  }
};

// Combined middleware that accepts both session and token auth
export const authenticateEither: RequestHandler = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  // Try token auth first
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const idToken = authHeader.substring(7);
    
    try {
      const JWKS = getJWKS();
      const { payload } = await jwtVerify(idToken, JWKS, {
        issuer: ISSUER_URL,
        audience: process.env.REPL_ID,
        clockTolerance: 60,
      });
      
      req.user = {
        claims: payload,
        sub: payload.sub,
        email: payload.email,
        first_name: payload.first_name,
        last_name: payload.last_name,
        profile_image_url: payload.profile_image_url,
      } as any;
      
      return next();
    } catch (error) {
      console.error('Token validation error:', error);
    }
  }
  
  // Fall back to session auth (existing session-based auth)
  const user = req.user as any;
  if (!user?.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now <= user.expires_at) {
    return next();
  }

  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    
    user.claims = tokenResponse.claims();
    user.access_token = tokenResponse.access_token;
    user.refresh_token = tokenResponse.refresh_token;
    user.expires_at = user.claims?.exp;
    
    req.login(user, (err) => {
      if (err) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      return next();
    });
  } catch (error) {
    res.status(401).json({ message: "Unauthorized" });
  }
};
