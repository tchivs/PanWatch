import { fetchAPI } from './client'

export interface SelfCheckItem {
  category: 'datasource' | 'ai' | 'notify'
  key: string
  name: string
  status: 'ok' | 'slow' | 'fail'
  latency_ms: number
  error: string | null
  /** 中文修复提示(仅 fail 时非空)。 */
  hint: string
  /** 例如通知"仅校验配置未真发"。 */
  note: string | null
}

export interface SelfCheckResult {
  items: SelfCheckItem[]
  summary: {
    total: number
    ok: number
    slow: number
    fail: number
  }
  notify_send: boolean
}

export const healthApi = {
  /** 系统自检(数据源/AI/通知连通性)。notifySend=true 会真实发送测试通知。 */
  selfcheck: (notifySend = false) =>
    fetchAPI<SelfCheckResult>('/health/selfcheck?notify_send=' + notifySend, { timeoutMs: 60000 }),
}
