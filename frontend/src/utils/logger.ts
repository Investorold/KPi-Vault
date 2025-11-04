// Development-only logger
// Prevents sensitive data from appearing in production console

const isDevelopment = import.meta.env.DEV || import.meta.env.MODE === 'development';

class Logger {
  log(...args: any[]) {
    if (isDevelopment) {
      console.log(...args);
    }
  }

  warn(...args: any[]) {
    if (isDevelopment) {
      console.warn(...args);
    }
  }

  error(...args: any[]) {
    // Always log errors, but sanitize in production
    if (isDevelopment) {
      console.error(...args);
    } else {
      // In production, only log error type, not sensitive data
      console.error('An error occurred. Check network tab for details.');
    }
  }

  info(...args: any[]) {
    if (isDevelopment) {
      console.info(...args);
    }
  }

  debug(...args: any[]) {
    if (isDevelopment) {
      console.debug(...args);
    }
  }
}

export const logger = new Logger();

