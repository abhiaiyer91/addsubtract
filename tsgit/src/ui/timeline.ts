/**
 * Timeline & Activity Visualization for tsgit
 * Beautiful activity timeline with contribution graphs
 */

import { Repository } from '../core/repository';
import { Commit } from '../core/object';

/**
 * Activity data point
 */
export interface ActivityData {
  date: string; // YYYY-MM-DD
  commits: number;
  additions: number;
  deletions: number;
}

/**
 * Author statistics
 */
export interface AuthorStats {
  name: string;
  email: string;
  commits: number;
  additions: number;
  deletions: number;
  firstCommit: Date;
  lastCommit: Date;
}

/**
 * Repository statistics
 */
export interface RepoStats {
  totalCommits: number;
  totalAuthors: number;
  totalFiles: number;
  totalLines: number;
  firstCommit: Date | null;
  lastCommit: Date | null;
  authors: AuthorStats[];
  activityByDay: ActivityData[];
  activityByHour: number[];
  activityByDayOfWeek: number[];
  topFiles: { path: string; changes: number }[];
  commitsByMonth: { month: string; count: number }[];
}

/**
 * Calculate repository statistics
 */
export function calculateStats(repo: Repository, maxCommits: number = 500): RepoStats {
  const stats: RepoStats = {
    totalCommits: 0,
    totalAuthors: 0,
    totalFiles: 0,
    totalLines: 0,
    firstCommit: null,
    lastCommit: null,
    authors: [],
    activityByDay: [],
    activityByHour: new Array(24).fill(0),
    activityByDayOfWeek: new Array(7).fill(0),
    topFiles: [],
    commitsByMonth: [],
  };

  const authorMap = new Map<string, AuthorStats>();
  const activityMap = new Map<string, ActivityData>();
  const fileChanges = new Map<string, number>();
  const monthlyCommits = new Map<string, number>();

  try {
    const commits = repo.log('HEAD', maxCommits);
    stats.totalCommits = commits.length;

    for (const commit of commits) {
      const date = new Date(commit.author.timestamp * 1000);
      const dateStr = date.toISOString().split('T')[0];
      const monthStr = date.toISOString().slice(0, 7);
      const hour = date.getHours();
      const dayOfWeek = date.getDay();

      // Update first/last commit
      if (!stats.firstCommit || date < stats.firstCommit) {
        stats.firstCommit = date;
      }
      if (!stats.lastCommit || date > stats.lastCommit) {
        stats.lastCommit = date;
      }

      // Author stats
      const authorKey = commit.author.email;
      if (!authorMap.has(authorKey)) {
        authorMap.set(authorKey, {
          name: commit.author.name,
          email: commit.author.email,
          commits: 0,
          additions: 0,
          deletions: 0,
          firstCommit: date,
          lastCommit: date,
        });
      }
      const author = authorMap.get(authorKey)!;
      author.commits++;
      if (date < author.firstCommit) author.firstCommit = date;
      if (date > author.lastCommit) author.lastCommit = date;

      // Activity by day
      if (!activityMap.has(dateStr)) {
        activityMap.set(dateStr, { date: dateStr, commits: 0, additions: 0, deletions: 0 });
      }
      activityMap.get(dateStr)!.commits++;

      // Activity by hour
      stats.activityByHour[hour]++;

      // Activity by day of week
      stats.activityByDayOfWeek[dayOfWeek]++;

      // Monthly commits
      monthlyCommits.set(monthStr, (monthlyCommits.get(monthStr) || 0) + 1);
    }

    // Convert maps to arrays
    stats.authors = Array.from(authorMap.values())
      .sort((a, b) => b.commits - a.commits);
    stats.totalAuthors = stats.authors.length;

    stats.activityByDay = Array.from(activityMap.values())
      .sort((a, b) => a.date.localeCompare(b.date));

    stats.commitsByMonth = Array.from(monthlyCommits.entries())
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => a.month.localeCompare(b.month));

    // Get file count from HEAD tree
    stats.totalFiles = countFiles(repo);

  } catch {
    // Return empty stats on error
  }

  return stats;
}

