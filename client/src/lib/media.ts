/**
 * Media utilities for handling photos and videos in the journal application
 */

/**
 * Determines if a file or URL represents a video
 * @param source - File object or URL string
 * @returns true if the source is a video
 */
export function isVideo(source: File | string): boolean {
  if (typeof source === 'string') {
    // URL-based detection
    return /\.(mp4|webm|mov|avi)$/i.test(source) || source.includes('video/');
  } else {
    // File object detection
    return source.type.startsWith('video/');
  }
}

/**
 * Determines if a file or URL represents an image
 * @param source - File object or URL string  
 * @returns true if the source is an image
 */
export function isImage(source: File | string): boolean {
  if (typeof source === 'string') {
    // URL-based detection
    return /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(source) || source.includes('image/');
  } else {
    // File object detection
    return source.type.startsWith('image/');
  }
}

/**
 * Gets a human-readable file type description
 * @param source - File object or URL string
 * @returns "Video", "Image", or "File"
 */
export function getFileTypeDescription(source: File | string): string {
  if (isVideo(source)) return 'Video';
  if (isImage(source)) return 'Image';
  return 'File';
}

/**
 * Validates if a file type is supported for media uploads
 * @param file - File object to validate
 * @returns true if the file type is supported
 */
export function isSupportedMediaType(file: File): boolean {
  return isImage(file) || isVideo(file);
}

/**
 * Checks if a MIME type matches a pattern (supports wildcards)
 * @param mimeType - The actual MIME type (e.g., "video/mp4")
 * @param pattern - The pattern to match (e.g., "video/*" or "image/jpeg")
 * @returns true if the MIME type matches the pattern
 */
export function matchesMimePattern(mimeType: string, pattern: string): boolean {
  if (pattern === '*/*') return true;
  if (pattern.endsWith('/*')) {
    const baseType = pattern.slice(0, -2);
    return mimeType.startsWith(baseType + '/');
  }
  return mimeType === pattern;
}