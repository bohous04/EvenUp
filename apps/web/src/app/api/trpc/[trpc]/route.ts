import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from '@evenup/api';
import { createTrpcContext } from '@/server/trpc';

function handler(req: Request) {
  return fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () => createTrpcContext(req.headers),
  });
}

export { handler as GET, handler as POST };