/**
 * Count files in repository
 */
function countFiles(repo: Repository): number {
  try {
    const headHash = repo.refs.resolve('HEAD');
    if (!headHash) return 0;

    const commit = repo.objects.readCommit(headHash);
    return countFilesInTree(repo, commit.treeHash);
  } catch {
    return 0;
  }
}

/**
 * Count files in a tree recursively
 */
function countFilesInTree(repo: Repository, treeHash: string): number {
  try {
    const tree = repo.objects.readTree(treeHash);
    let count = 0;

    for (const entry of tree.entries) {
      if (entry.mode === '40000') {
        count += countFilesInTree(repo, entry.hash);
      } else {
        count++;
      }
    }

    return count;
  } catch {
    return 0;
  }
}

/**
 * Generate contribution heatmap data
 */
export function generateHeatmapData(activityByDay: ActivityData[], weeks: number = 52): {
  weeks: { days: { date: string; level: number; commits: number }[] }[];
  maxCommits: number;
} {
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - (weeks * 7));

  // Create activity lookup
  const activityLookup = new Map(activityByDay.map(a => [a.date, a.commits]));
  const maxCommits = Math.max(1, ...activityByDay.map(a => a.commits));

  // Generate weeks array
  const weeksData: { days: { date: string; level: number; commits: number }[] }[] = [];
  const currentDate = new Date(startDate);

  // Align to Sunday
  currentDate.setDate(currentDate.getDate() - currentDate.getDay());

  for (let w = 0; w < weeks; w++) {
    const week: { date: string; level: number; commits: number }[] = [];

    for (let d = 0; d < 7; d++) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const commits = activityLookup.get(dateStr) || 0;
      const level = commits === 0 ? 0 : Math.ceil((commits / maxCommits) * 4);

      week.push({ date: dateStr, level: Math.min(level, 4), commits });
      currentDate.setDate(currentDate.getDate() + 1);
    }

    weeksData.push({ days: week });
  }

  return { weeks: weeksData, maxCommits };
}

/**
 * Render contribution heatmap HTML
 */
export function renderHeatmapHTML(activityByDay: ActivityData[]): string {
  const { weeks, maxCommits } = generateHeatmapData(activityByDay);

  const dayLabels = ['Sun', '', 'Tue', '', 'Thu', '', 'Sat'];
  const monthLabels = generateMonthLabels(weeks);

  return `
    <div class="heatmap-container">
      <div class="heatmap-months">
        ${monthLabels.map(m => `<span style="left: ${m.position}px">${m.label}</span>`).join('')}
      </div>
      <div class="heatmap-content">
        <div class="heatmap-days">
          ${dayLabels.map(d => `<span>${d}</span>`).join('')}
        </div>
        <div class="heatmap-grid">
          ${weeks.map(week => `
            <div class="heatmap-week">
              ${week.days.map(day => `
                <div 
                  class="heatmap-day level-${day.level}" 
                  data-date="${day.date}"
                  data-commits="${day.commits}"
                  title="${day.date}: ${day.commits} commits"
                ></div>
              `).join('')}
            </div>
          `).join('')}
        </div>
      </div>
      <div class="heatmap-legend">
        <span>Less</span>
        <div class="heatmap-day level-0"></div>
        <div class="heatmap-day level-1"></div>
        <div class="heatmap-day level-2"></div>
        <div class="heatmap-day level-3"></div>
        <div class="heatmap-day level-4"></div>
        <span>More</span>
      </div>
    </div>
  `;
}

/**
 * Generate month labels for heatmap
 */
function generateMonthLabels(weeks: { days: { date: string }[] }[]): { label: string; position: number }[] {
  const labels: { label: string; position: number }[] = [];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  let lastMonth = -1;

  for (let i = 0; i < weeks.length; i++) {
    const firstDay = weeks[i].days[0];
    const date = new Date(firstDay.date);
    const month = date.getMonth();

    if (month !== lastMonth) {
      labels.push({ label: months[month], position: i * 14 });
      lastMonth = month;
    }
  }

  return labels;
}

