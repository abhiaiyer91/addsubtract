/**
 * Shortcuts Modal Component
 *
 * Displays all available keyboard shortcuts grouped by category.
 * Reads from the centralized keyboard shortcuts store to show
 * current (possibly customized) bindings.
 */

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Settings } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useShortcutsModalStore } from '@/hooks/useCommandPalette';
import {
  useShortcutStore,
  formatShortcutDisplay,
  SHORTCUT_CATEGORIES,
} from '@/lib/keyboard-shortcuts';

function ShortcutKeys({ keys }: { keys: string }) {
  if (!keys) {
    return <span className="text-xs text-muted-foreground italic">None</span>;
  }

  return (
    <kbd className="px-1.5 py-0.5 text-xs font-mono bg-muted rounded border">
      {formatShortcutDisplay(keys)}
    </kbd>
  );
}

export function ShortcutsModal() {
  const { isOpen, close } = useShortcutsModalStore();
  const { shortcuts, getEffectiveKeys, isShortcutDisabled } = useShortcutStore();

  // Group shortcuts by category, excluding disabled ones
  const groupedShortcuts = useMemo(() => {
    const groups = new Map<string, typeof shortcuts>();

    // Use predefined category order
    for (const category of SHORTCUT_CATEGORIES) {
      const categoryShortcuts = shortcuts.filter(
        (s) => s.category === category && !isShortcutDisabled(s.id)
      );
      if (categoryShortcuts.length > 0) {
        groups.set(category, categoryShortcuts);
      }
    }

    return groups;
  }, [shortcuts, isShortcutDisabled]);

  // Calculate columns for better layout
  const categories = Array.from(groupedShortcuts.entries());
  const midpoint = Math.ceil(categories.length / 2);
  const leftColumn = categories.slice(0, midpoint);
  const rightColumn = categories.slice(midpoint);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center justify-between">
            <span>Keyboard Shortcuts</span>
            <Button
              variant="ghost"
              size="sm"
              asChild
              onClick={() => close()}
            >
              <Link to="/settings/keyboard" className="gap-2">
                <Settings className="h-4 w-4" />
                Customize
              </Link>
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 py-4">
          <div className="grid grid-cols-2 gap-6">
            {/* Left Column */}
            <div className="space-y-6">
              {leftColumn.map(([category, categoryShortcuts]) => (
                <div key={category}>
                  <h3 className="text-sm font-semibold text-foreground mb-3">
                    {category}
                  </h3>
                  <div className="space-y-2">
                    {categoryShortcuts.map((shortcut) => (
                      <div
                        key={shortcut.id}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="text-muted-foreground">
                          {shortcut.description}
                        </span>
                        <ShortcutKeys keys={getEffectiveKeys(shortcut.id)} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Right Column */}
            <div className="space-y-6">
              {rightColumn.map(([category, categoryShortcuts]) => (
                <div key={category}>
                  <h3 className="text-sm font-semibold text-foreground mb-3">
                    {category}
                  </h3>
                  <div className="space-y-2">
                    {categoryShortcuts.map((shortcut) => (
                      <div
                        key={shortcut.id}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="text-muted-foreground">
                          {shortcut.description}
                        </span>
                        <ShortcutKeys keys={getEffectiveKeys(shortcut.id)} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-border/40 pt-4 flex-shrink-0">
          <p className="text-xs text-muted-foreground text-center">
            Press{' '}
            <kbd className="px-1.5 py-0.5 text-xs font-mono bg-muted rounded border">
              ?
            </kbd>{' '}
            anytime to see this help ·{' '}
            <Link
              to="/settings/keyboard"
              className="text-primary hover:underline"
              onClick={() => close()}
            >
              Customize shortcuts
            </Link>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
