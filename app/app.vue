<script setup lang="ts">
import {
  AlertTriangle,
  ExternalLink,
  Server,
  ShieldCheck,
  Wrench
} from 'lucide-vue-next'

type StatusPayload = {
  configured: boolean
  source: {
    baseUrl: string
    slug: string
  }
  page: {
    title: string
    description: string
    icon: string | null
  }
  overall: {
    tone: string
    label: string
    summary: string
    total: number
    up: number
    down: number
    pending: number
    maintenance: number
    avgUptime: number | null
    avgPing: number | null
  }
  incidents: Array<{
    title: string
    content: string
    style: string
    createdAt: string | null
  }>
  maintenanceList: Array<{
    title: string
    description: string
    startAt: string | null
    endAt: string | null
  }>
  groups: Array<{
    name: string
    monitors: Monitor[]
  }>
  updatedAt: string
}

type Monitor = {
  id: string
  name: string
  type: string
  url: string | null
  status: 0 | 1 | 2 | 3
  label: string
  tone: string
  uptime: number | null
  ping: number | null
  avgPing: number | null
  lastChecked: string | null
  tags: string[]
  beats: Beat[]
}

type Beat = {
  time: string | null
  status: 0 | 1 | 2 | 3
  ping: number | null
}

type OpenAIStatusPayload = {
  source: string
  feedUrl: string
  updatedAt: string
  items: OpenAIStatusItem[]
}

type OpenAIStatusItem = {
  id: string
  title: string
  summary: string
  status: string
  tone: 'active' | 'resolved'
  publishedAt: string | null
  link: string
}

const config = useRuntimeConfig()
const refreshSeconds = computed(() => Math.max(300, Number(config.public.refreshSeconds) || 300))

const { data, error, refresh } = await useFetch<StatusPayload>('/api/status', {
  default: () => null
})
const { data: openaiStatus, error: openaiStatusError, refresh: refreshOpenAIStatus } = await useFetch<OpenAIStatusPayload>('/api/openai-status', {
  default: () => null
})

const pageTitle = computed(() => {
  const customTitle = String(config.public.statusTitle || '').trim()
  return customTitle || data.value?.page.title || '服务状态'
})
const pageDescription = computed(() => data.value?.page.description || '实时服务健康状态')
const overall = computed(() => data.value?.overall)
const groups = computed(() => data.value?.groups || [])
const incidents = computed(() => data.value?.incidents || [])
const maintenanceList = computed(() => data.value?.maintenanceList || [])
const openaiItems = computed(() => openaiStatus.value?.items || [])
const hasOpenAIStatus = computed(() => openaiItems.value.length > 0 || Boolean(openaiStatusError.value))
const updatedAt = computed(() => data.value?.updatedAt || null)
const heroTitle = computed(() => overall.value?.label || '正在读取状态')
const heroSummary = computed(() => overall.value?.summary || '正在同步 Uptime Kuma 状态页数据')
const healthScore = computed(() => {
  if (typeof overall.value?.avgUptime === 'number') {
    return Math.round(overall.value.avgUptime)
  }

  if (!overall.value?.total) {
    return 0
  }

  return Math.round(((overall.value.up + overall.value.maintenance * 0.65) / overall.value.total) * 100)
})
const overallIcon = computed(() => {
  if (overall.value?.tone === 'down' || overall.value?.tone === 'degraded') {
    return AlertTriangle
  }

  if (overall.value?.tone === 'maintenance') {
    return Wrench
  }

  return ShieldCheck
})
const statusCounts = computed(() => {
  const current = overall.value

  return [
    { label: '正常服务', value: current?.up ?? 0, tone: 'up' },
    { label: '故障服务', value: current?.down ?? 0, tone: 'down' },
    { label: '等待检测', value: current?.pending ?? 0, tone: 'pending' },
    { label: '维护服务', value: current?.maintenance ?? 0, tone: 'maintenance' }
  ]
})

useHead(() => ({
  title: pageTitle.value
}))

let refreshTimer: ReturnType<typeof window.setInterval> | undefined

onMounted(() => {
  refreshTimer = window.setInterval(() => {
    refresh()
    refreshOpenAIStatus()
  }, refreshSeconds.value * 1000)
})

onBeforeUnmount(() => {
  if (refreshTimer) {
    window.clearInterval(refreshTimer)
  }
})

function statusClass(tone?: string) {
  return `is-${tone || 'pending'}`
}

function beatClass(status: 0 | 1 | 2 | 3) {
  const toneMap = {
    0: 'is-down',
    1: 'is-up',
    2: 'is-pending',
    3: 'is-maintenance'
  }

  return toneMap[status]
}

