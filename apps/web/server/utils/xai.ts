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
 * Analyze a set of boats with a Hatteras-focused fishing boat analysis prompt.
 */
export async function analyzeBoats(
  apiKey: string,
  boatList: BoatSummary[],
  category?: string,
): Promise<{ content: string; tokensUsed: number }> {
  const categoryLabel = category || 'Hatteras'
  const boatSummaries = boatList.map((b) => {
    const parts = [
      b.year ? `${b.year}` : null,
      b.make,
      b.model,
      b.length ? `${b.length}ft` : null,
      b.price ? `$${Number.parseInt(b.price, 10).toLocaleString()}` : 'Price N/A',
      b.location,
      b.sellerType ? `(${b.sellerType})` : null,
    ].filter(Boolean)
    return `- ${parts.join(' ')}`
  }).join('\n')

  const systemPrompt = `You are an expert marine surveyor and sport fishing boat analyst specializing in ${categoryLabel} and similar offshore fishing vessels. You provide detailed, actionable market analyses for buyers looking at 40-60 foot fishing boats. You understand hull construction, engine configurations, maintenance costs, resale trends, and what separates a great deal from a money pit.`

  const userPrompt = `Analyze these ${boatList.length} sport fishing boats currently for sale in Texas. Focus on the ${categoryLabel} category and similar offshore fishing vessels in the 40-60 foot range.

Here are the listings:

${boatSummaries}

Please provide:

1. **Market Overview** — What does this inventory tell us about the current 40-60ft fishing boat market in Texas? Price trends, availability, age distribution.

2. **Top Picks** — Which 3-5 boats represent the best value? Consider: year/price ratio, make reputation, likely condition based on age, and resale potential. Flag any suspiciously low prices.

3. **${categoryLabel} Analysis** — For any ${categoryLabel} boats in the list (or similar makes like Viking, Bertram, Cabo), provide:
   - Expected maintenance costs at this age
   - Engine repower considerations
   - Hull condition expectations
   - Fair market value assessment vs. asking price

4. **Buyer Recommendations** — For someone looking for a 40-60ft fishing boat to use in the Gulf of Mexico:
   - Best makes to target at different budget levels
   - Red flags to watch for in these listings
   - Negotiation guidance (how much room typically exists?)
   - Survey and sea trial priorities

5. **Quick Verdict** — One-paragraph summary: where should a buyer focus their search?

Be specific, reference actual boats from the list by make/model/year, and don't sugarcoat — if something looks like a bad deal, say so.`

  return callXAI(
    apiKey,
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { temperature: 0.6, maxTokens: 4096 },
  )
}