/**
 * Render timeline HTML
 */
export function renderTimelineHTML(commits: Commit[], limit: number = 20): string {
  const displayCommits = commits.slice(0, limit);

  if (displayCommits.length === 0) {
    return `
      <div class="timeline-empty">
        <div class="timeline-empty-icon">📅</div>
        <p>No commits yet</p>
      </div>
    `;
  }

  let html = '<div class="timeline">';
  let currentDate = '';

  for (const commit of displayCommits) {
    const date = new Date(commit.author.timestamp * 1000);
    const dateStr = date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

    // Add date header if new date
    if (dateStr !== currentDate) {
      currentDate = dateStr;
      html += `<div class="timeline-date">${dateStr}</div>`;
    }

    const timeStr = date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });

    const hash = commit.hash();
    const message = commit.message.split('\n')[0];

    html += `
      <div class="timeline-item" data-hash="${hash}">
        <div class="timeline-marker"></div>
        <div class="timeline-content">
          <div class="timeline-header">
            <span class="timeline-hash">${hash.slice(0, 8)}</span>
            <span class="timeline-time">${timeStr}</span>
          </div>
          <div class="timeline-message">${escapeHtml(message)}</div>
          <div class="timeline-author">
            <span class="timeline-author-avatar">${getInitials(commit.author.name)}</span>
            <span class="timeline-author-name">${escapeHtml(commit.author.name)}</span>
          </div>
        </div>
      </div>
    `;
  }

  html += '</div>';
  return html;
}

/**
 * Render statistics dashboard HTML
 */
export function renderStatsDashboardHTML(stats: RepoStats): string {
  return `
    <div class="stats-dashboard">
      <div class="stats-overview">
        <div class="stats-card">
          <div class="stats-card-value">${stats.totalCommits.toLocaleString()}</div>
          <div class="stats-card-label">Commits</div>
        </div>
        <div class="stats-card">
          <div class="stats-card-value">${stats.totalAuthors}</div>
          <div class="stats-card-label">Contributors</div>
        </div>
        <div class="stats-card">
          <div class="stats-card-value">${stats.totalFiles.toLocaleString()}</div>
          <div class="stats-card-label">Files</div>
        </div>
        <div class="stats-card">
          <div class="stats-card-value">${formatDuration(stats.firstCommit, stats.lastCommit)}</div>
          <div class="stats-card-label">Project Age</div>
        </div>
      </div>

      <div class="stats-section">
        <h3 class="stats-section-title">Contribution Activity</h3>
        ${renderHeatmapHTML(stats.activityByDay)}
      </div>

      <div class="stats-row">
        <div class="stats-section stats-section-half">
          <h3 class="stats-section-title">Activity by Hour</h3>
          ${renderHourlyChart(stats.activityByHour)}
        </div>
        <div class="stats-section stats-section-half">
          <h3 class="stats-section-title">Activity by Day</h3>
          ${renderDailyChart(stats.activityByDayOfWeek)}
        </div>
      </div>

      <div class="stats-section">
        <h3 class="stats-section-title">Top Contributors</h3>
        ${renderContributorsHTML(stats.authors.slice(0, 10), stats.totalCommits)}
      </div>

      <div class="stats-section">
        <h3 class="stats-section-title">Commits Over Time</h3>
        ${renderMonthlyChart(stats.commitsByMonth)}
      </div>
    </div>
  `;
}

/**
 * Render hourly activity chart
 */
function renderHourlyChart(data: number[]): string {
  const max = Math.max(1, ...data);
  const hours = Array.from({ length: 24 }, (_, i) => i);

  return `
    <div class="chart-bar-horizontal">
      ${hours.map(h => `
        <div class="chart-bar-row">
          <span class="chart-bar-label">${h.toString().padStart(2, '0')}:00</span>
          <div class="chart-bar-track">
            <div class="chart-bar-fill" style="width: ${(data[h] / max) * 100}%"></div>
          </div>
          <span class="chart-bar-value">${data[h]}</span>
        </div>
      `).join('')}
    </div>
  `;
}

