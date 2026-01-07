/**
 * Dev Mode Detection Utility
 * 
 * Dev mode can be enabled via:
 * 1. URL parameter: ?dev=true
 * 2. localStorage: localStorage.setItem('devMode', 'true')
 * 3. Running on localhost (automatic)
 * 
 * To disable: localStorage.removeItem('devMode') or remove ?dev=true from URL
 */

export function isDevMode(): boolean {
  // Check for dev mode: URL parameter (?dev=true) or localStorage flag
  const urlParams = new URLSearchParams(window.location.search);
  const devModeParam = urlParams.get('dev') === 'true';
  const devModeStorage = localStorage.getItem('devMode') === 'true';
  
  // Development mode: localhost OR dev mode enabled via URL/storage
  return (
    window.location.hostname === 'localhost' || 
    window.location.hostname === '127.0.0.1' ||
    devModeParam ||
    devModeStorage
  );
}

export function isProduction(): boolean {
  return (
    window.location.hostname.includes('zamataskhub.com') ||
    window.location.hostname.includes('vercel.app')
  );
}