function statusLabel(status: 0 | 1 | 2 | 3) {
  const labelMap = {
    0: '故障',
    1: '正常',
    2: '等待',
    3: '维护'
  }

  return labelMap[status]
}

function formatMonitorType(value: string | null | undefined) {
  const typeMap: Record<string, string> = {
    group: '分组',
    http: 'HTTP',
    keyword: '关键词',
    json: 'JSON',
    port: '端口',
    ping: 'Ping',
    dns: 'DNS',
    docker: 'Docker',
    push: '推送',
    steam: 'Steam',
    grpc: 'gRPC',
    mqtt: 'MQTT',
    mysql: 'MySQL',
    postgres: 'PostgreSQL',
    mongodb: 'MongoDB',
    redis: 'Redis'
  }
  const key = String(value || '').toLowerCase()

  return typeMap[key] || value || '服务'
}

function formatBeatTooltip(beat: Beat) {
  return `${formatDateTimeWithSeconds(beat.time)} · ${statusLabel(beat.status)} · 延迟 ${formatPing(beat.ping)}`
}

function recentBeats(beats: Beat[]) {
  return beats.slice(-36)
}

function beatHeight(_beat: Beat) {
  return '52px'
}

function beatStyle(beat: Beat) {
  return {
    '--beat-height': beatHeight(beat),
    '--beat-color': beatColor(beat)
  }
}

function beatColor(beat: Beat) {
  if (beat.status === 0) {
    return '#c64545'
  }

  if (beat.status === 2) {
    return '#8e8b82'
  }

  return '#5db872'
}

function formatPercent(value: number | null | undefined) {
  if (typeof value !== 'number') {
    return '暂无'
  }

  return `${Math.round(value)}%`
}

function formatPing(value: number | null | undefined) {
  if (typeof value !== 'number') {
    return '暂无'
  }

  return `${Math.round(value)} ms`
}

function formatRelativeTime(value: string | null | undefined) {
  if (!value) {
    return '未检测'
  }

  const date = new Date(value)
  const diffSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000))

  if (diffSeconds < 60) {
    return '刚刚'
  }

  const diffMinutes = Math.floor(diffSeconds / 60)

  if (diffMinutes < 60) {
    return `${diffMinutes} 分钟前`
  }

  const diffHours = Math.floor(diffMinutes / 60)

  if (diffHours < 24) {
    return `${diffHours} 小时前`
  }

  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return '暂无'
  }

  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
}

function formatDateTimeWithSeconds(value: string | null | undefined) {
  if (!value) {
    return '暂无'
  }

  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
}

function openaiItemClass(tone: OpenAIStatusItem['tone']) {
  return `is-${tone}`
}
</script>

