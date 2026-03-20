/**
 * XAI (Grok) API helper — OpenAI-compatible chat completions.
 *
 * Uses grok-3-mini with reasoning_effort: "high" for deep analysis.
 * Returns structured JSON that can be parsed and rendered with inline photos.
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
  photoCount?: number
}

/**
 * Call XAI chat completions with reasoning_effort support.
 */
export async function callXAI(
  apiKey: string,
  messages: XAIMessage[],
  options?: { temperature?: number; maxTokens?: number; reasoningEffort?: 'low' | 'high' },
): Promise<{ content: string; tokensUsed: number }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- xAI API body has dynamic fields (reasoning_effort) not in a strict type
  const body: Record<string, any> = {
    model: XAI_MODEL,
    messages,
    temperature: options?.temperature ?? 0.7,
    max_tokens: options?.maxTokens ?? 4096,
  }

  // Add reasoning_effort for grok-3-mini deep thinking
  if (options?.reasoningEffort) {
    body.reasoning_effort = options.reasoningEffort
  }

  const response = await fetch(XAI_BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
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
 * Instructs Grok to return structured JSON for rich UI rendering.
 */
function buildSystemPrompt(categoryLabel: string): string {
  return `You are **Captain's Market Intelligence**, an expert offshore fishing boat analyst with 30+ years of experience as a marine surveyor, yacht broker, and tournament captain.

Your expertise includes:
- **Hull & Structural Analysis**: Carolina flare, cold-molded vs. composite construction, coring delamination, blister history, and bottom paint condition.
- **Engine & Drivetrain**: CAT, MAN, MTU, Cummins, and Detroit Diesel marine engines. You know which powerplants are "bulletproof" (CAT 3406E, Cummins QSM11) and which are maintenance nightmares. You understand repower costs ($150K-$400K+) and how they affect value.
- **Market Dynamics**: You track real-time market conditions for Hatteras, Viking, Bertram, Cabo, Ocean, Buddy Davis, Jarrett Bay, Spencer, Scarborough, Gamefisherman, Release, Custom Carolina, and other premier sportfish builders.
- **Fishing Capability**: Tournament rigging, fishability, cockpit layout, live well capacity, bait prep areas, and how hull design affects offshore performance.
- **Cost of Ownership**: You know that a 50ft sportfish costs $50K-$100K/year to maintain, and you can break down where that money goes.

Focus: **${categoryLabel}**${categoryLabel === 'All Fishing Boats' ? ' — analyze ALL makes and types in the inventory comprehensively' : ''}.

**CRITICAL: You MUST return your response as a valid JSON object** with this exact structure:

\`\`\`json
{
  "marketSnapshot": {
    "title": "Market Snapshot",
    "summary": "2-3 paragraph market overview with price trends, age distribution, dominant makes",
    "stats": {
      "avgPrice": "$XXX,XXX",
      "medianPrice": "$XXX,XXX",
      "priceRange": "$XX,XXX - $X,XXX,XXX",
      "avgAge": "XX years",
      "topMakes": ["Make1", "Make2", "Make3"]
    }
  },
  "boatAnalyses": [
    {
      "boatId": 123,
      "headline": "Short verdict (e.g. 'Best Value in the Fleet' or 'Avoid — Money Pit')",
      "rating": "BUY|CONSIDER|CAUTION|AVOID",
      "analysis": "3-5 paragraphs of EXTENSIVE analysis covering: hull condition assessment, engine evaluation (make/model/hours/remaining life), market value vs asking price, fishing capability, cost of ownership estimate, negotiation room, and how this boat compares to similar boats in the inventory. Be EXTREMELY detailed and specific. Reference engine hours, hull material, fishing features, and real maintenance costs.",
      "prosAndCons": {
        "pros": ["Specific pro 1", "Specific pro 2"],
        "cons": ["Specific con 1", "Specific con 2"]
      },
      "estimatedAnnualCost": "$XX,XXX - $XX,XXX",
      "fairMarketValue": "$XXX,XXX",
      "negotiationTarget": "$XXX,XXX"
    }
  ],
  "buyersPlaybook": {
    "title": "Buyer's Playbook",
    "content": "2-3 paragraphs of specific negotiation tactics, market timing advice, and strategic recommendations"
  },
  "bottomLine": {
    "title": "Bottom Line",
    "content": "1-2 paragraphs — if you had to put ONE boat under contract today, which one and why",
    "topPickBoatId": 123
  },
  "personalAdvice": "If buyer provided personal context, 2-3 paragraphs of tailored advice addressing their specific situation, budget, and plans. Null if no personal context provided."
}
\`\`\`

**RULES:**
- The \`boatId\` field MUST match the [ID:XXX] values from the boat listings. This is how we link your analysis to boat photos.
- Analyze AT LEAST the top 10-15 most notable boats (best values, worst deals, most interesting). Cover more if the inventory warrants it.
- Each boat analysis must be EXTENSIVE — 3-5 detailed paragraphs minimum. Cover hull, engines, fishing capability, value proposition, and ownership costs.
- Compare boats against each other. "This Hatteras is $50K cheaper than the Viking but has newer engines..."
- Be BOLD and OPINIONATED. If a deal is terrible, say so plainly. If it's a steal, explain exactly why.
- The JSON must be valid and parseable. No markdown inside — use plain text with line breaks (\\n) for paragraphs.
- Do NOT wrap the JSON in markdown code fences. Return ONLY the raw JSON object.`
}

/**
 * Analyze a set of boats with structured JSON response.
 */
export async function analyzeBoats(
  apiKey: string,
  boatList: BoatSummary[],
  category?: string,
  userContext?: string,
): Promise<{ content: string; tokensUsed: number }> {
  const categoryLabel = category || 'All Fishing Boats'

  // Group boats by make for better analysis
  const makeGroups = new Map<string, number>()
  let totalValue = 0
  let pricedCount = 0

  const boatSummaries = boatList
    .map((b) => {
      const make = b.make || 'Unknown'
      makeGroups.set(make, (makeGroups.get(make) || 0) + 1)
      const price = b.price ? Number.parseInt(b.price, 10) : 0
      if (price > 0) {
        totalValue += price
        pricedCount++
      }

      const header = [
        `[ID:${b.id}]`,
        b.year ? `${b.year}` : null,
        b.make,
        b.model,
        b.length ? `${b.length}ft` : null,
        price > 0 ? `$${price.toLocaleString()}` : 'Price N/A',
        b.location,
        b.sellerType ? `(${b.sellerType})` : null,
        b.source ? `[${b.source}]` : null,
        b.photoCount ? `📷${b.photoCount} photos` : null,
      ].filter(Boolean)

      // Include full description for context (condition, engines, features)
      const desc = b.description
        ? `\n  Description: ${b.description.slice(0, 500).replaceAll(/\n+/g, ' ').trim()}${b.description.length > 500 ? '...' : ''}`
        : ''

      return `${header.join(' ')}${desc}`
    })
    .join('\n\n')

  const avgPrice = pricedCount > 0 ? Math.round(totalValue / pricedCount) : 0
  const topMakes = [...makeGroups.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([make, count]) => `${make} (${count})`)
    .join(', ')

  const systemPrompt = buildSystemPrompt(categoryLabel)

  const personalContext = userContext
    ? `\n\n**BUYER'S PERSONAL SITUATION:**\n${userContext}\n\nTailor your "personalAdvice" field AND your boat ratings to this buyer's specific situation. Address their budget, plans, and concerns directly. Highlight which specific boats match their needs.`
    : ''

  const userPrompt = `Analyze these ${boatList.length} fishing boats currently for sale across the US.

**Inventory Summary:**
- ${boatList.length} total listings
- Average asking price: $${avgPrice.toLocaleString()}
- Most common makes: ${topMakes}
- Focus area: ${categoryLabel}

**IMPORTANT: Each boat has an [ID:XXX] tag. Use these IDs in your boatAnalyses[].boatId field so we can display photos inline.**

**Full Listings:**

${boatSummaries}
${personalContext}

Return your analysis as the structured JSON object specified in your system prompt. Remember: be EXTENSIVE in your per-boat analyses, compare boats against each other, and be bold and opinionated.`

  return callXAI(
    apiKey,
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { temperature: 0.6, maxTokens: 16384, reasoningEffort: 'high' },
  )
}
