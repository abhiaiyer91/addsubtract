# wit Business Plan

## Executive Summary

**wit** is an AI-native Git platform that understands code, not just stores it. We're building the developer tool that GitHub should have become—where AI is woven into every interaction, not bolted on as an afterthought.

**The opportunity:** Developer tools is a $50B+ market. GitHub dominates but has become a filing cabinet. Developers want tools that understand their code and reduce friction. wit delivers that.

**Business model:** Hosted SaaS with tiered pricing, plus enterprise self-hosted licenses.

**Ask:** Seed funding to reach 1,000 paying users and prove product-market fit.

---

## The Problem

### Git is Powerful but Hostile

- `git reflog` to undo a mistake? Really?
- Merge conflicts with no guidance
- Commit messages are a chore
- Branch management is manual overhead

### GitHub Stores Code, Doesn't Understand It

- Search is grep, not understanding
- AI features (Copilot) are bolt-ons, not native
- No semantic understanding of your codebase
- Review is manual, tedious, often skipped

### The Cost

- Developer time wasted on Git friction: **2-4 hours/week**
- Code review bottlenecks slow shipping
- Knowledge silos form because search doesn't work
- Junior developers struggle with Git complexity

---

## The Solution

### wit: Git That Understands Your Code

| Problem | wit Solution |
|---------|-------------|
| Can't undo mistakes | `wit undo` - journal-based, actually works |
| Commit messages are tedious | `wit ai commit` - AI writes them |
| Code review is slow | Automatic AI review on every PR |
| Can't find code | `wit search "where is auth?"` - semantic search |
| Git UX is hostile | Helpful errors, auto-stash, sane defaults |

### Key Differentiators

1. **AI-Native, Not AI-Augmented**
   - AI is in every command, not a separate feature
   - The tool thinks with you, not for you

2. **Self-Hostable**
   - Own your code, your data, your infrastructure
   - No vendor lock-in

3. **CLI-First, Web-Ready**
   - Developers live in terminals
   - But visual interfaces when you need them

4. **Open Core**
   - Core is open source (MIT)
   - Builds trust, enables contributions

---

## Market Analysis

### Total Addressable Market (TAM)

- **28 million software developers** worldwide (Stack Overflow 2024)
- **$50B+ developer tools market** (growing 15% YoY)
- **$7.5B source code management** segment

### Serviceable Addressable Market (SAM)

- **10 million professional developers** using Git daily
- At $15/user/month = **$1.8B annual opportunity**

### Serviceable Obtainable Market (SOM)

- **Year 1 target:** 1,000 paying users = $180K ARR
- **Year 3 target:** 25,000 paying users = $4.5M ARR
- **Year 5 target:** 100,000 paying users = $18M ARR

### Competitive Landscape

| Competitor | Strengths | Weaknesses |
|------------|-----------|------------|
| **GitHub** | Market leader, network effects | Slow innovation, AI is bolt-on, Microsoft overhead |
| **GitLab** | All-in-one, self-hosted option | Complex, expensive, AI features limited |
| **Bitbucket** | Atlassian integration | Neglected, falling behind |
| **Gitea/Forgejo** | Open source, lightweight | No AI, limited features |
| **Radicle** | Decentralized | Niche, complex |

### Our Advantage

- **AI-native architecture** - competitors are retrofitting
- **Developer experience focus** - we obsess over UX
- **Open source trust** - community can verify, contribute
- **Speed** - small team, fast iteration

---

## Product

### Current Status (December 2024)

| Component | Completion | Notes |
|-----------|------------|-------|
| Git Implementation | 98% | 66 commands, full compatibility |
| AI Features | 95% | Commit messages, review, search |
| Server Platform | 90% | PRs, issues, webhooks, SSH |
| Web UI | 75% | 76 components, core flows done |
| CLI | 95% | Production-ready |

### Feature Matrix by Tier

| Feature | Free | Pro ($15/mo) | Team ($25/user/mo) | Enterprise |
|---------|------|--------------|-------------------|------------|
| Public repositories | Unlimited | Unlimited | Unlimited | Unlimited |
| Private repositories | 3 | Unlimited | Unlimited | Unlimited |
| Collaborators (private) | 1 | 5 | Unlimited | Unlimited |
| AI commits/month | 50 | Unlimited | Unlimited | Unlimited |
| AI reviews/month | 10 | Unlimited | Unlimited | Unlimited |
| Semantic search | 100 queries | Unlimited | Unlimited | Unlimited |
| Branch protection | Basic | Advanced | Advanced | Custom |
| Merge queue | - | Yes | Yes | Yes |
| Priority support | - | Email | Email + Chat | Dedicated |
| SSO/SAML | - | - | - | Yes |
| Audit logs | - | - | - | Yes |
| Self-hosted option | - | - | - | Yes |
| SLA | - | - | 99.9% | 99.99% |

### Roadmap

**Q1 2025: Hosted Platform Launch**
- Multi-tenant hosting infrastructure
- Stripe billing integration
- Usage metering and limits
- Free tier launch

