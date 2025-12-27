# Task: Real-Time Collaboration Features

## Objective
Add real-time collaboration capabilities including presence indicators, live cursors, and instant updates across the platform.

## Context

### Current State
- No real-time features beyond polling
- Users don't see who else is viewing a PR/issue
- Changes require manual refresh
- No live typing indicators

### Desired State
- See who's viewing the same page (presence)
- Live cursors in collaborative editing (Journal)
- Instant updates when others make changes
- Typing indicators in comments
- Online status for team members

## Technical Requirements

### 1. WebSocket Infrastructure (`src/server/websocket.ts`)

```typescript
import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { verifyToken } from '../lib/auth';

interface Connection {
  ws: WebSocket;
  userId: string;
  username: string;
  avatarUrl?: string;
  currentPage?: string;
  cursor?: { x: number; y: number };
  lastActivity: Date;
}

interface PresenceUpdate {
  type: 'presence';
  page: string;
  users: Array<{
    userId: string;
    username: string;
    avatarUrl?: string;
    cursor?: { x: number; y: number };
  }>;
}

interface ContentUpdate {
  type: 'content_update';
  resource: string; // e.g., 'pr:123', 'issue:456'
  action: string; // 'created', 'updated', 'deleted'
  data: any;
}

class RealtimeServer {
  private wss: WebSocketServer;
  private connections: Map<string, Connection> = new Map();
  private pageSubscriptions: Map<string, Set<string>> = new Map(); // page -> connectionIds

  constructor(server: Server) {
    this.wss = new WebSocketServer({ server, path: '/ws' });
    this.setupHandlers();
    this.startHeartbeat();
  }

  private setupHandlers() {
    this.wss.on('connection', async (ws, req) => {
      const token = new URL(req.url!, 'http://localhost').searchParams.get('token');
      
      try {
        const user = await verifyToken(token!);
        const connectionId = crypto.randomUUID();
        
        this.connections.set(connectionId, {
          ws,
          userId: user.id,
          username: user.username,
          avatarUrl: user.avatarUrl,
          lastActivity: new Date(),
        });

        ws.on('message', (data) => this.handleMessage(connectionId, data.toString()));
        ws.on('close', () => this.handleDisconnect(connectionId));
        ws.on('pong', () => this.handlePong(connectionId));

        // Send connection confirmation
        this.send(connectionId, { type: 'connected', connectionId });
      } catch {
        ws.close(4001, 'Unauthorized');
      }
    });
  }

  private handleMessage(connectionId: string, message: string) {
    const conn = this.connections.get(connectionId);
    if (!conn) return;

    conn.lastActivity = new Date();

    try {
      const data = JSON.parse(message);

      switch (data.type) {
        case 'subscribe':
          this.subscribeTo(connectionId, data.page);
          break;
        
        case 'unsubscribe':
          this.unsubscribeFrom(connectionId, data.page);
          break;
        
        case 'cursor':
          this.updateCursor(connectionId, data.cursor);
          break;
        
        case 'typing':
          this.broadcastTyping(connectionId, data.resource, data.isTyping);
          break;
      }
    } catch (e) {
      console.error('[WS] Invalid message:', e);
    }
  }

  private subscribeTo(connectionId: string, page: string) {
    const conn = this.connections.get(connectionId);
    if (!conn) return;

    // Unsubscribe from previous page
    if (conn.currentPage) {
      this.unsubscribeFrom(connectionId, conn.currentPage);
    }

    // Subscribe to new page
    conn.currentPage = page;
    
    if (!this.pageSubscriptions.has(page)) {
      this.pageSubscriptions.set(page, new Set());
    }
    this.pageSubscriptions.get(page)!.add(connectionId);

    // Broadcast presence update
    this.broadcastPresence(page);
  }

  private unsubscribeFrom(connectionId: string, page: string) {
    const subs = this.pageSubscriptions.get(page);
    if (subs) {
      subs.delete(connectionId);
      if (subs.size === 0) {
        this.pageSubscriptions.delete(page);
      } else {
        this.broadcastPresence(page);
      }
    }
  }

  private updateCursor(connectionId: string, cursor: { x: number; y: number }) {
    const conn = this.connections.get(connectionId);
    if (!conn || !conn.currentPage) return;

    conn.cursor = cursor;
    this.broadcastPresence(conn.currentPage);
  }

  private broadcastPresence(page: string) {
    const subs = this.pageSubscriptions.get(page);
    if (!subs) return;

    const users = Array.from(subs)
      .map(id => this.connections.get(id))
      .filter((c): c is Connection => !!c)
      .map(c => ({
        userId: c.userId,
        username: c.username,
        avatarUrl: c.avatarUrl,
        cursor: c.cursor,
      }));

    const message: PresenceUpdate = { type: 'presence', page, users };
    
    for (const connId of subs) {
      this.send(connId, message);
    }
  }

  private broadcastTyping(connectionId: string, resource: string, isTyping: boolean) {
    const conn = this.connections.get(connectionId);
    if (!conn || !conn.currentPage) return;

    const subs = this.pageSubscriptions.get(conn.currentPage);
    if (!subs) return;

    for (const connId of subs) {
      if (connId !== connectionId) {
        this.send(connId, {
          type: 'typing',
          userId: conn.userId,
          username: conn.username,
          resource,
          isTyping,
        });
      }
    }
  }

  /**
   * Broadcast content update to all users viewing a resource
   */
  broadcastUpdate(resource: string, action: string, data: any) {
    // Find all pages that include this resource
    for (const [page, subs] of this.pageSubscriptions) {
      if (page.includes(resource) || resource.includes(page)) {
        const message: ContentUpdate = { type: 'content_update', resource, action, data };
        for (const connId of subs) {
          this.send(connId, message);
        }
      }
    }
  }

  private handleDisconnect(connectionId: string) {
    const conn = this.connections.get(connectionId);
    if (conn?.currentPage) {
      this.unsubscribeFrom(connectionId, conn.currentPage);
    }
    this.connections.delete(connectionId);
  }

  private handlePong(connectionId: string) {
    const conn = this.connections.get(connectionId);
    if (conn) conn.lastActivity = new Date();
  }

  private send(connectionId: string, data: any) {
    const conn = this.connections.get(connectionId);
    if (conn?.ws.readyState === WebSocket.OPEN) {
      conn.ws.send(JSON.stringify(data));
    }
  }

  private startHeartbeat() {
    setInterval(() => {
      const now = new Date();
      for (const [id, conn] of this.connections) {
        // Disconnect inactive connections
        if (now.getTime() - conn.lastActivity.getTime() > 60000) {
          conn.ws.terminate();
          this.handleDisconnect(id);
        } else {
          conn.ws.ping();
        }
      }
    }, 30000);
  }

  getOnlineUsers(): Array<{ userId: string; username: string }> {
    return Array.from(new Set(
      Array.from(this.connections.values()).map(c => ({ userId: c.userId, username: c.username }))
    ));
  }
}

export let realtimeServer: RealtimeServer;

export function initRealtimeServer(server: Server) {
  realtimeServer = new RealtimeServer(server);
}
```

