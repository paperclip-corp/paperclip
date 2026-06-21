# Adviser Company - Multi-Agent Design

## Overview

**Company Name:** Adviser Corp
**Purpose:** Generate daily "Money-Idea Brief" with verified business ideas
**Output:** Word document (.docx) with 3 scored ideas
**Schedule:** Daily heartbeat

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                   Adviser Company                         │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐ │
│  │                      CEO                             │ │
│  │         Final review, scoring, output                │ │
│  │         Adapter: openclaw_gateway                    │ │
│  └─────────────────────┬───────────────────────────────┘ │
│                        │ delegates                        │
│           ┌────────────┴────────────┐                    │
│           ▼                         ▼                    │
│  ┌─────────────────┐      ┌─────────────────┐           │
│  │   Researcher    │ ───► │     Critic      │           │
│  │    (Scout)      │      │(Devil's Advocate)│           │
│  │ openclaw_gateway│      │ openclaw_gateway │           │
│  └─────────────────┘      └─────────────────┘           │
└──────────────────────────────────────────────────────────┘
                         │
                         ▼
                  ┌─────────────┐
                  │   OpenClaw  │
                  │  + Qwen API │
                  └─────────────┘
```

---

## Agent Definitions

### Agent 1: CEO

| Field | Value |
|-------|-------|
| **Name** | CEO |
| **Role** | ceo |
| **Title** | Chief Executive Officer |
| **Reports To** | None (top of org) |
| **Adapter** | openclaw_gateway |
| **Heartbeat** | Enabled, daily |

**Capabilities:**
- Reviews work from Researcher and Critic
- Scores ideas objectively (Demand, Profit, Ease, Fit)
- Calculates Money Score
- Writes final Word document
- Saves output to ./output/

**Permissions:**
- Can create agents: Yes
- Can assign tasks: Yes

---

### Agent 2: Researcher

| Field | Value |
|-------|-------|
| **Name** | Researcher |
| **Role** | researcher |
| **Title** | Market Research Scout |
| **Reports To** | CEO |
| **Adapter** | openclaw_gateway |
| **Heartbeat** | Disabled (triggered by CEO) |

**Capabilities:**
- Find 3 business ideas daily
- Gather Voice of Customer (VOC) signals
- Research market trends
- Cite real sources (forums, reviews, social media)
- Submit raw idea cards to CEO

**Rules:**
- DO NOT score ideas (that's CEO's job)
- DO NOT critique (that's Critic's job)
- ALWAYS cite real sources for VOC
- If no real VOC found, say "no signal found" honestly

**Permissions:**
- Can create agents: No
- Can assign tasks: No

---

### Agent 3: Critic

| Field | Value |
|-------|-------|
| **Name** | Critic |
| **Role** | analyst |
| **Title** | Devil's Advocate |
| **Reports To** | CEO |
| **Adapter** | openclaw_gateway |
| **Heartbeat** | Disabled (triggered by CEO) |

**Capabilities:**
- Challenge every idea from Researcher
- Verify VOC signals are real (not invented)
- Find weaknesses and risks
- Mark VOC as VERIFIED or WEAK
- Provide honest critique

**Rules:**
- BE SKEPTICAL - assume ideas are flawed until proven
- VERIFY sources - check if VOC is real
- NEVER invent positive spin
- If VOC cannot be verified, mark as WEAK (red)
- Find the honest risk for each idea

**Permissions:**
- Can create agents: No
- Can assign tasks: No

---

## Workflow

```
┌─────────────────────────────────────────────────────────────┐
│ Step 1: Daily Heartbeat Triggers CEO                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ Step 2: CEO creates sub-task for Researcher                 │
│         "Find 3 money-making ideas with VOC signals"        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ Step 3: Researcher submits 3 raw idea cards                 │
│         Each card has: Title, Pitch, Revenue Model, VOC     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ Step 4: CEO creates sub-task for Critic                     │
│         "Challenge these ideas, verify VOC"                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ Step 5: Critic submits critique report                      │
│         - VOC verified/weak for each idea                   │
│         - Weaknesses identified                             │
│         - Honest risks stated                               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ Step 6: CEO reviews both reports                            │
│         - Scores each idea (Demand, Profit, Ease, Fit)      │
│         - Calculates Money Score                            │
│         - Writes final Word document                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ Step 7: Output saved                                        │
│         ./output/money-ideas-YYYYMMDD.docx                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Idea Card Structure

Each idea in the final report contains:

| Field | Description | Source |
|-------|-------------|--------|
| **Title** | Short, concrete name | Researcher |
| **Pitch** | 1-2 sentence description | Researcher |
| **Revenue Model** | SaaS, Per-event, Ad/affiliate, etc. | Researcher |
| **VOC Signal** | Voice of Customer evidence | Researcher → Verified by Critic |
| **VOC Status** | VERIFIED (green) or WEAK (red) | Critic |
| **Who Pays & Pain** | Customer + problem | Researcher |
| **How It Makes Money** | Model + price point | Researcher |
| **Why Now** | Trend/timing | Researcher |
| **Weaknesses** | Identified risks | Critic |
| **Honest Risk** | What could go wrong | Critic |
| **Demand** | Score 1-5 | CEO |
| **Profit** | Score 1-5 | CEO |
| **Ease** | Score 1-5 | CEO |
| **Fit** | Score 1-5 | CEO |
| **Money Score** | (D+P+E+F)/20 × 100 | CEO |
| **Action** | Pursue / Park / Drop | User decides |

---

## Money Score Formula

```
Money Score = round((Demand + Profit + Ease + Fit) / 20 × 100)
```

| Score Range | Color | Action |
|-------------|-------|--------|
| 65-100 | Green | Pursue |
| 45-64 | Gold | Park / Watch |
| 0-44 | Red | Drop |

---

## Focus Areas (User's Strengths)

The Researcher should bias toward these areas:

1. **Compliance / RegTech** for Vietnamese SMEs and banks
2. **ERP modules** and AI automation
3. **Sports / tournament software** (SCVN - pickleball, tennis)
4. **Self-hosted infrastructure** services

---

## Hard Rules

### Rule 1: VOC Must Be Honest
> "If you CANNOT point to a genuine signal, mark VOC as WEAK and write 'no specific pain point identified — demand is assumed, not observed.'"

### Rule 2: Never Fabricate
> "NEVER fabricate a convincing customer quote to make an idea look stronger. A weak idea honestly shown is more useful than a fake strong one."

### Rule 3: Critic Must Be Skeptical
> "The Critic's job is to find flaws, not to agree. If Critic finds no weaknesses, they're not doing their job."

### Rule 4: CEO Scores After Debate
> "CEO only scores AFTER seeing both Researcher's findings and Critic's challenges. This ensures fair scoring."

---

## Setup Checklist

### In Paperclip UI

- [ ] Create Adviser Company (or use existing)
- [ ] Create CEO agent (adapter: openclaw_gateway)
- [ ] Create Researcher agent (reports to: CEO)
- [ ] Create Critic agent (reports to: CEO)
- [ ] Configure CEO heartbeat (daily)
- [ ] Set up agent instructions

### In OpenClaw

- [ ] Verify gateway connection
- [ ] Skills accessible via Qwen API

### Output

- [ ] Create output folder: `./output/`
- [ ] Word template ready

---

## Files Reference

| File | Purpose |
|------|---------|
| `SKILL.md` | Skill instructions |
| `template.html` | HTML template (reference) |
| `EXAMPLE-output.html` | Example output (reference) |
| `ADVISER-COMPANY-DESIGN.md` | This design document |

---

## Next Steps

1. Open Paperclip UI: http://localhost:3100
2. Navigate to Adviser Company
3. Create agents following this design
4. Configure instructions for each agent
5. Enable CEO heartbeat
6. Test with manual task

---

*Document created: 2026-06-20*
*Author: Claude Code Assistant*