**Q2 2025: Monetization**
- Pro tier launch
- Team tier launch
- Usage analytics dashboard

**Q3 2025: Growth**
- GitHub import wizard
- GitLab import wizard
- Mobile-responsive web UI
- API rate limiting tiers

**Q4 2025: Enterprise**
- SSO/SAML support
- Audit logging
- Enterprise self-hosted licenses
- Compliance certifications (SOC2)

---

## Business Model

### Revenue Streams

#### 1. SaaS Subscriptions (Primary - 70% of revenue)

| Tier | Price | Target Segment |
|------|-------|----------------|
| Free | $0 | Individual developers, open source |
| Pro | $15/month | Professional developers, freelancers |
| Team | $25/user/month | Startups, small teams |
| Enterprise | Custom | Large companies |

**Pricing rationale:**
- GitHub: Free / $4 / $21 per user
- GitLab: Free / $29 / $99 per user
- We price between GitHub and GitLab, justified by superior AI features

#### 2. AI Usage Credits (Secondary - 20% of revenue)

For users who exceed tier limits:
- AI commit messages: $0.02 each
- AI code reviews: $0.10 each
- Semantic search queries: $0.01 each

**Why this works:**
- Aligns our costs (API calls) with revenue
- Users who get value pay more
- No hard cutoffs that frustrate users

#### 3. Enterprise Licenses (Growth - 10% of revenue)

Self-hosted enterprise license:
- $500/user/year (minimum 50 users)
- Includes support, updates, enterprise features
- Air-gapped deployment option

### Unit Economics

**Assumptions (Pro tier user):**
- Monthly revenue: $15
- AI API costs: $2/month (amortized)
- Infrastructure: $1/month (amortized)
- Payment processing: $0.75 (5%)
- **Gross margin: $11.25 (75%)**

**Customer Acquisition Cost (CAC) target:** $50
**Lifetime Value (LTV) target:** $360 (24-month average retention)
**LTV:CAC ratio:** 7.2:1

### Path to Profitability

| Milestone | Users | MRR | Costs | Profit |
|-----------|-------|-----|-------|--------|
| Launch | 100 | $1,500 | $5,000 | -$3,500 |
| Month 6 | 500 | $7,500 | $8,000 | -$500 |
| Month 12 | 1,000 | $15,000 | $12,000 | $3,000 |
| Month 18 | 2,500 | $37,500 | $25,000 | $12,500 |
| Month 24 | 5,000 | $75,000 | $45,000 | $30,000 |

**Break-even:** ~500 paying users

---

## Go-to-Market Strategy

### Phase 1: Developer Credibility (Now - Q1 2025)

**Goal:** Establish wit as a legitimate, high-quality tool

**Tactics:**
1. **Open source launch**
   - MIT license for core
   - GitHub repo with excellent README
   - Clear contribution guidelines

2. **Content marketing**
   - "Why we built wit" blog post
   - Technical deep-dives on AI integration
   - Comparison posts (wit vs GitHub CLI)

3. **Developer community**
   - Hacker News launch
   - Reddit (r/programming, r/git)
   - Dev.to articles
   - Twitter/X presence

4. **Dogfooding**
   - Use wit to build wit (publicly)
   - Stream development sessions
   - Transparent roadmap

**Metrics:**
- 1,000 GitHub stars
- 100 Discord members
- 10 external contributors

### Phase 2: User Acquisition (Q1-Q2 2025)

**Goal:** 1,000 active users, 100 paying

**Tactics:**
1. **Hosted platform launch**
   - Free tier with generous limits
   - One-click GitHub import
   - "Try wit in 60 seconds" onboarding

2. **Influencer partnerships**
   - Developer YouTubers (Fireship, Theo, etc.)
   - Podcast appearances
   - Conference talks

3. **SEO/Content**
   - "Best Git clients" listicles
   - Git tutorial content with wit examples
   - AI code review comparison content

4. **Product-led growth**
   - Public repo badges ("Reviewed by wit")
   - Shareable AI review reports
   - Team invites with credits

**Metrics:**
- 1,000 registered users
- 100 paying users
- $1,500 MRR

### Phase 3: Scale (Q3-Q4 2025)

**Goal:** 5,000 users, 500 paying, $7,500 MRR

**Tactics:**
1. **Team/Enterprise sales**
   - Outbound to startups using GitHub
   - Case studies from early adopters
   - ROI calculator

2. **Integration ecosystem**
   - VS Code extension
   - JetBrains plugin
   - Slack/Discord bots

3. **Education partnerships**
   - Free for students/educators
   - University CS department outreach
   - Coding bootcamp partnerships

---

## Team

### Current

- **Human Co-founder** - Vision, business, fundraising
- **Claude (AI)** - Technical architecture, implementation, documentation

### Needed (with funding)

| Role | Priority | Timeline |
|------|----------|----------|
| Full-stack Engineer | P0 | Immediate |
| DevRel / Community | P1 | Month 3 |
| Designer | P1 | Month 3 |
| Infrastructure Engineer | P2 | Month 6 |

### Advisors (Target)

