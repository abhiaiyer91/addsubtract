/**
 * Virtual Scrolling for Large Lists
 * Efficiently renders only visible items for optimal performance
 */

/**
 * Virtual scroll options
 */
export interface VirtualScrollOptions<T> {
  container: HTMLElement;
  items: T[];
  itemHeight: number;
  renderItem: (item: T, index: number) => string;
  bufferSize?: number;
  onItemClick?: (item: T, index: number) => void;
  className?: string;
}

/**
 * Virtual scroll state
 */
interface VirtualScrollState {
  scrollTop: number;
  startIndex: number;
  endIndex: number;
  visibleCount: number;
}

/**
 * Virtual scroll controller
 */
export class VirtualScroller<T> {
  private options: Required<VirtualScrollOptions<T>>;
  private state: VirtualScrollState;
  private viewport: HTMLElement | null = null;
  private content: HTMLElement | null = null;
  private spacerTop: HTMLElement | null = null;
  private spacerBottom: HTMLElement | null = null;
  private itemsContainer: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private scrollHandler: (() => void) | null = null;

  constructor(options: VirtualScrollOptions<T>) {
    this.options = {
      bufferSize: 5,
      className: 'virtual-scroll',
      onItemClick: () => {},
      ...options,
    };

    this.state = {
      scrollTop: 0,
      startIndex: 0,
      endIndex: 0,
      visibleCount: 0,
    };

    this.init();
  }

  /**
   * Initialize the virtual scroller
   */
  private init(): void {
    this.createDOM();
    this.setupEventListeners();
    this.updateState();
    this.render();
  }

  /**
   * Create DOM structure
   */
  private createDOM(): void {
    const { container, className, items, itemHeight } = this.options;
    const totalHeight = items.length * itemHeight;

    container.innerHTML = `
      <div class="${className}-viewport" style="height: 100%; overflow-y: auto; position: relative;">
        <div class="${className}-content" style="height: ${totalHeight}px; position: relative;">
          <div class="${className}-spacer-top" style="height: 0;"></div>
          <div class="${className}-items"></div>
          <div class="${className}-spacer-bottom" style="height: 0;"></div>
        </div>
      </div>
    `;

    this.viewport = container.querySelector(`.${className}-viewport`);
    this.content = container.querySelector(`.${className}-content`);
    this.spacerTop = container.querySelector(`.${className}-spacer-top`);
    this.spacerBottom = container.querySelector(`.${className}-spacer-bottom`);
    this.itemsContainer = container.querySelector(`.${className}-items`);
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    if (!this.viewport) return;

    // Scroll handler
    this.scrollHandler = () => this.onScroll();
    this.viewport.addEventListener('scroll', this.scrollHandler, { passive: true });

    // Resize observer
    this.resizeObserver = new ResizeObserver(() => {
      this.updateState();
      this.render();
    });
    this.resizeObserver.observe(this.viewport);

    // Click handler for items
    if (this.itemsContainer) {
      this.itemsContainer.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const itemEl = target.closest('[data-index]') as HTMLElement;
        if (itemEl) {
          const index = parseInt(itemEl.dataset.index || '0', 10);
          const item = this.options.items[index];
          if (item) {
            this.options.onItemClick?.(item, index);
          }
        }
      });
    }
  }

  /**
   * Handle scroll event
   */
  private onScroll(): void {
    if (!this.viewport) return;

    const scrollTop = this.viewport.scrollTop;
    
    // Only re-render if scrolled significantly
    if (Math.abs(scrollTop - this.state.scrollTop) > this.options.itemHeight / 2) {
      this.state.scrollTop = scrollTop;
      this.updateState();
      this.render();
    }
  }

  /**
   * Update state based on current scroll position
   */
  private updateState(): void {
    if (!this.viewport) return;

    const { items, itemHeight, bufferSize } = this.options;
    const viewportHeight = this.viewport.clientHeight;
    const scrollTop = this.viewport.scrollTop;

    const visibleCount = Math.ceil(viewportHeight / itemHeight);
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - bufferSize);
    const endIndex = Math.min(items.length, startIndex + visibleCount + bufferSize * 2);

    this.state = {
      scrollTop,
      startIndex,
      endIndex,
      visibleCount,
    };
  }

  /**
   * Render visible items
   */
  private render(): void {
    if (!this.itemsContainer || !this.spacerTop || !this.spacerBottom) return;

    const { items, itemHeight, renderItem } = this.options;
    const { startIndex, endIndex } = this.state;

    // Update spacers
    this.spacerTop.style.height = `${startIndex * itemHeight}px`;
    this.spacerBottom.style.height = `${(items.length - endIndex) * itemHeight}px`;

    // Position items container
    this.itemsContainer.style.transform = `translateY(${startIndex * itemHeight}px)`;

    // Render visible items
    let html = '';
    for (let i = startIndex; i < endIndex; i++) {
      const item = items[i];
      html += `<div class="virtual-scroll-item" data-index="${i}" style="height: ${itemHeight}px;">
        ${renderItem(item, i)}
      </div>`;
    }
    this.itemsContainer.innerHTML = html;
  }

  /**
   * Update items list
   */
  updateItems(items: T[]): void {
    this.options.items = items;
    
    // Update total height
    if (this.content) {
      this.content.style.height = `${items.length * this.options.itemHeight}px`;
    }

    this.updateState();
    this.render();
  }

  /**
   * Scroll to a specific index
   */
  scrollToIndex(index: number, behavior: ScrollBehavior = 'smooth'): void {
    if (!this.viewport) return;

    const { itemHeight } = this.options;
    const targetTop = index * itemHeight;

    this.viewport.scrollTo({
      top: targetTop,
      behavior,
    });
  }

  /**
   * Scroll to top
   */
  scrollToTop(behavior: ScrollBehavior = 'smooth'): void {
    this.scrollToIndex(0, behavior);
  }

  /**
   * Scroll to bottom
   */
  scrollToBottom(behavior: ScrollBehavior = 'smooth'): void {
    this.scrollToIndex(this.options.items.length - 1, behavior);
  }

  /**
   * Get current scroll position
   */
  getScrollPosition(): number {
    return this.state.scrollTop;
  }

  /**
   * Get visible range
   */
  getVisibleRange(): { start: number; end: number } {
    return {
      start: this.state.startIndex,
      end: this.state.endIndex,
    };
  }

  /**
   * Refresh the view
   */
  refresh(): void {
    this.updateState();
    this.render();
  }

  /**
   * Destroy the virtual scroller
   */
  destroy(): void {
    if (this.viewport && this.scrollHandler) {
      this.viewport.removeEventListener('scroll', this.scrollHandler);
    }

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }

    this.options.container.innerHTML = '';
  }
}

