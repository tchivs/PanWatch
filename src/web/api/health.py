"""系统自检 API。"""

from fastapi import APIRouter, Query

from src.core.selfcheck import run_selfcheck

router = APIRouter()


@router.get("/selfcheck")
async def selfcheck(
    notify_send: bool = Query(False, description="是否真实发送通知测试(默认只校验配置不发送)"),
):
    """一键体检 数据源 / AI / 通知,返回看板(状态/延迟/中文修复提示)+ summary。"""
    return await run_selfcheck(notify_send=notify_send)