/**
 * Render daily activity chart
 */
function renderDailyChart(data: number[]): string {
  const max = Math.max(1, ...data);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  return `
    <div class="chart-bar-horizontal">
      ${days.map((day, i) => `
        <div class="chart-bar-row">
          <span class="chart-bar-label">${day}</span>
          <div class="chart-bar-track">
            <div class="chart-bar-fill" style="width: ${(data[i] / max) * 100}%"></div>
          </div>
          <span class="chart-bar-value">${data[i]}</span>
        </div>
      `).join('')}
    </div>
  `;
}

/**
 * Render monthly commits chart
 */
function renderMonthlyChart(data: { month: string; count: number }[]): string {
  if (data.length === 0) {
    return '<div class="chart-empty">No data available</div>';
  }

  const max = Math.max(1, ...data.map(d => d.count));
  const recentMonths = data.slice(-12);

  return `
    <div class="chart-line">
      <svg viewBox="0 0 ${recentMonths.length * 50} 100" preserveAspectRatio="none">
        <polyline
          fill="none"
          stroke="var(--accent-primary)"
          stroke-width="2"
          points="${recentMonths.map((d, i) => 
            `${i * 50 + 25},${100 - (d.count / max) * 80}`
          ).join(' ')}"
        />
        ${recentMonths.map((d, i) => `
          <circle 
            cx="${i * 50 + 25}" 
            cy="${100 - (d.count / max) * 80}" 
            r="4" 
            fill="var(--accent-primary)"
          >
            <title>${d.month}: ${d.count} commits</title>
          </circle>
        `).join('')}
      </svg>
      <div class="chart-line-labels">
        ${recentMonths.map(d => `<span>${d.month.slice(5)}</span>`).join('')}
      </div>
    </div>
  `;
}

/**
 * Render contributors list
 */
function renderContributorsHTML(authors: AuthorStats[], totalCommits: number): string {
  return `
    <div class="contributors-list">
      ${authors.map((author, index) => {
        const percentage = ((author.commits / totalCommits) * 100).toFixed(1);
        return `
          <div class="contributor-item">
            <span class="contributor-rank">#${index + 1}</span>
            <span class="contributor-avatar">${getInitials(author.name)}</span>
            <div class="contributor-info">
              <span class="contributor-name">${escapeHtml(author.name)}</span>
              <span class="contributor-email">${escapeHtml(author.email)}</span>
            </div>
            <div class="contributor-stats">
              <span class="contributor-commits">${author.commits} commits</span>
              <span class="contributor-percentage">${percentage}%</span>
            </div>
            <div class="contributor-bar">
              <div class="contributor-bar-fill" style="width: ${percentage}%"></div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

/**
 * Format duration between two dates
 */
function formatDuration(start: Date | null, end: Date | null): string {
  if (!start || !end) return 'N/A';

  const diffMs = end.getTime() - start.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 30) return `${diffDays} days`;
  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return `${months} month${months > 1 ? 's' : ''}`;
  }
  const years = Math.floor(diffDays / 365);
  const remainingMonths = Math.floor((diffDays % 365) / 30);
  if (remainingMonths > 0) {
    return `${years}y ${remainingMonths}m`;
  }
  return `${years} year${years > 1 ? 's' : ''}`;
}

/**
 * Get initials from name
 */
