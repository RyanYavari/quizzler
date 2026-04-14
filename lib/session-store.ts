import type { Session } from './types';

const TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

// Use globalThis to persist the store across hot reloads in dev mode
const globalForStore = globalThis as unknown as {
  sessionStore: Map<string, Session> | undefined;
};

const store = globalForStore.sessionStore ?? new Map<string, Session>();
if (process.env.NODE_ENV !== 'production') {
  globalForStore.sessionStore = store;
}

export const sessionStore = {
  set(id: string, session: Session): void {
    console.log('[SessionStore] SET:', id, 'Total sessions:', store.size + 1);
    store.set(id, session);
  },

  get(id: string): Session | undefined {
    console.log('[SessionStore] GET:', id, 'Total sessions:', store.size);
    const session = store.get(id);
    if (!session) {
      console.log('[SessionStore] Session not found. Available IDs:', Array.from(store.keys()));
      return undefined;
    }

    if (Date.now() - session.createdAt > TTL_MS) {
      store.delete(id);
      return undefined;
    }

    return session;
  },

  delete(id: string): void {
    store.delete(id);
  },
};

// Periodic cleanup every 10 minutes
setInterval(() => {
  const now = Date.now();
  store.forEach((session, id) => {
    if (now - session.createdAt > TTL_MS) {
      store.delete(id);
    }
  });
}, 10 * 60 * 1000).unref?.();
