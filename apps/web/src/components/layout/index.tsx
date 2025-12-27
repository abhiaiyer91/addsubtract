import { Outlet } from 'react-router-dom';
import { Header } from './header';
import { Footer } from './footer';

export function Layout() {
  return (
    <div className="min-h-screen flex flex-col bg-background font-sans antialiased dark">
      <Header />
      <main className="flex-1 container py-4 md:py-6 lg:py-8 px-4 md:px-6 relative">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

export { Header } from './header';
export { Footer } from './footer';
