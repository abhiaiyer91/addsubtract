/**
 * Billing Command
 * 
 * Check subscription status, usage, and manage billing.
 * 
 * Usage:
 *   wit billing              Show current subscription and usage
 *   wit billing usage        Show detailed usage breakdown
 *   wit billing plans        Show available plans
 *   wit billing upgrade      Upgrade to a paid plan
 */

import {
  subscriptionModel,
  usageModel,
  TIER_LIMITS,
  TIER_PRICING,
  formatTierDisplay,
  formatUsageBar,
} from '../db/models';

// ============================================================================
// Types
// ============================================================================

interface BillingArgs {
  _: string[];
  help?: boolean;
  h?: boolean;
}

// ============================================================================
// Helpers
// ============================================================================

function formatPrice(price: number | null): string {
  if (price === null) return 'Custom';
  if (price === 0) return 'Free';
  return `$${price}/month`;
}

function formatLimit(limit: number): string {
  if (limit === Infinity) return '∞';
  return limit.toString();
}

// ============================================================================
// Subcommands
// ============================================================================

async function showStatus(userId: string): Promise<void> {
  const tier = await subscriptionModel.getUserTier(userId);
  const limits = TIER_LIMITS[tier];
  const usage = await usageModel.getAllCurrentUsage(userId);
  const pricing = TIER_PRICING[tier];

  console.log(`
╔════════════════════════════════════════════════════════════════╗
║                     📊 wit Subscription                         ║
╠════════════════════════════════════════════════════════════════╣
║                                                                ║
║  Current Plan: ${formatTierDisplay(tier).padEnd(20)}                      ║
║  Price: ${formatPrice(pricing.monthly).padEnd(15)}                               ║
║                                                                ║
╠════════════════════════════════════════════════════════════════╣
║  This Month's Usage                                            ║
╠════════════════════════════════════════════════════════════════╣
║                                                                ║
║  AI Commits:    ${formatUsageBar(usage.commit, limits.aiCommits, 25)}    ║
║  AI Reviews:    ${formatUsageBar(usage.review, limits.aiReviews, 25)}    ║
║  Searches:      ${formatUsageBar(usage.search, limits.aiSearches, 25)}    ║
║  Agent Msgs:    ${formatUsageBar(usage.agent, limits.aiAgentMessages, 25)}    ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
`);

  if (tier === 'free') {
    const commitPercent = (usage.commit / limits.aiCommits) * 100;
    const reviewPercent = (usage.review / limits.aiReviews) * 100;
    const searchPercent = (usage.search / limits.aiSearches) * 100;
    
    if (commitPercent > 70 || reviewPercent > 70 || searchPercent > 70) {
      console.log(`
💡 Running low on AI features? Upgrade to Pro for unlimited usage!

   wit billing upgrade
   
   Or visit: https://wit.sh/pricing
`);
    }
  }
}

async function showUsage(userId: string): Promise<void> {
  const tier = await subscriptionModel.getUserTier(userId);
  const limits = TIER_LIMITS[tier];
  const usage = await usageModel.getAllCurrentUsage(userId);
  const history = await usageModel.getUsageHistory(userId, 3);

  console.log(`
📊 AI Feature Usage - ${formatTierDisplay(tier)}
${'═'.repeat(60)}

Current Period (${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })})
${'─'.repeat(60)}

Feature              Used      Limit     Remaining
${'─'.repeat(60)}
AI Commits           ${String(usage.commit).padStart(5)}     ${formatLimit(limits.aiCommits).padStart(5)}     ${limits.aiCommits === Infinity ? '    ∞' : String(limits.aiCommits - usage.commit).padStart(5)}
AI Reviews           ${String(usage.review).padStart(5)}     ${formatLimit(limits.aiReviews).padStart(5)}     ${limits.aiReviews === Infinity ? '    ∞' : String(limits.aiReviews - usage.review).padStart(5)}
Semantic Searches    ${String(usage.search).padStart(5)}     ${formatLimit(limits.aiSearches).padStart(5)}     ${limits.aiSearches === Infinity ? '    ∞' : String(limits.aiSearches - usage.search).padStart(5)}
Agent Messages       ${String(usage.agent).padStart(5)}     ${formatLimit(limits.aiAgentMessages).padStart(5)}     ${limits.aiAgentMessages === Infinity ? '    ∞' : String(limits.aiAgentMessages - usage.agent).padStart(5)}
`);

  if (history.length > 1) {
    console.log(`
Previous Months
${'─'.repeat(60)}
`);
    for (const { period, usage: monthUsage } of history.slice(0, -1).reverse()) {
      const [year, month] = period.split('-');
      const monthName = new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      const total = monthUsage.commit + monthUsage.review + monthUsage.search + monthUsage.agent;
      console.log(`  ${monthName}: ${total} total AI calls (${monthUsage.commit} commits, ${monthUsage.review} reviews, ${monthUsage.search} searches)`);
    }
  }

  console.log();
}