function getInitials(name: string): string {
  return name
    .split(' ')
    .map(p => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
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
 * Get timeline and stats CSS styles
 */
export function getTimelineStyles(): string {
  return `
    /* Timeline */
    .timeline {
      position: relative;
      padding-left: var(--spacing-xl);
    }

    .timeline::before {
      content: '';
      position: absolute;
      left: 8px;
      top: 0;
      bottom: 0;
      width: 2px;
      background: var(--border-default);
    }

    .timeline-date {
      font-size: var(--font-size-sm);
      font-weight: 600;
      color: var(--text-primary);
      padding: var(--spacing-md) 0 var(--spacing-sm);
      position: relative;
    }

    .timeline-item {
      position: relative;
      padding: var(--spacing-sm) 0 var(--spacing-md);
      cursor: pointer;
    }

    .timeline-marker {
      position: absolute;
      left: -24px;
      top: 12px;
      width: 12px;
      height: 12px;
      background: var(--bg-secondary);
      border: 2px solid var(--accent-primary);
      border-radius: 50%;
      z-index: 1;
    }

    .timeline-item:hover .timeline-marker {
      background: var(--accent-primary);
    }

    .timeline-content {
      background: var(--bg-secondary);
      border: 1px solid var(--border-default);
      border-radius: var(--border-radius);
      padding: var(--spacing-md);
      transition: all var(--transition-fast);
    }

    .timeline-item:hover .timeline-content {
      border-color: var(--border-hover);
      box-shadow: var(--shadow);
    }

    .timeline-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: var(--spacing-xs);
    }

    .timeline-hash {
      font-family: var(--font-family-mono);
      font-size: var(--font-size-sm);
      color: var(--accent-primary);
    }

    .timeline-time {
      font-size: var(--font-size-xs);
      color: var(--text-muted);
    }

    .timeline-message {
      color: var(--text-primary);
      font-size: var(--font-size-base);
      margin-bottom: var(--spacing-sm);
    }

    .timeline-author {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
    }

    .timeline-author-avatar {
      width: 24px;
      height: 24px;
      background: var(--accent-secondary);
      color: var(--text-inverse);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      font-weight: 600;
    }

    .timeline-author-name {
      font-size: var(--font-size-sm);
      color: var(--text-secondary);
    }

    .timeline-empty {
      text-align: center;
      padding: var(--spacing-xxl);
      color: var(--text-muted);
    }

    .timeline-empty-icon {
      font-size: 48px;
      margin-bottom: var(--spacing-md);
      opacity: 0.5;
    }

    /* Heatmap */
    .heatmap-container {
      overflow-x: auto;
    }

    .heatmap-months {
      position: relative;
      height: 20px;
      margin-left: 30px;
      font-size: var(--font-size-xs);
      color: var(--text-muted);
    }

    .heatmap-months span {
      position: absolute;
    }

    .heatmap-content {
      display: flex;
    }

    .heatmap-days {
      display: flex;
      flex-direction: column;
      gap: 2px;
      font-size: 10px;
      color: var(--text-muted);
      padding-right: var(--spacing-sm);
    }

    .heatmap-days span {
      height: 12px;
      line-height: 12px;
    }

    .heatmap-grid {
      display: flex;
      gap: 2px;
    }

    .heatmap-week {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .heatmap-day {
      width: 12px;
      height: 12px;
      border-radius: 2px;
      cursor: pointer;
      transition: transform var(--transition-fast);
    }

    .heatmap-day:hover {
      transform: scale(1.2);
    }

    .heatmap-day.level-0 { background: var(--bg-tertiary); }
    .heatmap-day.level-1 { background: color-mix(in srgb, var(--accent-success) 25%, transparent); }
    .heatmap-day.level-2 { background: color-mix(in srgb, var(--accent-success) 50%, transparent); }
    .heatmap-day.level-3 { background: color-mix(in srgb, var(--accent-success) 75%, transparent); }
    .heatmap-day.level-4 { background: var(--accent-success); }

    .heatmap-legend {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-top: var(--spacing-sm);
      margin-left: auto;
      font-size: var(--font-size-xs);
      color: var(--text-muted);
    }

    .heatmap-legend .heatmap-day {
      cursor: default;
    }

    .heatmap-legend .heatmap-day:hover {
      transform: none;
    }

    /* Stats Dashboard */
    .stats-dashboard {
      padding: var(--spacing-md);
    }

    .stats-overview {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: var(--spacing-md);
      margin-bottom: var(--spacing-xl);
    }

    .stats-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border-default);
      border-radius: var(--border-radius-lg);
      padding: var(--spacing-lg);
      text-align: center;
    }

    .stats-card-value {
      font-size: var(--font-size-xxl);
      font-weight: 700;
      color: var(--accent-primary);
    }

    .stats-card-label {
      font-size: var(--font-size-sm);
      color: var(--text-secondary);
      margin-top: var(--spacing-xs);
    }

    .stats-section {
      background: var(--bg-secondary);
      border: 1px solid var(--border-default);
      border-radius: var(--border-radius-lg);
      padding: var(--spacing-lg);
      margin-bottom: var(--spacing-lg);
    }

    .stats-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--spacing-lg);
    }

    .stats-section-half {
      margin-bottom: 0;
    }

    .stats-section-title {
      font-size: var(--font-size-lg);
      font-weight: 600;
      color: var(--text-primary);
      margin: 0 0 var(--spacing-md);
    }

    /* Bar Charts */
    .chart-bar-horizontal {
      display: flex;
      flex-direction: column;
      gap: 4px;
      max-height: 300px;
      overflow-y: auto;
    }

    .chart-bar-row {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
    }

    .chart-bar-label {
      width: 80px;
      font-size: var(--font-size-xs);
      color: var(--text-secondary);
      text-align: right;
    }

    .chart-bar-track {
      flex: 1;
      height: 16px;
      background: var(--bg-tertiary);
      border-radius: 4px;
      overflow: hidden;
    }

    .chart-bar-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--accent-primary), var(--accent-secondary));
      border-radius: 4px;
      transition: width var(--transition-base);
    }

    .chart-bar-value {
      width: 40px;
      font-size: var(--font-size-xs);
      color: var(--text-muted);
    }

    /* Line Chart */
    .chart-line {
      height: 120px;
      position: relative;
    }

    .chart-line svg {
      width: 100%;
      height: 100px;
    }

    .chart-line-labels {
      display: flex;
      justify-content: space-around;
      font-size: var(--font-size-xs);
      color: var(--text-muted);
      margin-top: var(--spacing-xs);
    }

    .chart-empty {
      text-align: center;
      padding: var(--spacing-xl);
      color: var(--text-muted);
    }

    /* Contributors */
    .contributors-list {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-sm);
    }

    .contributor-item {
      display: flex;
      align-items: center;
      gap: var(--spacing-md);
      padding: var(--spacing-sm) 0;
      border-bottom: 1px solid var(--border-default);
    }

    .contributor-item:last-child {
      border-bottom: none;
    }

    .contributor-rank {
      width: 32px;
      font-size: var(--font-size-sm);
      font-weight: 600;
      color: var(--text-muted);
    }

    .contributor-avatar {
      width: 36px;
      height: 36px;
      background: var(--accent-secondary);
      color: var(--text-inverse);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 600;
    }

    .contributor-info {
      flex: 1;
      min-width: 0;
    }

    .contributor-name {
      display: block;
      font-weight: 500;
      color: var(--text-primary);
    }

    .contributor-email {
      display: block;
      font-size: var(--font-size-sm);
      color: var(--text-muted);
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .contributor-stats {
      text-align: right;
    }

    .contributor-commits {
      display: block;
      font-weight: 500;
      color: var(--text-primary);
    }

    .contributor-percentage {
      display: block;
      font-size: var(--font-size-sm);
      color: var(--text-muted);
    }

    .contributor-bar {
      width: 100px;
      height: 8px;
      background: var(--bg-tertiary);
      border-radius: 4px;
      overflow: hidden;
    }

    .contributor-bar-fill {
      height: 100%;
      background: var(--accent-primary);
      border-radius: 4px;
    }

    @media (max-width: 768px) {
      .stats-row {
        grid-template-columns: 1fr;
      }

      .contributor-bar {
        display: none;
      }
    }
  `;
}
