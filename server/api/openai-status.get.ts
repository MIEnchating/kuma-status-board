import { createError } from 'h3'
import { XMLParser } from 'fast-xml-parser'

type FeedItem = {
  id: string
  title: string
  summary: string
  status: string
  tone: 'active' | 'resolved'
  publishedAt: string | null
  link: string
}

const parser = new XMLParser({
  attributeNamePrefix: '@_',
  cdataPropName: '#cdata',
  ignoreAttributes: false,
  trimValues: true
})

export default defineCachedEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const feedUrl = String(config.openaiStatusFeedUrl || 'https://status.openai.com/feed.atom')

  try {
    const xml = await $fetch<string>(feedUrl, {
      responseType: 'text',
      headers: {
        accept: 'application/atom+xml, application/rss+xml, application/xml, text/xml'
      }
    })
    const parsed = parser.parse(xml)
    const feed = parsed.feed || parsed.rss?.channel || {}
    const rawItems = normalizeArray(feed.entry || feed.item)
    const items = rawItems.map(normalizeFeedItem).filter((item): item is FeedItem => Boolean(item)).slice(0, 5)

    return {
      source: textValue(feed.title) || 'OpenAI status',
      feedUrl,
      updatedAt: normalizeDateTime(textValue(feed.updated || feed.lastBuildDate)) || new Date().toISOString(),
      items
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown OpenAI status feed error'

    throw createError({
      statusCode: 502,
      statusMessage: '无法读取 OpenAI 官方状态消息',
      message
    })
  }
}, {
  maxAge: 300,
  name: 'openai-status-feed-raw'
})

function normalizeFeedItem(raw: Record<string, unknown>): FeedItem | null {
  const title = cleanText(textValue(raw.title))
  const rawSummary = textValue(raw.summary || raw.description || raw.content)
  const summary = cleanText(rawSummary)
  const link = normalizeOpenAIUrl(linkValue(raw.link) || textValue(raw.id || raw.guid))
  const publishedAt = normalizeDateTime(textValue(raw.updated || raw.published || raw.pubDate))

  if (!title) {
    return null
  }

  const status = extractStatus(rawSummary)

  return {
    id: textValue(raw.id || raw.guid) || link || title,
    title,
    summary,
    status: translateStatus(status),
    tone: status.toLowerCase() === 'resolved' ? 'resolved' : 'active',
    publishedAt,
    link
  }
}

function normalizeArray<T>(value: T | T[] | undefined): T[] {
  if (!value) {
    return []
  }

  return Array.isArray(value) ? value : [value]
}

function textValue(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value)
  }

  if (Array.isArray(value)) {
    return textValue(value[0])
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>

    return textValue(record['#cdata'] || record['#text'] || record._text)
  }

  return ''
}

function linkValue(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }

  if (Array.isArray(value)) {
    const alternate = value.find((item) => {
      const record = item as Record<string, unknown>

      return record?.['@_rel'] === 'alternate' || !record?.['@_rel']
    })

    return linkValue(alternate)
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>

    return textValue(record['@_href'] || record.href)
  }

  return ''
}

function extractStatus(summary: string) {
  const match = summary.match(/status:\s*([a-z ]+)/i)

  return match?.[1]?.trim() || 'Update'
}

function translateStatus(status: string) {
  const key = status.toLowerCase()
  const map: Record<string, string> = {
    resolved: '已恢复',
    investigating: '调查中',
    identified: '已定位',
    monitoring: '观察中',
    update: '更新'
  }

  return map[key] || status
}

function cleanText(value: string) {
  return decodeEntities(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/^status:\s*[a-z ]+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function decodeEntities(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function normalizeDateTime(value: string | null | undefined) {
  if (!value) {
    return null
  }

  const date = new Date(value)

  return Number.isNaN(date.getTime()) ? value : date.toISOString()
}

function normalizeOpenAIUrl(value: string) {
  if (!value) {
    return 'https://status.openai.com/'
  }

  return value.replace('https://status.openai.com//', 'https://status.openai.com/')
}
