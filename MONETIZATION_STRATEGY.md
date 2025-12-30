# Short-Term Monetization Strategy

*Created: December 2024*

## Executive Summary

wit is 95% feature-complete but has **zero monetization infrastructure**. This document outlines the fastest path to revenue based on our existing business plan, with concrete implementation steps.

---

## Current State Assessment

### ✅ What We Have
| Component | Status | Notes |
|-----------|--------|-------|
| AI Commit Messages | Ready | `wit ai commit` works |
| AI Code Reviews | Ready | PR review with suggestions |
| Semantic Search | Ready | Vector-based code search |
| Full Platform | Ready | PRs, issues, repos, orgs |
| Rate Limiting | Ready | Can adapt for usage limits |
| User Auth | Ready | better-auth integration |

### ❌ What We're Missing
| Component | Effort | Priority |
|-----------|--------|----------|
| User subscription tiers | 2-3 days | P0 |
| Usage tracking (AI calls) | 2-3 days | P0 |
| Stripe integration | 3-5 days | P0 |
| Billing UI | 2-3 days | P1 |
| Usage dashboard | 2-3 days | P2 |

---

## Short-Term Revenue Options (Ranked by Speed to Revenue)

### Option 1: ☕ "Buy Me a Coffee" / Donations (1 day)
**Time to revenue: Immediate**

The fastest path to any revenue. Zero infrastructure needed.

**Implementation:**
1. Add GitHub Sponsors button to README
2. Add "Sponsor" link to CLI help output
3. Add Ko-fi or Buy Me a Coffee link

**Pros:**
- Zero development time
- Community building
- No commitment from users

**Cons:**
- Low revenue potential ($100-500/month typically)
- Not scalable
- Doesn't validate product-market fit

**Recommended for:** Immediate while building real monetization

---

### Option 2: 🎯 Gated AI Features with Honor System (3-5 days)
**Time to revenue: 1 week**

Ship a "Pro" tier quickly using an honor-based system before building full billing.

**Implementation:**
1. Add `tier` field to user table (`free`, `pro`, `team`)
2. Add usage counters (AI calls per month)
3. Soft limits: Show "upgrade" prompts after free limits
4. Manual Stripe payment links (no integration yet)
5. Admin manually upgrades users who pay

**Free Tier Limits:**
- 50 AI commits/month
- 10 AI reviews/month  
- 100 semantic searches/month
- 3 private repos

**Pro Tier ($15/month):**
- Unlimited AI features
- Unlimited private repos
- Priority support

**Pros:**
- Very fast to ship
- Validates willingness to pay
- Real revenue without full billing system

**Cons:**
- Manual user management
- Some friction (manual upgrade)
- Honor system can be bypassed

**Recommended for:** Immediate MVP monetization

---

### Option 3: 💳 Autumn Billing (1 week) ✅ IMPLEMENTED
**Time to revenue: 1 week**

We've implemented Autumn for simplified billing infrastructure.

**What's Built:**
1. `src/lib/autumn.ts` - Autumn SDK integration
2. `src/server/middleware/usage.ts` - Usage enforcement middleware
3. `src/api/trpc/routers/billing.ts` - Billing API with Autumn
4. `src/commands/billing.ts` - CLI billing command
5. `apps/web/src/routes/settings/billing.tsx` - Billing settings page

**Why Autumn over raw Stripe:**
- Handles subscriptions + usage-based billing in one API
- Built-in entitlements/feature flags
- Much simpler than raw Stripe (1 API call vs 10+)
- Customer portal included
- Stripe under the hood (all the reliability)

**Setup Steps:**
1. Sign up at https://getautumn.com
2. Create products: `free`, `pro`, `team`, `enterprise`
3. Create features: `ai-commits`, `ai-reviews`, `ai-searches`, `ai-agent-messages`
4. Set limits for each product/feature combo
5. Add `AUTUMN_SECRET_KEY` to your environment
6. Run database migration: `npm run db:migrate`

**Pros:**
- Self-serve (scales)
- Usage-based billing built-in
- Minimal code needed
- Stripe reliability

**Cons:**
- Autumn fees (on top of Stripe)
- Less customization than raw Stripe

---

### Option 4: 🏢 Enterprise/Team Sales (1-2 weeks setup)
**Time to revenue: 1-2 months (sales cycle)**

Target startups/teams for higher-value deals.

**Implementation:**
1. Simple landing page with "Contact Sales" form
2. Calendly booking link
3. Notion-based pricing calculator
4. Manual onboarding process

**Pricing:**
- Team: $25/user/month (min 5 users)
- Enterprise: Custom ($500+/user/year self-hosted)

**Pros:**
- Higher deal values ($1,250+/month)
- Relationship-based (stickier)
- Feedback from real teams

**Cons:**
- Longer sales cycle
- Requires founder time
- Lower volume

---

## Recommended Short-Term Plan

### Phase 1: This Week (Days 1-5)
**Goal: Get first revenue, however small**

1. **Day 1:** Add GitHub Sponsors + Ko-fi links
2. **Days 2-4:** Implement soft usage limits + manual Pro tier
3. **Day 5:** Create simple pricing page

**Deliverables:**
- [ ] GitHub Sponsors enabled
- [ ] User `tier` column in database
- [ ] Usage counting middleware for AI endpoints
- [ ] "Upgrade to Pro" prompts in CLI
- [ ] Manual Stripe payment link

### Phase 2: Next 2 Weeks (Days 6-20)
**Goal: Self-serve subscriptions**

