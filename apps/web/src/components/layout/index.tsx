import { Outlet } from 'react-router-dom';
import { Header } from './header';
import { Footer } from './footer';

export function Layout() {
  return (
    <div className="min-h-screen flex flex-col bg-background font-sans antialiased">
      <Header />
      <main className="flex-1 container py-8">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

export { Header } from './header';
export { Footer } from './footer';