async function showPlans(userId: string): Promise<void> {
  const currentTier = await subscriptionModel.getUserTier(userId);

  console.log(`
📋 Available Plans
${'═'.repeat(70)}
`);

  const plans = [
    {
      tier: 'free',
      name: '🆓 Free',
      price: '$0/month',
      features: [
        '3 private repositories',
        '50 AI commits/month',
        '10 AI reviews/month',
        '100 semantic searches/month',
      ],
    },
    {
      tier: 'pro',
      name: '⭐ Pro',
      price: '$15/month',
      features: [
        'Unlimited private repos',
        'Unlimited AI features',
        '5 collaborators per repo',
        'Priority support',
      ],
      recommended: currentTier === 'free',
    },
    {
      tier: 'team',
      name: '👥 Team',
      price: '$25/user/month',
      features: [
        'Everything in Pro',
        'Unlimited collaborators',
        'Team management',
        '99.9% SLA',
      ],
    },
    {
      tier: 'enterprise',
      name: '🏢 Enterprise',
      price: 'Custom',
      features: [
        'Everything in Team',
        'Self-hosted option',
        'SSO/SAML',
        'Dedicated support',
      ],
    },
  ];

  for (const plan of plans) {
    const isCurrent = plan.tier === currentTier;
    const marker = isCurrent ? ' ← Current' : plan.recommended ? ' ★ Recommended' : '';
    
    console.log(`┌${'─'.repeat(34)}┐${marker}`);
    console.log(`│ ${plan.name.padEnd(32)} │`);
    console.log(`│ ${plan.price.padEnd(32)} │`);
    console.log(`├${'─'.repeat(34)}┤`);
    for (const feature of plan.features) {
      console.log(`│  ✓ ${feature.padEnd(29)} │`);
    }
    console.log(`└${'─'.repeat(34)}┘`);
    console.log();
  }

  if (currentTier === 'free') {
    console.log(`
To upgrade, run: wit billing upgrade
Or visit: https://wit.sh/pricing
`);
  }
}

async function upgradeFlow(userId: string): Promise<void> {
  const currentTier = await subscriptionModel.getUserTier(userId);

  if (currentTier !== 'free') {
    console.log(`
✓ You're already on the ${formatTierDisplay(currentTier)} plan!

To manage your subscription, visit:
https://wit.sh/settings/billing
`);
    return;
  }

  console.log(`
🚀 Upgrade to Pro
${'═'.repeat(50)}

Pro Plan - $15/month
${'─'.repeat(50)}
  ✓ Unlimited private repositories
  ✓ Unlimited AI commit messages
  ✓ Unlimited AI code reviews
  ✓ Unlimited semantic search
  ✓ 5 collaborators per private repo
  ✓ Priority email support

${'─'.repeat(50)}

To upgrade:

  1. Visit https://wit.sh/pricing
  2. Click "Get Pro"
  3. Complete checkout

Or contact us at billing@wit.sh

${'─'.repeat(50)}

Annual billing available at $150/year (2 months free!)
`);
}

// ============================================================================
// Main Command
// ============================================================================

export async function billingCommand(args: BillingArgs): Promise<void> {
  if (args.help || args.h) {
    console.log(`
wit billing - Manage your subscription and usage

USAGE
  wit billing              Show subscription status and usage
  wit billing usage        Show detailed usage breakdown
  wit billing plans        Show available plans
  wit billing upgrade      Upgrade to a paid plan

OPTIONS
  -h, --help               Show this help message

EXAMPLES
  wit billing              Check your current usage
  wit billing plans        Compare available plans
  wit billing upgrade      Start upgrade to Pro
`);
    return;
  }

  // For now, use a placeholder user ID
  // In production, this would come from CLI auth
  const userId = process.env.WIT_USER_ID || 'demo-user';

  const subcommand = args._[1];

  try {
    switch (subcommand) {
      case 'usage':
        await showUsage(userId);
        break;
      case 'plans':
        await showPlans(userId);
        break;
      case 'upgrade':
        await upgradeFlow(userId);
        break;
      default:
        await showStatus(userId);
        break;
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('relation')) {
      // Database not set up yet
      console.log(`
⚠️  Billing not configured yet.

Run database migrations first:
  npm run db:migrate

Or visit https://wit.sh/pricing for plan information.
`);
    } else {
      throw error;
    }
  }
}

export default billingCommand;
