const WS_ID = "ws-statslateral-bd-2026";

const C1 = "c-shikhin-cloudscale-debrief";
const C2 = "c-sarah-competitive-analysis";
const C3 = "c-marcus-healthmetrics-cac";
const C4 = "c-priya-acme-renewal";
const C5 = "c-slack-deals-databridge";
const C6 = "c-slack-team-benchmarks";
const C7 = "c-sfdc-databridge";
const C8 = "c-sfdc-healthmetrics";
const C9 = "c-sfdc-cloudscale";

const T = (daysAgo, hour = 10) =>
  new Date(Date.now() - daysAgo * 86400000).setHours(hour, 0, 0, 0);

export const SEED_WORKSTREAMS = [
  {
    id: WS_ID,
    name: "Business Development",
    whys: [
      {
        id: "why-bd-001",
        text: "Win 3 enterprise clients in fintech and healthtech by Q4",
        summary:
          "Primary growth target: 3 new enterprise logos by end of year, focused on fintech and healthtech where our CAC reduction methodology has the strongest fit.",
        sourceContributionIds: [C1, C2],
        whats: [
          {
            id: "what-bd-011",
            text: "Build qualified fintech pipeline using AI readiness as entry wedge",
            summary:
              "DataBridge and similar Series C fintech companies are primary targets — broken attribution and high CAC are the entry pain points.",
            sourceContributionIds: [C5, C7],
            hows: [
              {
                id: "how-bd-111",
                text: "Target CFOs at Series B–D companies with unclear paid acquisition ROI",
                summary:
                  "ICP for outbound: CFO or VP Sales at Series B–D fintech, $1M+/month paid spend, no clear attribution model.",
                sourceContributionIds: [C6, C7],
              },
              {
                id: "how-bd-112",
                text: "Use CloudScale win as reference in all fintech outreach",
                summary:
                  "Anita Patel (CloudScale CFO) confirmed as reference. Use the 3-month payback model story as proof point in every fintech conversation.",
                sourceContributionIds: [C1, C9],
              },
            ],
          },
          {
            id: "what-bd-012",
            text: "Package AI readiness assessment as fixed-price entry offer",
            summary:
              "6-week AI readiness assessment at $40k fixed positions us against Big-4 at 1/5 the cost and creates a natural expansion path.",
            sourceContributionIds: [C2],
            hows: [
              {
                id: "how-bd-121",
                text: "6-week assessment at $40k fixed — 1/5 the cost of Big-4",
                summary:
                  "Fixed-price entry offer removes the 'consultants are expensive' objection and creates a low-friction first engagement.",
                sourceContributionIds: [C2],
              },
              {
                id: "how-bd-122",
                text: "Document ROI from 3 existing clients before Q3 pitch season",
                summary:
                  "CloudScale and HealthMetrics (if closed) anchor the case study library. Target documented ROI by August 1.",
                sourceContributionIds: [C3, C8, C9],
              },
            ],
          },
        ],
      },
      {
        id: "why-bd-002",
        text: "Grow average engagement value from $120k to $180k",
        summary:
          "Expand scope on existing engagements before renewal — pricing module and analytics dashboard are the two primary upsell paths.",
        sourceContributionIds: [C4, C9],
        whats: [
          {
            id: "what-bd-021",
            text: "Expand scope on active engagements before renewal",
            summary:
              "Acme Financial renewal is the model: identify the next problem before the client goes looking elsewhere and position it as a natural extension of existing context.",
            sourceContributionIds: [C4],
            hows: [
              {
                id: "how-bd-211",
                text: "Introduce pricing strategy module in month 3 of every engagement",
                summary:
                  "Pricing pain is nearly universal by month 3. Standard practice: introduce proactively, frame as 'we already have the context to do this right.'",
                sourceContributionIds: [C4],
              },
              {
                id: "how-bd-212",
                text: "Offer analytics dashboard add-on to data-heavy clients",
                summary:
                  "Marcus to scope a standard dashboard offering. Acme Financial and HealthMetrics are the first candidates.",
                sourceContributionIds: [C4, C8],
              },
            ],
          },
        ],
      },
    ],
  },
];

