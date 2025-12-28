import type { Plugin } from 'vite';

export function coopCoepHeaders(): Plugin {
  return {
    name: 'coop-coep-headers',
    configureServer(server) {
      // Insert middleware at the beginning of the stack
      const originalStack = server.middlewares.stack;
      server.middlewares.stack = [
        {
          route: '',
          handle: (req, res, next) => {
            // Set headers on every request
            res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
            res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
            next();
          }
        },
        ...originalStack
      ];
    },
  };
}



