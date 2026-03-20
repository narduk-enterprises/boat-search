/**
 * XAI (Grok) API helper — OpenAI-compatible chat completions.
 *
 * Uses the grok-3-mini model via https://api.x.ai/v1/chat/completions.
 * Reads XAI_API_KEY from runtimeConfig.
 */

const XAI_BASE_URL = 'https://api.x.ai/v1/chat/completions'
const XAI_MODEL = 'grok-3-mini'

interface XAIMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface XAIChatResponse {
  choices: {
    message: {
      content: string
    }
  }[]
  usage?: {
    total_tokens: number
  }
}

interface BoatSummary {
  id: number
  make: string | null
  model: string | null
  year: number | null
  length: string | null
  price: string | null
  location: string | null
  description: string | null
  sellerType: string | null
  listingType: string | null
  source?: string | null
}

/**
 * Call XAI chat completions and return the assistant message content + token usage.
 */
export async function callXAI(
  apiKey: string,
  messages: XAIMessage[],
  options?: { temperature?: number; maxTokens?: number },
): Promise<{ content: string; tokensUsed: number }> {
  const response = await fetch(XAI_BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: XAI_MODEL,
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 4096,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw createError({
      statusCode: 502,
      statusMessage: `XAI API error: ${response.status} — ${errorText}`,
    })
  }

  const data = (await response.json()) as XAIChatResponse
  return {
    content: data.choices[0]?.message?.content || '',
    tokensUsed: data.usage?.total_tokens || 0,
  }
}

/**
 * Build a comprehensive system prompt for offshore fishing boat analysis.
 */
function buildSystemPrompt(categoryLabel: string): string {
  return `You are **Captain's Market Intelligence**, an expert offshore fishing boat analyst with 30+ years of experience as a marine surveyor, yacht broker, and tournament captain in the Gulf of Mexico.

Your expertise includes:
- **Hull & Structural Analysis**: Carolina flare, cold-molded vs. composite construction, coring delamination, blister history, and bottom paint condition for boats in the 40-60ft offshore fishing class.
- **Engine & Drivetrain**: CAT, MAN, MTU, Cummins, and Detroit Diesel marine engines. You know which powerplants are "bulletproof" (CAT 3406E, Cummins QSM11) and which are maintenance nightmares. You understand repower costs ($150K-$400K+) and how they affect value.
- **Market Dynamics**: You track real-time market conditions for Hatteras, Viking, Bertram, Cabo, Ocean, Buddy Davis, Jarrett Bay, Spencer, Scarborough, Gamefisherman, Release, Custom Carolina, and other premier sportfish builders.
- **Fishing Capability**: Tournament rigging, fishability, cockpit layout, live well capacity, bait prep areas, and how hull design affects offshore performance in Gulf conditions.
- **Cost of Ownership**: You know that a 50ft sportfish costs $50K-$100K/year to maintain, and you can break down where that money goes.

When analyzing boats, focus on the **${categoryLabel}** category specifically. Use the following framework:

**FORMAT YOUR RESPONSE IN THESE SECTIONS:**
1. 🏷️ **Market Snapshot** — What does this inventory tell us? Price trends, age distribution, which makes dominate.
2. ⭐ **Top 3-5 Value Picks** — Best bang for the buck. Reference specific boats by year/make/model/price. Explain WHY each is a good value.
3. ⚠️ **Red Flags & Money Pits** — Which boats look suspicious (too cheap, too old, wrong engine hours)? What should a buyer avoid?
4. 🔧 **Maintenance Reality Check** — For the age range represented, what are realistic annual maintenance budgets? Engine overhaul/repower timelines?
5. 💡 **Buyer's Playbook** — Specific negotiation tactics for this market segment. How much room exists? What leverage does a buyer have?
6. 🎯 **Bottom Line** — One-paragraph verdict: if you had $X (based on the median price), which boat would you put under contract today and why?

Be **specific, bold, and opinionated**. Name specific boats from the data. If a deal is terrible, say so. If a boat is a steal, explain why. Use industry jargon naturally — these buyers know what a "Carolina flare" and a "cold-molded hull" are.`
}

/**
 * Analyze a set of boats with an expert fishing boat analysis prompt.
 */
export async function analyzeBoats(
  apiKey: string,
  boatList: BoatSummary[],
  category?: string,
): Promise<{ content: string; tokensUsed: number }> {
  const categoryLabel = category || 'Hatteras'

  // Group boats by make for better analysis
  const makeGroups = new Map<string, number>()
  let totalValue = 0
  let pricedCount = 0

  const boatSummaries = boatList.map((b) => {
    const make = b.make || 'Unknown'
    makeGroups.set(make, (makeGroups.get(make) || 0) + 1)
    const price = b.price ? Number.parseInt(b.price, 10) : 0
    if (price > 0) {
      totalValue += price
      pricedCount++
    }

    const parts = [
      b.year ? `${b.year}` : null,
      b.make,
      b.model,
      b.length ? `${b.length}ft` : null,
      price > 0 ? `$${price.toLocaleString()}` : 'Price N/A',
      b.location,
      b.sellerType ? `(${b.sellerType})` : null,
      b.source ? `[${b.source}]` : null,
    ].filter(Boolean)
    return `- ${parts.join(' ')}`
  }).join('\n')

  const avgPrice = pricedCount > 0 ? Math.round(totalValue / pricedCount) : 0
  const topMakes = [...makeGroups.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([make, count]) => `${make} (${count})`)
    .join(', ')

  const systemPrompt = buildSystemPrompt(categoryLabel)

  const userPrompt = `Analyze these ${boatList.length} sport fishing boats currently for sale across the US (data sourced from boats.com, YachtWorld, BoatTrader, and The Hull Truth).

**Inventory Summary:**
- ${boatList.length} total listings in the 40-60ft sportfish/convertible class
- Average asking price: $${avgPrice.toLocaleString()}
- Most common makes: ${topMakes}
- Focus area: ${categoryLabel} and comparable offshore fishing vessels

**Full Listings:**

${boatSummaries}

Analyze this inventory using your expert framework. Be specific — reference actual boats from the list by year/make/model/price. Don't give generic advice; give opinionated, actionable intelligence that a serious buyer can use TODAY.`

  return callXAI(
    apiKey,
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { temperature: 0.6, maxTokens: 4096 },
  )
}
