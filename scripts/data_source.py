"""
鋼鐵英雄紀元 2.0 — 資料來源開關 (GM 後台「🛰️ 資料來源」)
=====================================================================
新資料庫 game_config 內：
  data_source_config           {"mode": "mirror" | "strava", "changedAt": "...", "history": [...]}
      mirror (預設)：鏡像舊資料庫，新 repo 的 Strava 爬蟲只報到不抓
      strava       ：新 repo 自己抓 Strava，鏡像同步只報到不複製
  data_source_status_mirror    鏡像同步最後一次執行狀態 (給 GM 後台顯示)
  data_source_status_crawler   Strava 爬蟲最後一次執行狀態 (給 GM 後台顯示)
兩個 GitHub 排程都會一直跑，但每次執行前先讀這個開關，只有輪到的那一個會真的動作。
GM 後台按鈕「不會」去改 GitHub 設定 (不需要 GitHub 金鑰，比較安全)。
"""
import json
from datetime import datetime, timedelta, timezone

import requests

CONFIG_KEY = "data_source_config"
TAIPEI = timezone(timedelta(hours=8))


def now_str():
    return datetime.now(TAIPEI).strftime("%Y/%m/%d %H:%M:%S")


def _headers(key):
    return {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}


def get_mode(url, key):
    """回傳 'mirror' / 'strava'；讀取失敗回傳 None (呼叫端應中止，不要猜)。"""
    try:
        r = requests.get(f"{url}/rest/v1/game_config?key=eq.{CONFIG_KEY}&select=value", headers=_headers(key), timeout=15)
        r.raise_for_status()
        rows = r.json()
    except Exception as e:  # noqa: BLE001
        print(f"⚠️ 讀取資料來源開關失敗：{e}")
        return None
    if not rows:
        return "mirror"  # 尚未設定 = 平行測試期
    val = rows[0].get("value") if isinstance(rows[0], dict) else None
    mode = val.get("mode") if isinstance(val, dict) else None
    return "strava" if mode == "strava" else "mirror"


def write_status(url, key, which, info):
    """which = 'mirror' | 'crawler'；失敗只印警告，不影響主流程。"""
    info = {**info, "at": now_str()}
    try:
        r = requests.post(f"{url}/rest/v1/game_config",
                          headers={**_headers(key), "Prefer": "resolution=merge-duplicates,return=minimal"},
                          data=json.dumps({"key": f"data_source_status_{which}", "value": info}), timeout=15)
        if not r.ok:
            print(f"⚠️ 寫入執行狀態失敗 ({r.status_code})：{r.text[:200]}")
    except Exception as e:  # noqa: BLE001
        print(f"⚠️ 寫入執行狀態失敗：{e}")
