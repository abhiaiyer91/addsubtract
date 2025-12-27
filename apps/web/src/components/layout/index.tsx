import { Outlet } from 'react-router-dom';
import { Header } from './header';
import { Footer } from './footer';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

export function Layout() {
  // Initialize global keyboard shortcuts
  useKeyboardShortcuts();

  return (
    <div className="min-h-screen flex flex-col bg-background font-sans antialiased dark">
      <Header />
      <main className="flex-1 container py-8 relative">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

export { Header } from './header';
export { Footer } from './footer';
