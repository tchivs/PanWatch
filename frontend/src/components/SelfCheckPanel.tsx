import { useState } from 'react'
import { Stethoscope, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import { healthApi, type SelfCheckItem, type SelfCheckResult } from '@panwatch/api'
import { Button } from '@panwatch/base-ui/components/ui/button'
import { Switch } from '@panwatch/base-ui/components/ui/switch'
import { Badge } from '@panwatch/base-ui/components/ui/badge'

const CATEGORY_LABELS: Record<SelfCheckItem['category'], string> = {
  datasource: '数据源',
  ai: 'AI模型',
  notify: '通知渠道',
}

const CATEGORY_ORDER: SelfCheckItem['category'][] = ['datasource', 'ai', 'notify']

type StatusMeta = {
  label: string
  variant: 'success' | 'destructive' | 'outline'
  className: string
  Icon: typeof CheckCircle2
}

const STATUS_META: Record<SelfCheckItem['status'], StatusMeta> = {
  ok: { label: '通', variant: 'success', className: '', Icon: CheckCircle2 },
  slow: {
    label: '慢',
    variant: 'outline',
    className: 'border-amber-500/30 bg-amber-500/10 text-amber-600',
    Icon: AlertTriangle,
  },
  fail: { label: '断', variant: 'destructive', className: '', Icon: XCircle },
}

function StatusBadge({ status }: { status: SelfCheckItem['status'] }) {
  const meta = STATUS_META[status]
  const Icon = meta.Icon
  return (
    <Badge variant={meta.variant} className={meta.className}>
      <Icon className="w-3 h-3" />
      {meta.label}
    </Badge>
  )
}

export default function SelfCheckPanel() {
  const [result, setResult] = useState<SelfCheckResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notifySend, setNotifySend] = useState(false)

  const runCheck = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await healthApi.selfcheck(notifySend)
      setResult(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : '体检失败')
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  const summary = result?.summary
  const groups = CATEGORY_ORDER.map((category) => ({
    category,
    items: (result?.items || []).filter((it) => it.category === category),
  })).filter((g) => g.items.length > 0)

  return (
    <section id="sec-selfcheck" className="card p-4 md:p-6 lg:col-span-12">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-4 md:mb-5">
        <div>
          <h3 className="text-[12px] md:text-[13px] font-semibold text-foreground flex items-center gap-1.5">
            <Stethoscope className="w-3.5 h-3.5 text-muted-foreground" />
            系统自检
          </h3>
          <p className="text-[11px] text-muted-foreground mt-1">
            一键体检数据源、AI 模型与通知渠道的连通性，断连时给出修复建议。
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-[11px] text-muted-foreground cursor-pointer select-none">
            <Switch checked={notifySend} disabled={loading} onCheckedChange={setNotifySend} />
            含真实发送通知
          </label>
          <Button size="sm" className="h-8" onClick={runCheck} disabled={loading}>
            {loading ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                体检中
              </>
            ) : (
              <>
                <Stethoscope className="w-3.5 h-3.5" />
                一键体检
              </>
            )}
          </Button>
        </div>
      </div>

      {error && <div className="mb-3 text-[12px] text-rose-600">{error}</div>}

      {!result && !loading && !error && (
        <div className="text-[12px] text-muted-foreground text-center py-8">
          点击「一键体检」检测数据源、AI 模型与通知渠道是否正常。
        </div>
      )}

      {result && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="flex flex-wrap items-center gap-2 text-[12px]">
            <span className="text-muted-foreground">
              共 <span className="font-mono text-foreground/90">{summary?.total ?? 0}</span>
            </span>
            <Badge variant="success">
              <CheckCircle2 className="w-3 h-3" />
              通 {summary?.ok ?? 0}
            </Badge>
            <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-600">
              <AlertTriangle className="w-3 h-3" />
              慢 {summary?.slow ?? 0}
            </Badge>
            <Badge variant="destructive">
              <XCircle className="w-3 h-3" />
              断 {summary?.fail ?? 0}
            </Badge>
          </div>

          {summary && summary.total === 0 ? (
            <div className="rounded-xl border border-border/40 bg-accent/20 p-4 text-[12px] text-muted-foreground text-center">
              未配置 数据源 / AI / 通知，先去上方配置后再体检。
            </div>
          ) : (
            <div className="space-y-4">
              {groups.map((group) => (
                <div key={group.category} className="rounded-xl border border-border/40 bg-accent/20 p-3">
                  <div className="text-[12px] font-semibold text-foreground mb-2">
                    {CATEGORY_LABELS[group.category]}
                  </div>
                  <div className="space-y-2">
                    {group.items.map((item) => (
                      <div
                        key={`${item.category}:${item.key}`}
                        className="rounded-lg bg-background/60 px-3 py-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <StatusBadge status={item.status} />
                            <span className="text-[12px] font-medium text-foreground truncate">{item.name}</span>
                          </div>
                          <span className="text-[11px] font-mono text-muted-foreground flex-shrink-0">
                            {item.latency_ms}ms
                          </span>
                        </div>
                        {item.status === 'fail' && (
                          <div className="mt-1.5 space-y-1">
                            {item.error && (
                              <p className="text-[11px] text-muted-foreground/70 truncate" title={item.error}>
                                {item.error}
                              </p>
                            )}
                            {item.hint && (
                              <p className="text-[11px] text-rose-600 font-medium">{item.hint}</p>
                            )}
                          </div>
                        )}
                        {item.status !== 'fail' && item.note && (
                          <p className="mt-1.5 text-[11px] text-muted-foreground/70">{item.note}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