/**
 * Get virtual scroll CSS
 */
export function getVirtualScrollStyles(): string {
  return `
    .virtual-scroll-viewport {
      height: 100%;
      overflow-y: auto;
      overflow-x: hidden;
    }

    .virtual-scroll-content {
      position: relative;
      width: 100%;
    }

    .virtual-scroll-items {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
    }

    .virtual-scroll-item {
      box-sizing: border-box;
      overflow: hidden;
    }

    /* Performance optimizations */
    .virtual-scroll-viewport {
      will-change: scroll-position;
      -webkit-overflow-scrolling: touch;
    }

    .virtual-scroll-items {
      will-change: transform;
    }

    .virtual-scroll-item {
      contain: layout style;
    }
  `;
}

/**
 * Create a simple virtual list for commits
 */
export function createCommitList(
  container: HTMLElement,
  commits: Array<{
    hash: string;
    shortHash: string;
    message: string;
    author: string;
    date: Date;
  }>,
  onSelect?: (commit: typeof commits[0]) => void
): VirtualScroller<typeof commits[0]> {
  return new VirtualScroller({
    container,
    items: commits,
    itemHeight: 60,
    bufferSize: 10,
    onItemClick: onSelect,
    renderItem: (commit) => `
      <div class="commit-list-item">
        <span class="commit-hash">${commit.shortHash}</span>
        <span class="commit-message">${escapeHtml(commit.message.split('\n')[0])}</span>
        <div class="commit-meta">
          <span class="commit-author">${escapeHtml(commit.author)}</span>
          <span class="commit-date">${formatRelativeDate(commit.date)}</span>
        </div>
      </div>
    `,
  });
}

/**
 * Create a virtual file list
 */
export function createFileList(
  container: HTMLElement,
  files: Array<{
    path: string;
    status: 'staged' | 'modified' | 'untracked' | 'deleted';
  }>,
  onSelect?: (file: typeof files[0]) => void
): VirtualScroller<typeof files[0]> {
  const statusIcons: Record<string, string> = {
    staged: '✓',
    modified: '~',
    untracked: '?',
    deleted: '✗',
  };

  return new VirtualScroller({
    container,
    items: files,
    itemHeight: 36,
    bufferSize: 10,
    onItemClick: onSelect,
    renderItem: (file) => `
      <div class="file-list-item ${file.status}">
        <span class="file-status">${statusIcons[file.status]}</span>
        <span class="file-path">${escapeHtml(file.path)}</span>
      </div>
    `,
  });
}

/**
 * Escape HTML
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Format relative date
 */
function formatRelativeDate(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

/**
 * CSS for commit and file lists
 */
export function getListStyles(): string {
  return `
    .commit-list-item {
      display: flex;
      flex-direction: column;
      padding: var(--spacing-sm) var(--spacing-md);
      cursor: pointer;
      transition: background var(--transition-fast);
      border-bottom: 1px solid var(--border-default);
    }

    .commit-list-item:hover {
      background: var(--bg-tertiary);
    }

    .commit-hash {
      font-family: var(--font-family-mono);
      font-size: var(--font-size-xs);
      color: var(--accent-primary);
    }

    .commit-message {
      font-size: var(--font-size-sm);
      color: var(--text-primary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .commit-meta {
      display: flex;
      gap: var(--spacing-sm);
      font-size: var(--font-size-xs);
      color: var(--text-muted);
    }

    .file-list-item {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      padding: var(--spacing-xs) var(--spacing-md);
      cursor: pointer;
      transition: background var(--transition-fast);
      border-bottom: 1px solid var(--border-default);
    }

    .file-list-item:hover {
      background: var(--bg-tertiary);
    }

    .file-status {
      width: 20px;
      text-align: center;
      font-weight: 600;
    }

    .file-list-item.staged .file-status { color: var(--git-added); }
    .file-list-item.modified .file-status { color: var(--git-modified); }
    .file-list-item.untracked .file-status { color: var(--git-untracked); }
    .file-list-item.deleted .file-status { color: var(--git-deleted); }

    .file-path {
      flex: 1;
      font-size: var(--font-size-sm);
      color: var(--text-primary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `;
}