### 2. React Hook (`apps/web/src/hooks/use-realtime.ts`)

```typescript
import { useEffect, useState, useCallback, useRef } from 'react';
import { useSession } from '@/lib/auth-client';

interface PresenceUser {
  userId: string;
  username: string;
  avatarUrl?: string;
  cursor?: { x: number; y: number };
}

interface UseRealtimeOptions {
  page: string;
  onContentUpdate?: (resource: string, action: string, data: any) => void;
}

export function useRealtime({ page, onContentUpdate }: UseRealtimeOptions) {
  const { data: session } = useSession();
  const [presence, setPresence] = useState<PresenceUser[]>([]);
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(new Map());
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!session?.user) return;

    const ws = new WebSocket(`ws://${window.location.host}/ws?token=${session.token}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      ws.send(JSON.stringify({ type: 'subscribe', page }));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case 'presence':
          setPresence(data.users.filter((u: PresenceUser) => u.userId !== session.user.id));
          break;
        
        case 'typing':
          setTypingUsers(prev => {
            const next = new Map(prev);
            if (data.isTyping) {
              next.set(data.userId, data.username);
            } else {
              next.delete(data.userId);
            }
            return next;
          });
          break;
        
        case 'content_update':
          onContentUpdate?.(data.resource, data.action, data.data);
          break;
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
    };

    return () => {
      ws.close();
    };
  }, [session, page, onContentUpdate]);

  const updateCursor = useCallback((x: number, y: number) => {
    wsRef.current?.send(JSON.stringify({ type: 'cursor', cursor: { x, y } }));
  }, []);

  const setTyping = useCallback((resource: string, isTyping: boolean) => {
    wsRef.current?.send(JSON.stringify({ type: 'typing', resource, isTyping }));
  }, []);

  return {
    presence,
    typingUsers: Array.from(typingUsers.values()),
    isConnected,
    updateCursor,
    setTyping,
  };
}
```

### 3. Presence Avatars Component (`apps/web/src/components/presence/presence-avatars.tsx`)

```tsx
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface PresenceUser {
  userId: string;
  username: string;
  avatarUrl?: string;
}

