import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, AlertTriangle, XCircle, RefreshCw } from 'lucide-react'
import { healthApi, type SelfCheckItem } from '@panwatch/api'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@panwatch/base-ui/components/ui/dialog'
import { Button } from '@panwatch/base-ui/components/ui/button'
import { Switch } from '@panwatch/base-ui/components/ui/switch'
import { Badge } from '@panwatch/base-ui/components/ui/badge'

interface SelfCheckModalProps {
  open: boolean
  onClose: () => void
}

type Status = SelfCheckItem['status'] // 'ok' | 'slow' | 'fail'

const CATEGORY_LABELS: Record<string, string> = {
  datasource: '数据源',
  ai: 'AI模型',
  notify: '通知渠道',
}

/** 同时在飞的探测请求上限(简单并发池);每出一个结果就追加一行。 */
const CONCURRENCY = 4

const STATUS_META: Record<Status, {
  label: string
  variant: 'success' | 'destructive' | 'outline'
  className: string
  Icon: typeof CheckCircle2
}> = {
  ok: { label: '通', variant: 'success', className: '', Icon: CheckCircle2 },
  slow: {
    label: '慢',
    variant: 'outline',
    className: 'border-amber-500/30 bg-amber-500/10 text-amber-600',
    Icon: AlertTriangle,
  },
  fail: { label: '断', variant: 'destructive', className: '', Icon: XCircle },
}

function StatusBadge({ status }: { status: Status }) {
  const meta = STATUS_META[status]
  const Icon = meta.Icon
  return (
    <Badge variant={meta.variant} className={meta.className}>
      <Icon className="w-3 h-3" />
      {meta.label}
    </Badge>
  )
}

