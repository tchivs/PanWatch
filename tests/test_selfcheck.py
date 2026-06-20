"""系统自检:classify_hint(中文修复提示库)+ run_selfcheck(并发聚合)。"""

from __future__ import annotations

import asyncio

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import src.web.models  # noqa: F401
from src.web.database import Base


def _mem_db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)()


# --------------------------- classify_hint(纯函数)---------------------------

def test_hint_datasource_proxy():
    """CN 数据源连接类错误 → 提示代理 / trust_env。"""
    from src.core.selfcheck import classify_hint

    h = classify_hint("datasource", "Server disconnected without sending a response")
    assert "代理" in h or "trust_env" in h


def test_hint_db_locked():
    """database is locked → 提示并发 / 锁。"""
    from src.core.selfcheck import classify_hint

    h = classify_hint("datasource", "sqlite3.OperationalError: database is locked")
    assert "锁" in h or "并发" in h


def test_hint_ai_auth():
    """AI 401 → 提示 API Key / 鉴权。"""
    from src.core.selfcheck import classify_hint

    h = classify_hint("ai", "Error code: 401 - invalid_api_key")
    assert "Key" in h or "key" in h or "鉴权" in h


def test_hint_ai_model_not_found():
    """AI model 不存在 → 提示模型名。"""
    from src.core.selfcheck import classify_hint

    h = classify_hint("ai", "The model `gpt-x` does not exist (404)")
    assert "模型" in h


def test_hint_notify_invalid():
    """通知 URI 无效 → 提示配置 / 格式。"""
    from src.core.selfcheck import classify_hint

    h = classify_hint("notify", "Unsupported URL or invalid scheme")
    assert "配置" in h or "URI" in h or "格式" in h


# --------------------------- run_selfcheck(聚合)---------------------------

def test_run_selfcheck_aggregates(monkeypatch):
    """枚举启用项 → 并发 probe → 聚合 summary(total/ok/slow/fail)。"""
    from src.core import selfcheck
    from src.web.models import AIModel, AIService, DataSource, NotifyChannel

    db = _mem_db()
    try:
        db.add(DataSource(name="东财", type="quote", provider="eastmoney", config={}, enabled=True))
        db.add(NotifyChannel(name="TG", type="telegram", config={}, enabled=True))
        svc = AIService(name="deepseek", base_url="https://x", api_key="k")
        db.add(svc)
        db.flush()
        db.add(AIModel(name="ds-chat", model="deepseek-chat", service_id=svc.id))
        db.commit()

        async def fake_ds(source):
            return {"category": "datasource", "key": f"ds:{source.id}", "name": source.name,
                    "status": "ok", "latency_ms": 10, "error": None, "hint": ""}

        async def fake_ai(model, service):
            return {"category": "ai", "key": f"ai:{model.id}", "name": model.name,
                    "status": "fail", "latency_ms": 20, "error": "401", "hint": "key 错"}

        async def fake_nc(channel, send=False):
            return {"category": "notify", "key": f"nc:{channel.id}", "name": channel.name,
                    "status": "ok", "latency_ms": 5, "error": None, "hint": ""}

        monkeypatch.setattr(selfcheck, "probe_datasource", fake_ds)
        monkeypatch.setattr(selfcheck, "probe_ai_model", fake_ai)
        monkeypatch.setattr(selfcheck, "probe_notify_channel", fake_nc)

        res = asyncio.run(selfcheck.run_selfcheck(db=db))
        assert res["summary"] == {"total": 3, "ok": 2, "slow": 0, "fail": 1}
        assert {i["category"] for i in res["items"]} == {"datasource", "ai", "notify"}
    finally:
        db.close()


def test_run_selfcheck_empty_db():
    """无启用项 → 空看板,不报错。"""
    from src.core.selfcheck import run_selfcheck

    db = _mem_db()
    try:
        res = asyncio.run(run_selfcheck(db=db))
        assert res["summary"]["total"] == 0
        assert res["items"] == []
    finally:
        db.close()


# --------------------------- 端点 ---------------------------

def test_selfcheck_endpoint(monkeypatch):
    """端点调用 run_selfcheck 并原样返回看板。"""
    from src.web.api import health

    async def fake_run(*, notify_send=False):
        return {"items": [], "summary": {"total": 0, "ok": 0, "slow": 0, "fail": 0},
                "notify_send": notify_send}

    monkeypatch.setattr(health, "run_selfcheck", fake_run)
    res = asyncio.run(health.selfcheck(notify_send=True))
    assert res["summary"]["total"] == 0
    assert res["notify_send"] is True


def test_selfcheck_route_mounted():
    """/api/health/selfcheck 已挂载到 app。"""
    from src.web.app import app

    assert "/api/health/selfcheck" in set(app.openapi().get("paths", {}).keys())