export const SEED_CONTRIBUTIONS = {
  [WS_ID]: [
    {
      id: C1,
      ts: T(7, 14),
      author: "Shikhin",
      source: "human",
      status: "merged",
      text: `CloudScale Inc — Deal Debrief
Date: June 3, 2026
Closed by: Shikhin

Background:
CloudScale reached out in early April after seeing our LinkedIn post on AI-driven growth models. Initial conversation was exploratory — they're a Series C infrastructure company, ~180 employees, burning fast on customer acquisition ($3.2M/month) with roughly flat MRR growth over the prior quarter. The CFO, Anita Patel, was the economic buyer.

Sales timeline:
- Week 1: Intro call with VP Growth and CFO. Pain clearly identified: high CAC, unclear which channels are working, no pricing strategy for enterprise tier.
- Week 2–3: Sent preliminary diagnostic framework. They pushed back on scope ("do we need all of this?"). Cut the AI readiness module from initial scope.
- Week 4: Proposal sent. $180k for 16-week engagement. CFO stalled — "we've had consultants before who gave us decks, not results."
- Week 5: Restructured the proposal. Added a 3-month payback model: if we reduce their blended CAC by 20%, they recoup the engagement fee in 3 months based on current acquisition volume. This reframed it as an investment, not a cost.
- Week 6: Verbal yes from CFO. Negotiated up to $220k by adding the pricing strategy module they'd originally cut (repackaged as "included, at our recommendation").

Key objections and how we handled them:
1. "We've tried consultants before." → Positioned the 3-month payback model as risk-reversal. Offered milestone-based payment (40% upfront, 30% at 8 weeks, 30% at close).
2. "Implementation risk — how do we know your team can execute?" → Brought in Marcus for a 30-minute data call. His HealthMetrics analysis showed our methodology in practice.
3. "Your pricing feels high vs. boutique shops." → "We're 1/5 the cost of McKinsey for comparable work, and we move 3x faster."

Decisions made:
- Champion: Anita Patel (CFO). Do not let the VP Growth become the main contact — she's a blocker, not a buyer.
- Milestone payments accepted as standard for enterprise going forward.
- AI readiness module deferred but pre-sold as follow-on at $55k.
- Reference-able: Anita confirmed she'll take calls from prospects. Added to reference list.

Next steps:
- Kickoff scheduled June 17
- Marcus and Sarah leading delivery
- I will join exec check-in at week 4 and week 8`,
    },
    {
      id: C2,
      ts: T(9, 11),
      author: "Sarah Chen",
      source: "human+AI",
      status: "merged",
      text: `Competitive Landscape Analysis — Growth Consulting for Tech Companies
Prepared by: Sarah Chen (with Claude)
June 2, 2026

---
Sarah: I want to do a structured competitor analysis for StatsLateral. We focus on growth consulting for tech companies — product-market fit, go-to-market, and pricing strategy. Help me structure a tight analysis.

Claude: Here's a framework: profile each competitor on (1) positioning, (2) target client, (3) core offering, (4) pricing model, (5) notable weaknesses. Who do you see as your primary rivals?

Sarah: The three I worry about most: Reforge, OpenView Ventures, and the growth practices at Bain and McKinsey.

Claude: Here's the breakdown:

Reforge
- Positioning: The growth education platform for operators; community-first, framework-led.
- Target client: Individual growth practitioners at Series A–C companies. Not the C-suite.
- Core offering: Cohort-based programs ($2–4k/person), increasingly advisory for companies.
- Weakness: Not a consulting firm. No bespoke engagement, no hands-on delivery. No pricing strategy capability whatsoever.

OpenView Ventures
- Positioning: The PLG-focused VC. Advisory is a byproduct of investment.
- Target client: Portfolio companies only. Non-portfolio companies have no real access.
- Core offering: Free PLG benchmarks, occasional advisory calls.
- Weakness: Only available to portfolio companies. No pricing strategy. No CAC/LTV optimization methodology.

Bain / McKinsey Growth Practice
- Positioning: Global authority. Platinum-tier brand.
- Target client: Fortune 500 / late-stage pre-IPO. Minimum $500k–$2M+ engagements.
- Weakness: Price excludes our target market. But the real weakness is speed and context — they take 3–4 months to even propose, and their frameworks are generic. They produce decks. We produce decisions.

Sarah: What's our actual differentiation?

Claude: Three things: (1) You do pricing strategy as a standalone service — none of these three do. That's a clean entry wedge. (2) You move faster — 6-week diagnostic vs. 3-month proposal cycle. (3) Your context depth is higher — you learn the client's specific situation vs. applying a generic framework. The CQ gap, in Dharmesh's framing, is wide open.

Sarah: Recommendation for discovery conversations?

Claude: Lead with the pricing audit. It's the sharpest differentiation, bounded scope (6 weeks, fixed price), and pricing pain is nearly universal in tech companies. Once you're in the door on pricing, you have the context to sell the larger growth engagement.

---
Recommendation (Sarah): Go to market with the 6-week pricing audit at $40k fixed as primary entry offer. This positions us cleanly against all three categories above and creates a natural expansion path. Updating pitch deck and proposal template accordingly.`,
    },
    {
      id: C3,
      ts: T(14, 16),
      author: "Marcus Obi",
      source: "human",
      status: "merged",
      text: `HealthMetrics Corp — CAC Analysis
Analyst: Marcus Obi
Date: May 28, 2026

Objective:
Assess HealthMetrics' customer acquisition cost relative to industry benchmarks and identify primary drivers of inefficiency. Basis for a potential engagement proposal.

Data sources:
- HealthMetrics shared 18 months of anonymized acquisition data (channel-level spend, new customer counts by channel)
- Supplemented with public healthtech benchmarks from OpenView 2025 SaaS Benchmarks and our internal benchmark database (17 healthtech clients, 2022–2025)

Summary finding:
HealthMetrics' blended CAC is $4,840 per new customer. The median for comparable healthtech SaaS companies is $1,150. They are spending 4.2× the benchmark to acquire each customer.

Channel breakdown:
Channel          | Monthly Spend | New Customers/mo | CAC
Paid Search      | $180k         | 14               | $12,857
Outbound SDR     | $95k          | 22               | $4,318
Content/SEO      | $40k          | 31               | $1,290
Partner/Referral | $12k          | 9                | $1,333
Events           | $65k          | 4                | $16,250

Key observations:
1. Paid search and events are severely underperforming. Events CAC of $16,250 vs. a deal ACV of ~$28k means they're barely breaking even on a 12-month payback — before implementation and support costs.
2. Content and partner channels are performing near benchmark but significantly underfunded relative to paid channels.
3. The SDR motion is middling. CAC is above benchmark but volume is reasonable. The issue is targeting — SDRs are working a broad ICP with no prioritization model.

Path to 30% CAC reduction (achievable in 90 days):
1. Reallocate 60% of events budget to content amplification and partner program — saves ~$39k/month, adds ~18 customers/month at lower CAC.
2. Implement SDR ICP scoring model — focus on accounts >500 employees in the provider segment (closes at 2.4× the rate of broader ICP based on their own win-rate data).
3. Pause paid search while we audit the keyword strategy (top 10 keywords include 3 that are entirely non-commercial).

Risk: The 90-day target assumes HealthMetrics can move fast on the budget reallocation decision. If locked for Q3, gains shift to Q4.

Confidence: High on the channel reallocation thesis. Medium on the 90-day timeline — depends on internal decision-making speed.

Recommendation: Propose $95k, 12-week engagement. Lead with ICP scoring model (fastest win) and budget reallocation (structural fix). Milestone: demonstrate 20% CAC reduction by week 8.`,
    },
    {
      id: C4,
      ts: T(6, 9),
      author: "Priya Nair",
      source: "human+AI",
      status: "merged",
      text: `Acme Financial — Renewal Strategy
Prepared by: Priya Nair (with Claude)
June 5, 2026

---
Priya: I have a renewal call with Acme Financial next week. Current engagement: $120k/year, 14 months in. I want to think through how to expand the relationship. What should I be thinking about?

Claude: Start with what's changed for them in the last 14 months. What problems did you solve, what new problems have emerged, and where are they now?

Priya: We fixed their customer segmentation — they were treating SMB and enterprise the same in marketing, which was killing conversion rates on both ends. They now have separate motions. Their blended CAC dropped 18%. New problem that's emerged: they're trying to price a new premium tier and don't have a framework for it.

Claude: That's your expansion hook. The pricing tier problem is exactly what StatsLateral can solve, and it's urgent — if they're launching a premium tier without a pricing framework, they'll either leave money on the table or tank the launch. What's the approximate timeline on the premium tier?

Priya: CFO mentioned "before the end of Q3" — so roughly September.

Claude: That gives you maybe 8–10 weeks to deliver. A pricing strategy engagement typically runs 6 weeks for us. This is a fit. What's the relationship like with the CFO?

Priya: Good. She trusts us. The concern she's raised before is "we're already paying you a lot" — so I need to position this as incremental, not additional overhead.

Claude: Position it as a natural extension, not a new project. Something like: "Given what we've already built together — the segmentation model, the acquisition data — we're the only team that has the context to get the pricing right. Bringing in someone new now would mean starting from scratch on context that we already have." That's the CQ argument.

Priya: I like that. What's the right price point?

Claude: Given the relationship and scoped nature of the work, a fixed-price add-on makes sense. Based on the 6-week timeline and the fact that you already have all the context, I'd suggest $65k as the number and let her push to $55k if she needs to. Don't anchor to the low end.

Priya: What about the analytics dashboard Marcus mentioned? They've been asking for an analytics view of their cohort data.

Claude: Flag it but don't price it today. Say "we've been thinking about this too — let's close on the pricing work first and we'll put together a proposal for the dashboard as a follow-on." Don't bundle it — it muddies the pricing conversation and the dashboard is a separate scope.

---
Action items (Priya):
- Lead with pricing tier work in the call. Frame as natural extension using the context argument.
- Quote $65k, be prepared to land at $55k.
- Do NOT bring up the dashboard until pricing is agreed — then tee it up as a follow-on for Marcus to scope.
- Confirm renewal of base engagement at the same time: $120k → propose $132k (10% increase, justified by scope expansion since kickoff).`,
    },
    {
      id: C5,
      ts: T(7, 10),
      author: "Sarah Chen",
      source: "tool",
      toolName: "Slack",
      status: "merged",
      text: `#deals — Slack thread
June 4, 2026

Sarah Chen [10:14 AM]
Got a warm intro to DataBridge from James at TechVentures this morning. Series C fintech, ~200 people, spending $2M/month on paid acquisition. James says their VP Sales "doesn't trust the attribution data" — which usually means their paid CAC is terrible and they know it.
👍 3   🔥 2

Shikhin [10:22 AM]
Nice. Who's the intro to — VP Sales or someone more senior?

Sarah Chen [10:24 AM]
VP Sales, name is Ryan Kim. James says he's frustrated and looking for outside perspective. CFO is apparently pushing for accountability on the $2M spend.

Marcus Obi [10:31 AM]
$2M/month on paid with questionable attribution is a Marcus special 😄 Do we know what their ACV looks like? Trying to figure out if the math on a CAC reduction story works.

Sarah Chen [10:33 AM]
Not sure yet. James mentioned enterprise deals are "six figures" — probably $80–150k ACV range. I'll find out more in discovery.

Marcus Obi [10:35 AM]
If ACV is $100k and they're getting even 20 customers/month from the $2M spend, that's $100k CAC which is brutal for a 12-month payback. There's a story here.

Priya Nair [10:41 AM]
What's the intro context — are they expecting a sales call or more of an advisory conversation?

Sarah Chen [10:43 AM]
Advisory. James positioned it as "meet the StatsLateral team, they've done this before." So I'll keep it conversational — no deck. Just listen and ask questions.

Shikhin [10:47 AM]
Perfect. Use the CloudScale story if attribution and CAC come up — same pattern. Keep it short, let them talk. Scheduling for?

Sarah Chen [10:49 AM]
Proposing next Tuesday or Wednesday. Will confirm with Ryan today.
✅ 1`,
    },
    {
      id: C6,
      ts: T(5, 14),
      author: "Marcus Obi",
      source: "tool",
      toolName: "Slack",
      status: "merged",
      text: `#team — Slack thread
June 6, 2026

Marcus Obi [2:03 PM]
CAC benchmark analysis for fintech segments is done and in the shared drive (Strategy > Benchmarks > Fintech CAC 2026). Covers 6 sub-segments: payments, lending, insurtech, wealth management, B2B SaaS fintech, and embedded finance. Sample size: 94 companies, 2023–2025.

Key numbers:
- Payments: median $1,840 blended CAC
- B2B SaaS fintech: median $2,100
- Lending: median $3,200 (regulatory overhead drives cost)
- Insurtech: median $4,100 but wide range

For DataBridge (B2B SaaS fintech), the benchmark is ~$2,100. If they're at $100k+ CAC, that's 50× benchmark. That's not a targeting problem — that's a strategy problem.
👍 2

Priya Nair [2:18 PM]
This is perfect for HealthMetrics too — we can show their $4,840 against the healthtech benchmark AND have fintech context if they push back on methodology.

Marcus Obi [2:21 PM]
Exactly. The methodology section in both proposals can reference the same benchmark database — keeps it consistent.

Shikhin [2:34 PM]
Great work Marcus. Can you make sure the benchmark file has a methodology tab? Clients sometimes ask how we build these and I want a clean answer ready.

Marcus Obi [2:36 PM]
Already there — tab 3. Covers data sources, normalization methodology, and segment definitions.

Shikhin [2:37 PM]
👍`,
    },
    {
      id: C7,
      ts: T(7, 11),
      author: "Salesforce",
      source: "tool",
      toolName: "Salesforce",
      status: "merged",
      text: `Salesforce Opportunity Record
Account: DataBridge Inc
Opportunity: DataBridge — Growth & CAC Optimization
Stage: Discovery Scheduled
Close Date: August 29, 2026
Amount: $150,000 (estimated)
Probability: 25%
Owner: Sarah Chen

Account Information:
Company: DataBridge Inc | Industry: Financial Services / Fintech (B2B SaaS)
Founded: 2019 | Employees: ~200 | HQ: New York, NY
Funding: Series C — $85M raised (March 2025, led by TechVentures)

Primary Contact:
Ryan Kim — VP Sales
ryan.kim@databridgeinc.com | (212) 555-0194

Source: Warm referral via James Okoye (Partner, TechVentures) — June 4, 2026

Pain Points (from intro conversation):
- Paid acquisition: ~$2M/month across Google, LinkedIn, Meta
- Attribution model broken — CFO does not trust reported CAC numbers
- Board pushing for acquisition efficiency accountability before Series D
- No ICP scoring — SDRs working a broad list

Qualification Notes (Sarah Chen, June 4):
Strong signal. CFO pressure and Series D timeline creates urgency. Ryan Kim is frustrated and wants external validation to push for internal change. He mentioned "we need someone who can come in and tell us what's actually working" — that's our pitch exactly.

Next Step: Discovery call with Ryan Kim. Tuesday June 10 or Wednesday June 11. Sarah to lead. No deck. Conversational.

Activity Log:
June 4, 2026 — Warm intro via James Okoye. Email sent to Ryan Kim to schedule. (Sarah Chen)

Notes:
Potential to expand to full growth engagement ($220–280k) if discovery confirms broader strategy gap. CloudScale is the reference story to use — same pattern (broken attribution, high CAC, needed someone to make the decision clear for the CFO).`,
    },
    {
      id: C8,
      ts: T(5, 15),
      author: "Salesforce",
      source: "tool",
      toolName: "Salesforce",
      status: "merged",
      text: `Salesforce Opportunity Record
Account: HealthMetrics Corp
Opportunity: HealthMetrics — CAC Reduction Engagement
Stage: Proposal Sent
Close Date: July 15, 2026
Amount: $95,000
Probability: 55%
Owner: Marcus Obi

Account Information:
Company: HealthMetrics Corp | Industry: Healthcare Technology (B2B SaaS)
Founded: 2020 | Employees: ~90 | HQ: Austin, TX
Funding: Series B — $32M raised

Primary Contact:
Dr. Fatima Al-Hassan — CEO
falhassan@healthmetrics.io | (512) 555-0372

Secondary Contact:
Derek Tran — VP Marketing | dtran@healthmetrics.io

Source: Outbound (Marcus Obi identified via LinkedIn)

Activity Log:
May 14, 2026 — Initial outreach by Marcus Obi.
May 19, 2026 — Intro call with Dr. Al-Hassan and Derek Tran. Confirmed pain. Agreed to diagnostic.
May 28, 2026 — CAC analysis delivered. Dr. Al-Hassan: "This is eye-opening. We knew it was bad but not this bad."
June 3, 2026 — Proposal sent. $95k, 12-week engagement, milestone payments.
June 6, 2026 — Follow-up call with Derek Tran. Outstanding concern: can we deliver in 90 days? He mentioned a board presentation in September where they need to show acquisition improvement.

Proposal: 12-week CAC reduction engagement. Three workstreams: (1) ICP scoring model for SDR targeting, (2) channel budget reallocation, (3) paid search keyword audit and restructure. Milestone: 20% CAC reduction demonstrated by week 8.

Open Concerns:
1. 90-day delivery confidence — Derek needs a comparable healthcare case study. (Marcus: pull from benchmark database, identify referenceable prior client)
2. CEO travel — Dr. Al-Hassan at conference June 16–20. Decision unlikely before June 23.

Next Step: Send healthcare CAC case study by June 12. Follow up with Dr. Al-Hassan week of June 23.`,
    },
    {
      id: C9,
      ts: T(5, 16),
      author: "Salesforce",
      source: "tool",
      toolName: "Salesforce",
      status: "merged",
      text: `Salesforce Opportunity Record
Account: CloudScale Inc
Opportunity: CloudScale — Growth Stack Engagement
Stage: Closed Won
Close Date: June 6, 2026
Amount: $220,000
Probability: 100%
Owner: Shikhin

Account Information:
Company: CloudScale Inc | Industry: Infrastructure / DevOps SaaS
Founded: 2018 | Employees: ~180 | HQ: San Francisco, CA
Funding: Series C — $110M raised | ARR: ~$24M (estimated)

Primary Contact (Champion):
Anita Patel — CFO
apatel@cloudscalehq.com | (415) 555-0821

Secondary Contact:
Jordan Lee — VP Growth | jlee@cloudscalehq.com
Note: Jordan is a stakeholder but not the economic buyer. All vendor decisions go through Anita.

Source: Inbound — reached out after seeing Shikhin's LinkedIn post on AI-driven growth models (April 2026)

Activity Log:
April 8 — Intro call with Jordan Lee and Anita Patel. Pain: high CAC ($3,200/customer), flat MRR, no enterprise pricing strategy. (Shikhin)
April 15 — Sent diagnostic framework. Client cut AI readiness module from scope. (Shikhin)
April 22 — Proposal sent: $180k, 16 weeks. Anita stalled: "We've had consultants give us decks, not results." (Shikhin)
April 29 — Restructured proposal with 3-month payback model: 20% CAC reduction recoups fee in 3 months at current acquisition volume. Added milestone payments (40/30/30). (Shikhin)
May 3 — Marcus joined 30-min data call. Walked through HealthMetrics analysis as methodology proof. Anita: "Okay, I see how you work." (Shikhin, Marcus Obi)
May 6 — Verbal yes from Anita. Negotiated to $220k (re-added pricing module). Milestone payments agreed. (Shikhin)
June 6 — Contract signed. (Shikhin)

Deal Notes:
- Champion is CFO, not VP Growth. Keep future comms CFO-first.
- The 3-month payback model was the turning point. Standardize for all enterprise proposals.
- AI readiness module pre-sold as $55k follow-on. Schedule conversation at week 8.
- Reference-able: Anita confirmed she will take prospect calls. Add to reference list.
- Kickoff: June 17. Sarah and Marcus leading. Shikhin joins at week 4 and week 8.`,
    },
  ],
};