1. Stripe Checkout integration
2. Subscription webhooks
3. Billing settings UI
4. Usage dashboard

**Deliverables:**
- [ ] Stripe customer creation on signup
- [ ] Checkout flow for Pro/Team tiers
- [ ] Webhook handling for subscription events
- [ ] Settings > Billing page
- [ ] CLI `wit billing` command

### Phase 3: Month 2
**Goal: Scale and optimize**

1. Usage-based credits for overage
2. Team billing (seats)
3. Annual discount option
4. Referral program

---

## Technical Implementation Details

### Usage Tracking Middleware

Add to AI endpoints in `src/server/`:

```typescript
// src/server/middleware/usage.ts
export async function trackAIUsage(
  userId: string, 
  feature: 'commit' | 'review' | 'search'
) {
  const now = new Date();
  const periodStart = startOfMonth(now);
  const periodEnd = endOfMonth(now);
  
  // Upsert usage record
  await db.insert(aiUsage).values({
    id: crypto.randomUUID(),
    userId,
    feature,
    count: 1,
    periodStart,
    periodEnd,
  }).onConflictDoUpdate({
    target: [aiUsage.userId, aiUsage.feature, aiUsage.periodStart],
    set: { count: sql`${aiUsage.count} + 1` }
  });
}

export async function checkUsageLimit(
  userId: string,
  feature: 'commit' | 'review' | 'search'
): Promise<{ allowed: boolean; current: number; limit: number }> {
  const user = await userModel.findById(userId);
  const limits = TIER_LIMITS[user?.tier ?? 'free'];
  const current = await getCurrentUsage(userId, feature);
  
  return {
    allowed: current < limits[feature],
    current,
    limit: limits[feature],
  };
}

const TIER_LIMITS = {
  free: { commit: 50, review: 10, search: 100 },
  pro: { commit: Infinity, review: Infinity, search: Infinity },
  team: { commit: Infinity, review: Infinity, search: Infinity },
};
```

### Stripe Integration Points

1. **Customer Creation:** On user signup
2. **Checkout Session:** When user clicks "Upgrade"
3. **Webhook Events:**
   - `checkout.session.completed` → Activate subscription
   - `customer.subscription.updated` → Update tier
   - `customer.subscription.deleted` → Downgrade to free
   - `invoice.payment_failed` → Send warning, grace period

### CLI Upgrade Prompt

```typescript
// In AI command handlers
const usage = await checkUsageLimit(userId, 'commit');
if (!usage.allowed) {
  console.log(chalk.yellow(`
  ⚠️  You've used ${usage.current}/${usage.limit} AI commits this month.
  
  Upgrade to Pro for unlimited AI features:
  → wit billing upgrade
  → https://wit.sh/pricing
  `));
  return;
}
```

---

## Pricing Strategy

### Tier Comparison

| Feature | Free | Pro ($15/mo) | Team ($25/user/mo) |
|---------|------|--------------|-------------------|
| Public repos | ∞ | ∞ | ∞ |
| Private repos | 3 | ∞ | ∞ |
| Collaborators | 1 | 5 | ∞ |
| AI commits | 50/mo | ∞ | ∞ |
| AI reviews | 10/mo | ∞ | ∞ |
| Semantic search | 100/mo | ∞ | ∞ |
| Priority support | - | ✓ | ✓ |

### Why These Prices?

- **Free:** Generous enough to get hooked, limited enough to upgrade
- **Pro $15:** Between GitHub ($4) and GitLab ($29), justified by AI
- **Team $25:** Standard SaaS team pricing

### Conversion Assumptions

- Free → Pro: 10% (power users who hit limits)
- Trial → Paid: 5% (if we add trials)
- Annual discount: 2 months free (17% off)

---

## Revenue Projections (Conservative)

| Month | Free Users | Pro Users | Team Seats | MRR |
|-------|------------|-----------|------------|-----|
| 1 | 100 | 5 | 0 | $75 |
| 3 | 500 | 25 | 10 | $625 |
| 6 | 2,000 | 100 | 50 | $2,750 |
| 12 | 5,000 | 300 | 200 | $9,500 |

**Break-even:** ~400 Pro users or equivalent (~$6,000 MRR to cover costs)

---

## Success Metrics

### Week 1
- [ ] First GitHub Sponsor
- [ ] Usage tracking deployed
- [ ] 10 users hitting free limits

### Month 1
- [ ] First paying Pro customer
- [ ] Stripe integration live
- [ ] $100+ MRR

### Month 3
- [ ] 50+ paying users
- [ ] $1,000+ MRR
- [ ] <5% churn

---

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Users don't hit limits | Medium | Lower free limits, add more AI features |
| AI costs exceed revenue | Low | Usage-based pricing for heavy users |
| Stripe complexity | Medium | Use Stripe's hosted billing portal |
| Churn | Medium | Focus on onboarding, engagement |

---

## Immediate Next Steps

1. **Today:** Enable GitHub Sponsors
2. **This week:** Add user tier + usage tracking schema
3. **Next week:** Stripe Checkout integration
4. **Week 3:** Billing UI and usage dashboard

---

## Resources

- [Stripe Subscriptions Guide](https://stripe.com/docs/billing/subscriptions/overview)
- [Stripe Node.js SDK](https://github.com/stripe/stripe-node)
- [GitHub Sponsors](https://github.com/sponsors)
- [Pricing Psychology](https://www.priceintelligently.com/)

---

*This strategy can generate first revenue within 1 week and reach $1,000+ MRR within 3 months with focused execution.*