export default function SelfCheckModal({ open, onClose }: SelfCheckModalProps) {
  // rows 只放「已出结果」的项,逐个追加(出来一个显示一个);total 来自清单,用于进度。
  const [rows, setRows] = useState<SelfCheckItem[]>([])
  const [total, setTotal] = useState(0)
  const [running, setRunning] = useState(false)
  const [notifySend, setNotifySend] = useState(false)
  const [listError, setListError] = useState('')
  // 自增运行序号:切换/重跑时让上一轮在飞的请求结果作废。
  const runIdRef = useRef(0)

  const okCount = rows.filter((r) => r.status === 'ok' || r.status === 'slow').length
  const failCount = rows.filter((r) => r.status === 'fail').length
  const done = rows.length
  const progress = total === 0 ? 0 : Math.round((done / total) * 100)
  const finished = !running && total > 0 && done >= total

  const runCheck = useCallback(async () => {
    const runId = ++runIdRef.current
    setRunning(true)
    setListError('')
    setRows([])
    setTotal(0)

    // 1) 先取待检清单(不探测),拿到 total。
    let items: Array<{ category: string; key: string; name: string }>
    try {
      const res = await healthApi.selfcheckList()
      items = res.items || []
    } catch (e) {
      if (runId !== runIdRef.current) return
      setListError(e instanceof Error ? e.message : '获取自检清单失败')
      setRunning(false)
      return
    }
    if (runId !== runIdRef.current) return
    setTotal(items.length)
    if (items.length === 0) {
      setRunning(false)
      return
    }

    // 2) ≤CONCURRENCY 并发逐项探测,每出一个结果就 append 一行。
    let cursor = 0
    const append = (row: SelfCheckItem) => {
      if (runId !== runIdRef.current) return
      setRows((prev) => [...prev, row])
    }
    const worker = async () => {
      while (true) {
        if (runId !== runIdRef.current) return
        const idx = cursor++
        if (idx >= items.length) return
        const it = items[idx]
        try {
          const res = await healthApi.selfcheckKeys([it.key], notifySend)
          const probed = res.items?.[0]
          append(probed ?? {
            category: it.category as SelfCheckItem['category'], key: it.key, name: it.name,
            status: 'fail', latency_ms: 0, error: '未返回检查结果',
            hint: '检查请求失败,稍后重试', note: null,
          })
        } catch (e) {
          append({
            category: it.category as SelfCheckItem['category'], key: it.key, name: it.name,
            status: 'fail', latency_ms: 0,
            error: e instanceof Error ? e.message : '请求失败',
            hint: '检查请求失败,稍后重试', note: null,
          })
        }
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, items.length) }, () => worker()),
    )
    if (runId !== runIdRef.current) return
    setRunning(false)
  }, [notifySend])

  // 打开自动开跑;关闭让在飞请求作废。
  useEffect(() => {
    if (open) void runCheck()
    else runIdRef.current++
    // 仅依赖 open;notifySend 变更经「重新检查」触发。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const heroGradient = 'bg-gradient-to-br from-violet-500 via-purple-500 to-indigo-500'

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>系统自检</DialogTitle>
        </DialogHeader>

        {/* 渐变 Hero:进度条 + 总数/正常/异常 */}
        <div className={`relative overflow-hidden rounded-2xl ${heroGradient} p-4 text-white shadow-lg`}>
          <div className="flex items-center justify-between gap-2">
            <div className="text-[13px] font-semibold">
              {running ? '正在检查…' : finished ? '检查完成' : '准备检查'}
            </div>
            <div className="text-[12px] font-mono opacity-90">{progress}%</div>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/25">
            <div
              className="h-full rounded-full bg-white transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-[22px] font-bold leading-none tabular-nums">{total}</div>
              <div className="mt-1 text-[11px] opacity-80">总数</div>
            </div>
            <div>
              <div className="text-[22px] font-bold leading-none tabular-nums">{okCount}</div>
              <div className="mt-1 text-[11px] opacity-80">正常</div>
            </div>
            <div>
              <div className="text-[22px] font-bold leading-none tabular-nums">{failCount}</div>
              <div className="mt-1 text-[11px] opacity-80">异常</div>
            </div>
          </div>
          {finished && failCount > 0 && (
            <div className="mt-3 rounded-lg bg-white/15 px-3 py-1.5 text-[11px]">
              发现 {failCount} 项异常,请查看下方修复建议。
            </div>
          )}
        </div>

        {/* 操作区:真实发送通知 + 重新检查 */}
        <div className="mt-4 flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-[12px] text-muted-foreground cursor-pointer select-none">
            <Switch checked={notifySend} disabled={running} onCheckedChange={setNotifySend} />
            含真实发送通知
          </label>
          <Button size="sm" className="h-8" onClick={() => void runCheck()} disabled={running}>
            <RefreshCw className={`w-3.5 h-3.5 ${running ? 'animate-spin' : ''}`} />
            重新检查
          </Button>
        </div>

        {listError && <div className="mt-3 text-[12px] text-rose-600">{listError}</div>}
        {!listError && total === 0 && !running && (
          <div className="mt-4 rounded-xl border border-border/40 bg-accent/20 p-4 text-center text-[12px] text-muted-foreground">
            未配置 数据源 / AI / 通知,先去设置里配置后再自检。
          </div>
        )}

        {/* 结果:逐项追加(出来一个显示一个) */}
        <div className="mt-4 space-y-2">
          {rows.map((item) => (
            <div
              key={`${item.category}:${item.key}`}
              className="rounded-lg border border-border/40 bg-accent/20 px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <StatusBadge status={item.status} />
                  <span className="truncate text-[12px] font-medium text-foreground">{item.name}</span>
                  <span className="flex-shrink-0 text-[10px] text-muted-foreground/60">
                    {CATEGORY_LABELS[item.category] ?? item.category}
                  </span>
                </div>
                <span className="flex-shrink-0 font-mono text-[11px] text-muted-foreground">
                  {item.latency_ms}ms
                </span>
              </div>
              {item.status === 'fail' && (
                <div className="mt-1.5 space-y-1">
                  {item.error && (
                    <p className="truncate text-[11px] text-muted-foreground/70" title={item.error}>
                      {item.error}
                    </p>
                  )}
                  {item.hint && <p className="text-[11px] font-medium text-rose-600">{item.hint}</p>}
                </div>
              )}
              {item.status !== 'fail' && item.note && (
                <p className="mt-1.5 text-[11px] text-muted-foreground/70">{item.note}</p>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