interface PresenceAvatarsProps {
  users: PresenceUser[];
  max?: number;
  size?: 'sm' | 'md' | 'lg';
}

const SIZES = {
  sm: 'h-6 w-6 text-xs',
  md: 'h-8 w-8 text-sm',
  lg: 'h-10 w-10 text-base',
};

export function PresenceAvatars({ users, max = 5, size = 'md' }: PresenceAvatarsProps) {
  const visible = users.slice(0, max);
  const overflow = users.length - max;

  if (users.length === 0) return null;

  return (
    <div className="flex items-center -space-x-2">
      {visible.map((user, i) => (
        <Tooltip key={user.userId}>
          <TooltipTrigger>
            <Avatar className={cn(
              SIZES[size],
              'border-2 border-background ring-2 ring-green-500',
              'transition-transform hover:scale-110 hover:z-10'
            )} style={{ zIndex: visible.length - i }}>
              <AvatarImage src={user.avatarUrl} />
              <AvatarFallback>{user.username[0].toUpperCase()}</AvatarFallback>
            </Avatar>
          </TooltipTrigger>
          <TooltipContent>
            <p>{user.username} is viewing</p>
          </TooltipContent>
        </Tooltip>
      ))}
      
      {overflow > 0 && (
        <Tooltip>
          <TooltipTrigger>
            <div className={cn(
              SIZES[size],
              'rounded-full bg-muted border-2 border-background',
              'flex items-center justify-center font-medium'
            )}>
              +{overflow}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>{users.slice(max).map(u => u.username).join(', ')}</p>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
```

### 4. Live Cursors Component (`apps/web/src/components/presence/live-cursors.tsx`)

```tsx
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface Cursor {
  userId: string;
  username: string;
  x: number;
  y: number;
  color: string;
}

interface LiveCursorsProps {
  cursors: Array<{
    userId: string;
    username: string;
    cursor?: { x: number; y: number };
  }>;
  containerRef: React.RefObject<HTMLElement>;
}

const COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', 
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
];

export function LiveCursors({ cursors, containerRef }: LiveCursorsProps) {
  const [positions, setPositions] = useState<Cursor[]>([]);

  useEffect(() => {
    const newPositions = cursors
      .filter(c => c.cursor)
      .map((c, i) => ({
        userId: c.userId,
        username: c.username,
        x: c.cursor!.x,
        y: c.cursor!.y,
        color: COLORS[i % COLORS.length],
      }));
    
    setPositions(newPositions);
  }, [cursors]);

  return (
    <>
      {positions.map((cursor) => (
        <div
          key={cursor.userId}
          className="pointer-events-none absolute z-50 transition-all duration-75"
          style={{
            left: cursor.x,
            top: cursor.y,
          }}
        >
          {/* Cursor arrow */}
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            style={{ color: cursor.color }}
          >
            <path
              d="M5.65376 12.4563L4.29282 5.31409C4.04447 4.13317 5.26688 3.18693 6.33797 3.70762L19.1845 10.0951C20.307 10.6408 20.2124 12.2691 19.0336 12.6742L13.9057 14.439C13.5883 14.5483 13.3195 14.7726 13.1508 15.0715L10.6138 19.5629C9.98405 20.6774 8.34603 20.3722 8.14414 19.1073L7.10079 12.7704"
              fill="currentColor"
            />
          </svg>
          
          {/* Username label */}
          <div
            className="absolute left-4 top-4 px-2 py-0.5 rounded text-xs text-white whitespace-nowrap"
            style={{ backgroundColor: cursor.color }}
          >
            {cursor.username}
          </div>
        </div>
      ))}
    </>
  );
}
```

### 5. Typing Indicator (`apps/web/src/components/presence/typing-indicator.tsx`)

```tsx
interface TypingIndicatorProps {
  users: string[];
}

export function TypingIndicator({ users }: TypingIndicatorProps) {
  if (users.length === 0) return null;

  const text = users.length === 1
    ? `${users[0]} is typing...`
    : users.length === 2
    ? `${users[0]} and ${users[1]} are typing...`
    : `${users[0]} and ${users.length - 1} others are typing...`;

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <div className="flex gap-1">
        <span className="animate-bounce" style={{ animationDelay: '0ms' }}>.</span>
        <span className="animate-bounce" style={{ animationDelay: '150ms' }}>.</span>
        <span className="animate-bounce" style={{ animationDelay: '300ms' }}>.</span>
      </div>
      <span>{text}</span>
    </div>
  );
}
```

### 6. Integration Example - PR Page

```tsx
// In pull-request.tsx
import { useRealtime } from '@/hooks/use-realtime';
import { PresenceAvatars } from '@/components/presence/presence-avatars';
import { TypingIndicator } from '@/components/presence/typing-indicator';

function PullRequestPage() {
  const { owner, repo, prNumber } = useParams();
  const utils = trpc.useUtils();

  const { presence, typingUsers, setTyping } = useRealtime({
    page: `pr:${owner}/${repo}/${prNumber}`,
    onContentUpdate: (resource, action) => {
      // Invalidate relevant queries to refresh data
      if (resource.includes('comment')) {
        utils.pulls.getComments.invalidate();
      }
      if (resource.includes('review')) {
        utils.pulls.getReviews.invalidate();
      }
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1>PR #{prNumber}</h1>
        <PresenceAvatars users={presence} />
      </div>
      
      {/* Comments section */}
      <div className="mt-4">
        <CommentForm 
          onFocus={() => setTyping(`pr:${prNumber}:comment`, true)}
          onBlur={() => setTyping(`pr:${prNumber}:comment`, false)}
        />
        <TypingIndicator users={typingUsers} />
      </div>
    </div>
  );
}
```

## Files to Create/Modify
- `src/server/websocket.ts` - New file (WebSocket server)
- `src/server/index.ts` - Initialize WebSocket server
- `apps/web/src/hooks/use-realtime.ts` - New file (React hook)
- `apps/web/src/components/presence/presence-avatars.tsx` - New file
- `apps/web/src/components/presence/live-cursors.tsx` - New file
- `apps/web/src/components/presence/typing-indicator.tsx` - New file
- `apps/web/src/routes/repo/pull-request.tsx` - Add presence
- `apps/web/src/routes/repo/issue.tsx` - Add presence
- `apps/web/src/routes/repo/journal.tsx` - Add cursors

## Testing
1. Open same PR in two browser tabs
2. Verify presence avatars appear
3. Start typing comment, verify indicator
4. Make changes in one tab, verify updates in other
5. Move cursor in Journal, verify live cursor
6. Disconnect one tab, verify presence updates

## Success Criteria
- [ ] WebSocket connection established
- [ ] Presence avatars show viewers
- [ ] Typing indicators work
- [ ] Content updates are instant
- [ ] Live cursors in Journal
- [ ] Graceful reconnection on disconnect
- [ ] No memory leaks on unmount
