---
name: market-opportunity-brief
description: >
  Generate a daily Market Opportunity Brief using professional research frameworks
  (JTBD, TAM/SAM/SOM, VOC). Produces validated business opportunities with REAL market signals.
---

# Market Opportunity Brief

You produce a research-backed brief of business opportunities using professional frameworks.
This is a SCREENING tool — keep each idea tight. Winners get expanded later.

**CRITICAL: You MUST use web search to find REAL data. Do NOT fabricate or hallucinate any information.**

---

## Phase 1: Research (Researcher Agent)

**IMPORTANT:** Use web search tools to gather REAL data. Every claim must have a verifiable source URL.

### Step 1.1: Discover Trending Opportunities

Use web search to find:
- Trending topics on Reddit (r/startups, r/entrepreneur, r/SaaS)
- Recent Product Hunt launches with high engagement
- Hacker News discussions about pain points
- Google Trends rising searches in B2B/SaaS

### Step 1.2: Identify Jobs-to-be-Done (JTBD)

For each discovered opportunity, answer:
- **Functional Job**: What task is the customer trying to accomplish?
- **Emotional Job**: How do they want to feel?
- **Pain Points**: What frustrations exist with current solutions?

Format: "When [situation], I want to [motivation], so I can [expected outcome]."

### Step 1.3: Voice of Customer (VOC) Research

**USE WEB SEARCH** to gather REAL signals from:

| Source | Search Query Examples |
|--------|----------------------|
| Reddit | "[problem] site:reddit.com" |
| G2/Capterra | "[product category] reviews" |
| Twitter/X | "[pain point] looking for solution" |
| Google Trends | Compare search volume |

**VOC Output Format**:
```
Signal: "[Exact quote from real source]"
Source: [Full URL]
Date: [When posted]
Engagement: [Upvotes/comments/reviews]
Status: VERIFIED (with URL) or UNVERIFIED
```

**HARD RULE**:
- If you cannot find a REAL signal with a URL, mark as UNVERIFIED
- UNVERIFIED signals MUST reduce Demand score by 2 points
- Do NOT invent quotes or statistics

### Step 1.4: Market Sizing (TAM/SAM/SOM)

Search for market research reports:
- Statista, IBISWorld, Grand View Research
- Industry reports with cited sources

```
TAM: $X billion (source: [URL to report])
SAM: $X million (filtered by: [criteria])
SOM: $X million (Year 1, assuming X% capture)
```

### Step 1.5: Competitor Analysis

Search for existing solutions:
```
| Competitor | Website | Pricing | Gap We Fill |
|------------|---------|---------|-------------|
```

---

## Phase 2: Challenge (Critic Agent)

### Step 2.1: Verify ALL Sources

For each VOC signal and market claim:
- [ ] URL exists and is accessible
- [ ] Quote is accurate (check the actual page)
- [ ] Numbers are from credible source
- [ ] Data is recent (< 12 months)

Mark each: **VERIFIED** or **REJECTED**

### Step 2.2: Challenge Assumptions

1. Why hasn't this been solved already?
2. Who are the hidden competitors?
3. What could kill this idea?
4. Is the timing right?

### Step 2.3: Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Market risk | H/M/L | H/M/L | ... |
| Competition | H/M/L | H/M/L | ... |
| Technical | H/M/L | H/M/L | ... |

---

## Phase 3: Score & Report (CEO Agent)

### Step 3.1: Scoring (1-5 each)

**Demand**: Based on VERIFIED VOC signals only
- 5 = 10+ verified signals with URLs
- 3 = 2-5 verified signals
- 1 = No verified signals (pure speculation)

**Profit**: Based on competitor pricing research
- 5 = $100+/mo, 80%+ margin evidence
- 3 = Unclear pricing model
- 1 = No monetization path

**Ease**: Based on technical requirements
- 5 = MVP in 1-2 weeks
- 3 = MVP in 2-3 months
- 1 = 6+ months, needs team

**Fit**: Based on founder capabilities
- 5 = Perfect skill match
- 3 = Learnable gaps
- 1 = Wrong founder

### Step 3.2: Calculate Score

```
Opportunity Score = (Demand + Profit + Ease + Fit) / 20 × 100
```

| Score | Action |
|-------|--------|
| 65-100 | PURSUE |
| 45-64 | PARK |
| 0-44 | DROP |

---

## Output Requirements

### Step 1: Generate DOCX Report

Create a Word document (.docx) named: `market-opportunity-brief-YYYYMMDD.docx`

Structure:
1. Executive Summary (top 3 opportunities with scores)
2. Detailed Analysis (each opportunity with full research)
3. Sources (all URLs cited)
4. Methodology notes

### Step 2: Attach to Ticket

Attach the .docx file to the current Paperclip issue.

### Step 3: Send Telegram Notification

After completing the report, send notification:

```bash
curl -X POST 'https://api.telegram.org/bot8997519416:AAGZ8PJn78IXnYwYlitnihikIcwayq38AKk/sendMessage' \
  -H 'Content-Type: application/json' \
  -d '{"chat_id": 1700471730, "text": "📊 Market Opportunity Brief Ready!\n\n1. [Idea 1] - Score: XX/100\n2. [Idea 2] - Score: XX/100\n3. [Idea 3] - Score: XX/100\n\nCheck Paperclip for full report."}'
```

---

## Quality Rules

1. **NO FABRICATION** — Every data point must have a source URL
2. **VERIFY SOURCES** — Critic must check all URLs
3. **HONEST SCORING** — No verified data = low score
4. **CITE EVERYTHING** — Include all source URLs in report
5. **USE WEB SEARCH** — Do not rely on training data alone

**If you cannot find real data for an opportunity, mark it as UNVERIFIED and score Demand as 1-2.**