<template>
  <main class="page-shell" :class="statusClass(overall?.tone)">
    <div v-if="error" class="notice is-error">
      <AlertTriangle :size="18" />
      <span>{{ error.statusMessage || error.message }}</span>
    </div>

    <div v-else-if="data && !data.configured" class="notice">
      <AlertTriangle :size="18" />
      <span>正在显示示例数据。复制 .env.example 为 .env 后填入 Uptime Kuma 地址即可接入真实状态页。</span>
    </div>

    <section class="status-hero">
      <div class="hero-copy">
        <p class="eyebrow">实时状态</p>
        <h2>{{ heroTitle }}</h2>
        <p>{{ heroSummary }}。{{ pageDescription }}</p>

        <div class="hero-actions">
          <span class="status-chip" :class="statusClass(overall?.tone)">
            <span aria-hidden="true" />
            {{ overall?.label || '加载中' }}
          </span>
          <span class="source-pill">
            <Server :size="15" />
            {{ overall?.total ?? 0 }} 项服务
          </span>
        </div>
      </div>

      <aside class="operations-panel" :class="statusClass(overall?.tone)" :style="{ '--score': `${healthScore}%` }">
        <div class="panel-heading">
          <span>健康指数</span>
          <component :is="overallIcon" :size="22" />
        </div>
        <strong class="health-score">{{ healthScore }}</strong>
        <div class="health-track" aria-hidden="true">
          <span />
        </div>
        <dl class="panel-stats">
          <div>
            <dt>24 小时可用率</dt>
            <dd>{{ formatPercent(overall?.avgUptime) }}</dd>
          </div>
          <div>
            <dt>平均延迟</dt>
            <dd>{{ formatPing(overall?.avgPing) }}</dd>
          </div>
          <div>
            <dt>最后更新</dt>
            <dd>{{ formatRelativeTime(updatedAt) }}</dd>
          </div>
        </dl>
      </aside>
    </section>

    <section class="status-counts" aria-label="状态汇总">
      <article v-for="item in statusCounts" :key="item.label" class="count-card" :class="statusClass(item.tone)">
        <span>{{ item.label }}</span>
        <strong>{{ item.value }}</strong>
      </article>
    </section>

    <section v-if="incidents.length || maintenanceList.length" class="alerts-band">
      <article v-for="incident in incidents" :key="`incident-${incident.title}-${incident.createdAt}`" class="alert-card">
        <AlertTriangle :size="20" />
        <div>
          <div class="alert-heading">
            <strong>{{ incident.title }}</strong>
            <time>{{ formatDateTime(incident.createdAt) }}</time>
          </div>
          <p>{{ incident.content }}</p>
        </div>
      </article>

      <article v-for="item in maintenanceList" :key="`maintenance-${item.title}-${item.startAt}`" class="alert-card is-maintenance">
        <Wrench :size="20" />
        <div>
          <div class="alert-heading">
            <strong>{{ item.title }}</strong>
            <time>{{ formatDateTime(item.startAt) }} - {{ formatDateTime(item.endAt) }}</time>
          </div>
          <p>{{ item.description }}</p>
        </div>
      </article>
    </section>

    <div class="monitor-layout" :class="{ 'has-rail': hasOpenAIStatus }">
      <div class="service-stack">
        <section v-for="group in groups" :key="group.name" class="service-section">
          <div class="section-heading">
            <div>
              <p>监控分组</p>
              <h2>{{ group.name }}</h2>
            </div>
            <span>{{ group.monitors.length }} 项服务</span>
          </div>

          <div class="service-grid">
            <article v-for="monitor in group.monitors" :key="monitor.id" class="service-card" :class="statusClass(monitor.tone)">
              <div class="service-header">
                <div>
                  <span class="service-dot" :class="statusClass(monitor.tone)" aria-hidden="true" />
                  <div>
                    <h3>{{ monitor.name }}</h3>
                    <p>{{ formatMonitorType(monitor.type) }}</p>
                  </div>
                </div>
                <span class="service-state">{{ monitor.label }}</span>
              </div>

              <div class="service-snapshot">
                <div>
                  <span>24 小时可用率</span>
                  <strong>{{ formatPercent(monitor.uptime) }}</strong>
                </div>
                <div>
                  <span>延迟</span>
                  <strong>{{ formatPing(monitor.ping ?? monitor.avgPing) }}</strong>
                </div>
                <div>
                  <span>最近检测</span>
                  <strong>{{ formatRelativeTime(monitor.lastChecked) }}</strong>
                </div>
              </div>

              <div
                class="sparkline"
                aria-label="近期心跳记录"
                :style="{ '--beat-count': String(recentBeats(monitor.beats).length) }"
              >
                <span
                  v-for="(beat, index) in recentBeats(monitor.beats)"
                  :key="`${monitor.id}-${beat.time || index}`"
                  class="beat"
                  :class="beatClass(beat.status)"
                  :style="beatStyle(beat)"
                  :aria-label="formatBeatTooltip(beat)"
                  tabindex="0"
                >
                  <span class="beat-tooltip" role="tooltip">
                    <strong>{{ statusLabel(beat.status) }}</strong>
                    <span>{{ formatDateTimeWithSeconds(beat.time) }}</span>
                    <span>延迟 {{ formatPing(beat.ping) }}</span>
                  </span>
                </span>
              </div>
            </article>
          </div>
        </section>
      </div>

      <aside v-if="hasOpenAIStatus" class="official-rail" aria-label="OpenAI 官方状态">
        <section class="openai-section">
          <div class="section-heading">
            <div>
              <p>外部官方消息</p>
              <h2>OpenAI 状态</h2>
            </div>
            <span>RSS 自动同步</span>
          </div>

          <div v-if="openaiStatusError" class="notice is-error">
            <AlertTriangle :size="18" />
            <span>{{ openaiStatusError.statusMessage || openaiStatusError.message }}</span>
          </div>

          <div v-else class="openai-list">
            <a
              v-for="item in openaiItems"
              :key="item.id"
              class="openai-item"
              :class="openaiItemClass(item.tone)"
              :href="item.link"
              target="_blank"
              rel="noreferrer"
            >
              <div>
                <div class="openai-meta">
                  <span>{{ item.status }}</span>
                  <time>{{ formatRelativeTime(item.publishedAt) }}</time>
                </div>
                <h3>{{ item.title }}</h3>
                <p>{{ item.summary }}</p>
              </div>
              <ExternalLink :size="16" />
            </a>
          </div>
        </section>
      </aside>
    </div>
  </main>
</template>
