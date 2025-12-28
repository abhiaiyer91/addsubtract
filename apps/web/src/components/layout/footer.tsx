import { GitBranch } from 'lucide-react';

export function Footer() {
  return (
    <footer className="border-t border-border/40 py-12">
      <div className="container">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded-lg bg-primary/10">
              <GitBranch className="h-4 w-4 text-primary" />
            </div>
            <span className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} wit. All rights reserved.
            </span>
          </div>

          <nav className="flex items-center gap-1">
            <a
              href="https://docs.wit.sh"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/40 rounded-full transition-all duration-200"
            >
              Docs
            </a>
            <a
              href="https://github.com/abhiaiyer91/wit"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/40 rounded-full transition-all duration-200"
            >
              GitHub
            </a>
          </nav>
        </div>
      </div>
    </footer>
  );
}
