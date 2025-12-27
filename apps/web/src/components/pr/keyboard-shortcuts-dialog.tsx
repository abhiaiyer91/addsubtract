import { useState, useEffect } from 'react';
import { Keyboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ShortcutGroup {
  title: string;
  shortcuts: Array<{
    keys: string[];
    description: string;
  }>;
}

const shortcutGroups: ShortcutGroup[] = [
  {
    title: 'Navigation',
    shortcuts: [
      { keys: ['j', '↓'], description: 'Next file / item' },
      { keys: ['k', '↑'], description: 'Previous file / item' },
      { keys: ['x'], description: 'Toggle file expand/collapse' },
      { keys: ['v'], description: 'Mark file as viewed' },
    ],
  },
  {
    title: 'Review Actions',
    shortcuts: [
      { keys: ['r'], description: 'Open review dialog' },
      { keys: ['c'], description: 'Focus comment input' },
      { keys: ['Shift', 'A'], description: 'Approve PR' },
      { keys: ['Shift', 'D'], description: 'Request changes' },
    ],
  },
  {
    title: 'Editor',
    shortcuts: [
      { keys: ['⌘', 'B'], description: 'Bold text' },
      { keys: ['⌘', 'I'], description: 'Italic text' },
      { keys: ['⌘', 'K'], description: 'Insert link' },
      { keys: ['Tab'], description: 'Indent' },
    ],
  },
  {
    title: 'General',
    shortcuts: [
      { keys: ['?'], description: 'Show this help' },
      { keys: ['Esc'], description: 'Close dialog / Cancel' },
    ],
  },
];

export function KeyboardShortcutsDialog() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleHelp = () => setIsOpen(true);
    document.addEventListener('shortcut:help', handleHelp);
    return () => document.removeEventListener('shortcut:help', handleHelp);
  }, []);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5" />
            Keyboard Shortcuts
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 max-h-[60vh] overflow-y-auto py-2">
          {shortcutGroups.map((group) => (
            <div key={group.title}>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">
                {group.title}
              </h3>
              <div className="space-y-1">
                {group.shortcuts.map((shortcut, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between py-1.5"
                  >
                    <span className="text-sm">{shortcut.description}</span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, keyIdx) => (
                        <span key={keyIdx} className="flex items-center">
                          {keyIdx > 0 && (
                            <span className="text-muted-foreground mx-0.5">+</span>
                          )}
                          <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono min-w-[24px] text-center">
                            {key}
                          </kbd>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="text-xs text-muted-foreground text-center pt-2 border-t">
          Press <kbd className="px-1.5 py-0.5 bg-muted rounded">?</kbd> anytime to show this dialog
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Small button to trigger the dialog
export function KeyboardShortcutsButton() {
  const handleClick = () => {
    document.dispatchEvent(new CustomEvent('shortcut:help'));
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      className="gap-1.5 text-muted-foreground"
      onClick={handleClick}
    >
      <Keyboard className="h-4 w-4" />
      <span className="hidden sm:inline">Shortcuts</span>
      <kbd className="hidden sm:inline px-1.5 py-0.5 bg-muted rounded text-[10px]">?</kbd>
    </Button>
  );
}