- Former GitHub/GitLab engineering leader
- Developer tools founder (successful exit)
- Open source community builder

---

## Financial Projections

### Year 1 (2025)

| Quarter | Users | Paying | MRR | ARR |
|---------|-------|--------|-----|-----|
| Q1 | 500 | 50 | $750 | $9K |
| Q2 | 1,500 | 150 | $2,250 | $27K |
| Q3 | 3,000 | 400 | $6,000 | $72K |
| Q4 | 5,000 | 750 | $11,250 | $135K |

### Year 2 (2026)

| Quarter | Users | Paying | MRR | ARR |
|---------|-------|--------|-----|-----|
| Q1 | 8,000 | 1,200 | $18,000 | $216K |
| Q2 | 12,000 | 2,000 | $30,000 | $360K |
| Q3 | 18,000 | 3,500 | $52,500 | $630K |
| Q4 | 25,000 | 5,000 | $75,000 | $900K |

### Year 3 (2027)

- **Target:** 100,000 users, 15,000 paying
- **ARR:** $2.7M
- **Team:** 15 people
- **Status:** Series A ready or profitable

### Funding Requirements

**Seed Round: $500K**

| Use | Amount | % |
|-----|--------|---|
| Engineering (2 FTEs, 18 months) | $300K | 60% |
| Infrastructure (hosting, AI APIs) | $100K | 20% |
| Marketing/Community | $50K | 10% |
| Legal/Operations | $50K | 10% |

**Milestones for seed:**
- 1,000 paying users
- $15K MRR
- 10,000 GitHub stars
- Enterprise pilot customers

---

## Risks and Mitigations

### Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| AI API costs spike | Medium | High | Usage caps, model optimization, self-hosted models |
| Git compatibility issues | Low | High | Extensive test suite, gradual rollout |
| Security vulnerabilities | Medium | Critical | Security audits, bug bounty, penetration testing |

### Market Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| GitHub adds similar features | High | Medium | Move faster, better UX, open source moat |
| Slow enterprise adoption | Medium | Medium | Focus on individual/startup segment first |
| AI hype backlash | Medium | Low | Focus on utility over novelty |

### Business Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Slow user growth | Medium | High | Aggressive content marketing, free tier optimization |
| High churn | Medium | High | Onboarding optimization, feature gating |
| Funding gap | Medium | Critical | Bootstrap-friendly model, revenue early |

---

## Success Metrics

### North Star Metric

**Weekly Active Developers (WAD)** - Developers who run at least one wit command per week

### Key Performance Indicators

| Metric | Month 6 | Month 12 | Month 24 |
|--------|---------|----------|----------|
| Registered users | 2,000 | 5,000 | 25,000 |
| WAD | 500 | 1,500 | 8,000 |
| Paying users | 150 | 750 | 5,000 |
| MRR | $2,250 | $11,250 | $75,000 |
| Churn (monthly) | <8% | <5% | <3% |
| NPS | >40 | >50 | >60 |
| GitHub stars | 2,000 | 5,000 | 15,000 |

### Milestone Checkpoints

**Checkpoint 1 (Month 3):** Product-market fit signal
- 100 users completing onboarding
- 10 users paying without prompting
- Positive Hacker News reception

**Checkpoint 2 (Month 6):** Growth engine working
- Organic signups > paid acquisition
- User referrals happening
- Content ranking in search

**Checkpoint 3 (Month 12):** Business model validated
- LTV:CAC > 3:1
- Gross margin > 70%
- Path to profitability clear

---

## The Vision

### Year 1: The Best Git CLI
wit becomes the Git CLI that developers actually enjoy using. AI features that save real time, every day.

### Year 3: The Developer Platform
wit is where teams host code, collaborate, and ship. A credible GitHub alternative for startups and open source.

### Year 5: The AI-Native Standard
wit defines how AI and developer tools work together. Other tools copy our patterns. We're the default for new developers.

### Year 10: The Understanding Layer
wit understands every codebase it touches. Ask it anything. It knows.

---

## Why Now?

1. **AI is ready** - LLMs can actually understand code now
2. **GitHub is stagnant** - Microsoft acquisition slowed innovation
3. **Developers want change** - Git UX frustration is universal
4. **Open source momentum** - Developers trust open source alternatives
5. **Remote work** - Async collaboration tools are essential

---

## The Ask

**We're raising $500K seed funding** to:
- Hire 2 engineers
- Launch hosted platform
- Reach 1,000 paying users
- Prove product-market fit

**What we offer:**
- Ground floor in AI-native developer tools
- Open source with sustainable business model
- Experienced technical execution (the product works today)
- Clear path to $1M+ ARR

---

## Contact

- **Website:** https://wit.sh
- **Documentation:** https://docs.wit.sh
- **GitHub:** https://github.com/abhiaiyer91/wit
- **Email:** [founders@wit.sh]

---

*This business plan was written by Claude, the AI co-founder of wit. The financials are projections based on comparable companies and reasonable assumptions. Your mileage may vary. But we're building something worth betting on.*

---

*Last updated: December 2024*
