import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useShortcutsModalStore } from '@/hooks/useCommandPalette';
import { isMac } from '@/lib/commands';

interface ShortcutItem {
  keys: string[];
  description: string;
}

interface ShortcutSection {
  title: string;
  shortcuts: ShortcutItem[];
}

const shortcutSections: ShortcutSection[] = [
  {
    title: 'Global',
    shortcuts: [
      { keys: ['mod', 'K'], description: 'Command palette' },
      { keys: ['/'], description: 'Focus search' },
      { keys: ['?'], description: 'This help' },
    ],
  },
  {
    title: 'Navigation',
    shortcuts: [
      { keys: ['g', 'h'], description: 'Go home' },
      { keys: ['g', 'n'], description: 'Notifications' },
      { keys: ['g', 's'], description: 'Settings' },
    ],
  },
  {
    title: 'Repository',
    shortcuts: [
      { keys: ['g', 'c'], description: 'Go to code' },
      { keys: ['g', 'i'], description: 'Go to issues' },
      { keys: ['g', 'p'], description: 'Go to pull requests' },
    ],
  },
  {
    title: 'Lists',
    shortcuts: [
      { keys: ['j'], description: 'Next item' },
      { keys: ['k'], description: 'Previous item' },
      { keys: ['o'], description: 'Open selected' },
      { keys: ['c'], description: 'Create new' },
    ],
  },
];

function formatKey(key: string): string {
  const mac = isMac();
  switch (key.toLowerCase()) {
    case 'mod':
      return mac ? '\u2318' : 'Ctrl';
    case 'shift':
      return mac ? '\u21E7' : 'Shift';
    case 'alt':
      return mac ? '\u2325' : 'Alt';
    case 'enter':
      return '\u23CE';
    case 'escape':
      return 'Esc';
    default:
      return key.toUpperCase();
  }
}

function ShortcutKeys({ keys }: { keys: string[] }) {
  return (
    <div className="flex items-center gap-0.5">
      {keys.map((key, i) => (
        <kbd key={i} className="kbd">
          {formatKey(key)}
        </kbd>
      ))}
    </div>
  );
}

export function ShortcutsModal() {
  const { isOpen, close } = useShortcutsModalStore();

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-6 py-4">
          {shortcutSections.map((section) => (
            <div key={section.title}>
              <h3 className="text-sm font-semibold text-foreground mb-3">
                {section.title}
              </h3>
              <div className="space-y-2">
                {section.shortcuts.map((shortcut, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-muted-foreground">
                      {shortcut.description}
                    </span>
                    <ShortcutKeys keys={shortcut.keys} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-border/40 pt-4">
          <p className="text-xs text-muted-foreground text-center">
            Press <kbd className="kbd">?</kbd> anytime to see this help
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
