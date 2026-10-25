#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Strava 雲端爬蟲 (2 個月月份區間精準掃描版 + React Microfrontend / more-stats 真實熱量支援 + 舊保底熱量自動回補)
同時相容：
  - 鋼鐵英雄紀元 2.0 (含 scripts/data_source.py 開關檢查)
  - 鋼鐵英雄紀元 1.0 (iron-heroes-web-clean，無 data_source.py 時直接執行)
"""

import os
import re
import time
import sys
import json
import html
import math
import requests
from bs4 import BeautifulSoup
from datetime import datetime, timedelta, timezone

TPE = timezone(timedelta(hours=8))

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
HAS_DATA_SOURCE = os.path.exists(os.path.join(SCRIPT_DIR, "data_source.py"))

# 1.0 專案預設連線參數 (僅在無 data_source.py 的 1.0 環境作為 fallback；2.0 強制讀取環境變數)
DEFAULT_LEGACY_URL = "" if HAS_DATA_SOURCE else "https://yxkvbkfnlqwlybhmugki.supabase.co"
DEFAULT_LEGACY_KEY = (
    ""
    if HAS_DATA_SOURCE
    else "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl4a3Zia2ZubHF3bHliaG11Z2tpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5NDIyODYsImV4cCI6MjEwMjUxODI4Nn0.Jky4o080Gn9-prx-G0aj7dCl7rmA1dJWN3BZgkVmjwo"
)

SUPABASE_URL = os.environ.get("SUPABASE_URL", DEFAULT_LEGACY_URL).strip().rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_ANON_KEY", os.environ.get("SUPABASE_KEY", DEFAULT_LEGACY_KEY)).strip()
if not SUPABASE_URL or not SUPABASE_KEY:
    raise SystemExit("❌ 缺少 SUPABASE_URL / SUPABASE_ANON_KEY (請到 GitHub → Settings → Secrets 設定)，為避免寫錯資料庫，爬蟲中止。")

SUPABASE_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates"
}


def load_heroes_from_supabase():
    """從 Supabase heroes 表動態取得所有冒險者及其 Strava 數字 ID (完全無 Hardcode)"""
    url = f"{SUPABASE_URL}/rest/v1/heroes?select=*"
    try:
        r = requests.get(url, headers=SUPABASE_HEADERS, timeout=10)
        if r.status_code == 200:
            heroes_list = r.json()
            profiles = {}
            for h in heroes_list:
                sid = str(h.get("strava_id", "")).strip()
                if sid and re.match(r"^\d+$", sid):
                    profiles[sid] = h.get("name")
            print(f"👥 [Supabase] 成功載入 {len(profiles)} 位已綁定 Strava ID 的英雄選手：{list(profiles.values())}")
            return profiles
        else:
            print(f"❌ 讀取 Supabase heroes 失敗 (HTTP {r.status_code}): {r.text}")
    except Exception as e:
        print(f"❌ 連線 Supabase 異常: {e}")
    return {}


def load_exclude_keywords_from_supabase():
    """從 Supabase game_config 表動態取得排除關鍵字"""
    url = f"{SUPABASE_URL}/rest/v1/game_config?key=eq.exclude_keywords"
    try:
        r = requests.get(url, headers=SUPABASE_HEADERS, timeout=10)
        if r.status_code == 200:
            data = r.json()
            if data and "value" in data[0]:
                kws = data[0]["value"]
                if isinstance(kws, list) and len(kws) > 0:
                    if "羽球" in kws and "Badminton" not in kws:
                        kws.append("Badminton")
                    print(f"⚙️ [Supabase] 成功載入排除關鍵字設定：{kws}")
                    return kws
    except Exception as e:
        print(f"⚠️ 無法取得排除關鍵字: {e}")
    return ["羽球", "Badminton"]


def legacy_calculate_calories(avg_hr, duration_mins):
    """舊版公式 (僅用於識別需要自動修復為真实熱量或時長×4的歷史紀錄)"""
    try:
        hr = float(avg_hr or 0)
        dur = float(duration_mins or 0)
        if dur <= 0:
            return 0
        if hr <= 0:
            return int(round(dur * 4.5))
        c = ((-59.0 + (0.45 * hr) + (0.074 * 55) + (0.274 * 34)) / 4.184) * dur
        return max(int(round(c)), int(round(dur * 4.0)))
    except Exception:
        return 0


def keytel_calculate_calories(avg_hr, duration_mins):
    """前版 Keytel 心率推算值 (僅用於識別並回退至 Strava 真實熱量或時長×4保底)"""
    try:
        hr = float(avg_hr or 0)
        dur = float(duration_mins or 0)
        if dur <= 0:
            return 0
        if hr <= 0:
            return int(round(dur * 5.5))
        kcal_per_min = (-37.75 + 0.539 * hr + 0.09 * 68.0 + 0.138 * 32.0) / 4.184
        return max(int(round(kcal_per_min * dur)), int(round(dur * 4.5)))
    except Exception:
        return 0


def is_legacy_fallback_calories(cal, avg_hr, duration_mins):
    """判斷資料庫既有 Strava 紀錄的熱量是否為公式推算值（非 Strava 原生熱量），以便重新嘗試擷取真實熱量或統一改為 時長×4"""
    try:
        c = float(cal or 0)
        dur = float(duration_mins or 0)
        if dur <= 0:
            return False
        if c <= 0:
            return True
        old_est = legacy_calculate_calories(avg_hr, dur)
        if old_est > 0 and abs(c - old_est) <= 2:
            return True
        keytel_est = keytel_calculate_calories(avg_hr, dur)
        if keytel_est > 0 and abs(c - keytel_est) <= 2:
            return True
        if abs(c - round(dur * 4.0)) <= 1 or abs(c - round(dur * 4.5)) <= 1 or abs(c - round(dur * 5.5)) <= 1:
            return True
        return False
    except Exception:
        return False


def get_existing_activities_info():
    """從 Supabase activities 表分頁取得所有現存活動 ID 與需要回補熱量的舊紀錄。
    - 分頁讀取 (PostgREST 單次最多回傳 1000 筆)。
    - 讀取失敗時回傳 (None, None)，由主程式中止本次寫入，保護 GM 修改資料。"""
    ids = set()
    legacy_cal_map = {}
    page_size = 1000
    offset = 0
    try:
        while True:
            url = f"{SUPABASE_URL}/rest/v1/activities?select=id,calories,duration,avg_hr,is_manual&order=id.asc&limit={page_size}&offset={offset}"
            r = requests.get(url, headers=SUPABASE_HEADERS, timeout=15)
            if r.status_code != 200:
                print(f"❌ 讀取現存活動 ID 失敗 (HTTP {r.status_code}): {r.text}")
                return None, None
            rows = r.json()
            for item in rows:
                aid = str(item.get("id", "")).strip()
                if not aid:
                    continue
                ids.add(aid)
                # 只針對純 Strava 編號紀錄 (非 hc_/ah_ 手機紀錄、非手動補登) 檢查是否為舊版時長×4保底熱量
                if re.match(r"^\d+$", aid) and not item.get("is_manual"):
                    if is_legacy_fallback_calories(item.get("calories"), item.get("avg_hr"), item.get("duration")):
                        legacy_cal_map[aid] = int(round(float(item.get("calories") or 0)))
            if len(rows) < page_size:
                break
            offset += page_size
        print(f"📋 [Supabase] 資料庫現存 {len(ids)} 筆歷史活動紀錄（其中 {len(legacy_cal_map)} 筆待檢查熱量回補）")
        return ids, legacy_cal_map
    except Exception as e:
        print(f"❌ 無法取得現存活動 ID: {e}")
        return None, None


def get_existing_activity_ids():
    ids, _ = get_existing_activities_info()
    return ids


def seconds_to_mins(sec):
    """將秒數轉為分鐘：未滿 30 分鐘 (1800 秒) 一律無條件捨去，避免 29m30s~29m59s 被四捨五入成 30 分鐘有效運動"""
    try:
        s = float(sec or 0)
        if s <= 0:
            return 0
        if s < 1800:
            return int(math.floor(s / 60.0))
        return int(round(s / 60.0))
    except Exception:
        return 0


def calculate_calories(avg_hr, duration_mins):
    """當 Strava 網頁未提供熱量時，統一使用 時長(分) × 4 低估保底計算（提醒選手將裝置同步做好）"""
    try:
        dur = float(duration_mins or 0)
        if dur <= 0:
            return 0
        return int(round(dur * 4.0))
    except Exception:
        return 0


def _parse_valid_cal(raw_val):
    """將字串或數值轉為合理卡路里整數 (1 ~ 15000)"""
    if raw_val is None:
        return 0
    try:
        if isinstance(raw_val, (int, float)):
            v = int(round(float(raw_val)))
            return v if 1 <= v <= 15000 else 0
        s = str(raw_val).strip().replace(",", "")
        m = re.search(r"(\d+(?:\.\d+)?)", s)
        if not m:
            return 0
        v = int(round(float(m.group(1))))
        return v if 1 <= v <= 15000 else 0
    except Exception:
        return 0


def extract_calories_from_detail_page(html_text, d_soup):
    """從 Strava 活動單頁擷取真實卡路里：
    1. 優先解析 React Microfrontend JSON / 頁面內嵌 JSON ("calories" / "caloric_expenditure")
    2. 解析 Strava .more-stats / .inline-stats / 表格與統計區塊 (支援『Calories 在前、數字在後』與兄弟節點結構)
    """
    if not html_text:
        return 0

    # 1) 從 HTML 內嵌 JSON / data-react-props 尋找 calories 欄位
    try:
        unescaped = html.unescape(html_text)
        for pat in (
            r'"calories"\s*:\s*"?([\d,]+(?:\.\d+)?)\s*(?:Cal|kcal|卡)?"?',
            r'"caloric_expenditure"\s*:\s*"?([\d,]+(?:\.\d+)?)"?',
        ):
            for m in re.finditer(pat, unescaped, re.I):
                v = _parse_valid_cal(m.group(1))
                if v > 0:
                    return v
    except Exception:
        pass

    if d_soup is None:
        return 0

    # 2) 從 DOM 標籤對照尋找 (例如 <div class="spans5">Calories</div><div class="spans3"><strong>434</strong></div>)
    label_keywords = ("calories", "卡路里", "熱量", "消耗熱量")
    try:
        for el in d_soup.find_all(["div", "span", "th", "td", "dt", "li", "p", "label"]):
            own_txt = el.get_text(" ", strip=True)
            if not own_txt or len(own_txt) > 60:
                continue
            low = own_txt.lower()
            if any(k in low for k in label_keywords):
                # (a) 同一節點內含數字 (例如 "Calories 434" 或 "434 Cal")
                cleaned = re.sub(r"(?i)(calories|cal|kcal|卡路里|消耗熱量|熱量|卡)", " ", own_txt)
                v = _parse_valid_cal(cleaned)
                if v > 0:
                    return v
                # (b) 下一個兄弟節點 (例如 .more-stats 的 .spans5 -> .spans3)
                sib = el.find_next_sibling()
                if sib:
                    v = _parse_valid_cal(sib.get_text(" ", strip=True))
                    if v > 0:
                        return v
                # (c) 父容器內的其他文字
                parent = el.parent
                if parent:
                    p_txt = parent.get_text(" ", strip=True)
                    if len(p_txt) <= 80:
                        p_cleaned = re.sub(r"(?i)(calories|cal|kcal|卡路里|消耗熱量|熱量|卡)", " ", p_txt)
                        v = _parse_valid_cal(p_cleaned)
                        if v > 0:
                            return v
    except Exception:
        pass

    return 0


def fetch_interval_activities(ath_id, ym, headers):
    """透過月份區間 API 抓取該選手該月份的所有活動"""
    url = f"https://www.strava.com/athletes/{ath_id}/interval?interval={ym}&interval_type=month&chart_type=miles&year_offset=0"
    try:
        r = requests.get(url, headers=headers, timeout=15)
        if r.status_code != 200:
            return []

        idx = r.text.find("data-react-props")
        if idx == -1:
            return []

        s_idx = r.text.find("{", idx)
        if s_idx == -1:
            return []

        tag_end = r.text.find(">", idx)
        e_idx = r.text.rfind("}", s_idx, tag_end)
        if e_idx == -1:
            return []

        raw_str = r.text[s_idx : e_idx + 1]
        fixed_str = raw_str.replace(r"\&quot;", r"\&quot;").replace(r"\\&quot;", r"\&quot;")
        clean_json = html.unescape(fixed_str)
        p, _ = json.JSONDecoder().raw_decode(clean_json)
        entries = p.get("appContext", {}).get("preFetchedEntries", [])
        return [e.get("activity") for e in entries if e.get("activity")]
    except Exception:
        return []


def scrape_strava_activities(strava_cookie, athlete_profiles, exclude_keywords):
    if not athlete_profiles:
        print("⚠️ 目前 Supabase 中無任何綁定 Strava ID 的選手，結束本次爬取。")
        return

    # 確保 Cookie 包含 _strava4_session
    clean_cookie = strava_cookie.strip()
    if clean_cookie and not clean_cookie.startswith("_strava4_session=") and "=" not in clean_cookie:
        clean_cookie = f"_strava4_session={clean_cookie}"

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Cookie": clean_cookie,
        "X-Requested-With": "XMLHttpRequest",
        "Accept": "text/javascript, application/json, text/html, */*",
        "Accept-Language": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7"
    }
    page_headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Cookie": clean_cookie,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7"
    }

    # 計算當前月與前一個月的 YYYYMM (涵蓋 2 個月完整區間，使用台灣時區)
    now = datetime.now(TPE)
    curr_ym = now.strftime("%Y%m")
    prev_month_date = now.replace(day=1) - timedelta(days=1)
    prev_ym = prev_month_date.strftime("%Y%m")
    months_to_scan = [curr_ym, prev_ym]

    existing_ids, legacy_cal_map = get_existing_activities_info()
    if existing_ids is None:
        print("🛑 無法確認資料庫現存紀錄，為避免重複寫入或覆蓋 GM 修正資料，本次爬蟲中止，下次排程會自動重試。")
        raise RuntimeError("無法讀取資料庫現存活動 ID")
    new_activities_to_insert = []
    healed_calories_count = 0

    print(f"🚀 開始針對 {len(athlete_profiles)} 位選手掃描近 2 個月 ({prev_ym} ~ {curr_ym}) 完整運動紀錄...")

    for ath_id, member_name in athlete_profiles.items():
        print(f"\n🔍 正在掃描選手：{member_name} (Strava ID: #{ath_id})...")

        all_month_acts = []
        for ym in months_to_scan:
            m_acts = fetch_interval_activities(ath_id, ym, headers)
            all_month_acts.extend(m_acts)
            time.sleep(0.5)

        # 若月份 interval 沒抓到，Fallback 抓選手主頁
        if not all_month_acts:
            try:
                profile_url = f"https://www.strava.com/athletes/{ath_id}"
                resp = requests.get(profile_url, headers=headers, timeout=15)
                if resp.status_code == 200:
                    soup = BeautifulSoup(resp.text, "html.parser")
                    for comp in soup.select("[data-react-class=Microfrontend]"):
                        props_raw = comp.get("data-react-props")
                        if not props_raw:
                            continue
                        try:
                            p_data = json.loads(props_raw)
                            entries = p_data.get("appContext", {}).get("preFetchedEntries", [])
                            for e in entries:
                                if e.get("activity"):
                                    all_month_acts.append(e.get("activity"))
                        except Exception:
                            pass
            except Exception:
                pass

        print(f"  📡 近 2 個月共解析出 {len(all_month_acts)} 筆運動紀錄")

        for act in all_month_acts:
            act_id = str(act.get("id") or "").strip()
            if not act_id:
                continue
            is_existing = act_id in existing_ids
            needs_cal_heal = is_existing and (act_id in legacy_cal_map)
            if is_existing and not needs_cal_heal:
                continue

            act_name = str(act.get("activityName") or "運動")
            sport_type = str(act.get("type") or "Workout")

            # Check Excluded Keywords against BOTH activityName and sport_type (case-insensitive; normalize full-width quotes)
            norm_q = lambda s: str(s or "").replace("＇", "'").replace("＂", '"').strip().lower()
            act_name_l = norm_q(act_name)
            sport_type_l = norm_q(sport_type)
            if any(
                norm_q(kw) in act_name_l or norm_q(kw) in sport_type_l
                for kw in (exclude_keywords or [])
                if norm_q(kw)
            ):
                if not is_existing:
                    print(f"  🚫 略過排除關鍵字活動：{act_name} [類型: {sport_type}] (#{act_id})")
                continue

            elapsed = act.get("elapsedTime", 0)
            moving_time_mins = seconds_to_mins(elapsed) if elapsed else 0
            distance_km = 0
            elevation_m = 0
            avg_hr = 0
            max_hr = 0
            calories = _parse_valid_cal(act.get("calories") or act.get("caloric_expenditure"))
            start_time_readable = None

            for st in act.get("stats", []):
                val_str = str(st.get("value", ""))
                sub = str(st.get("key", ""))
                lbl = str(st.get("label", "") or st.get("title", ""))
                if "Time" in val_str or "stat_one" in sub:
                    m_min = re.search(r"(\d+)m", val_str)
                    m_hr = re.search(r"(\d+)h", val_str)
                    h = int(m_hr.group(1)) if m_hr else 0
                    m = int(m_min.group(1)) if m_min else 0
                    if h or m:
                        moving_time_mins = h * 60 + m
                elif "bpm" in val_str:
                    m_bpm = re.search(r"(\d+)", val_str)
                    if m_bpm:
                        avg_hr = int(m_bpm.group(1))
                elif "Cal" in val_str or "kcal" in val_str or "cal" in sub.lower() or "cal" in lbl.lower() or "熱量" in lbl or "卡路里" in lbl:
                    v_cal = _parse_valid_cal(val_str)
                    if v_cal > 0:
                        calories = v_cal
                elif "km" in val_str.lower():
                    m_km = re.search(r"([\d.,]+)\s*km", val_str, re.I)
                    if m_km:
                        try:
                            distance_km = float(m_km.group(1).replace(",", ""))
                        except Exception:
                            pass
                elif re.search(r"\b([\d,]+)\s*m\b", val_str):
                    m_elev = re.search(r"\b([\d,]+)\s*m\b", val_str)
                    if m_elev:
                        try:
                            elevation_m = int(m_elev.group(1).replace(",", ""))
                        except Exception:
                            pass

            if act.get("startDate"):
                try:
                    clean_dt = act.get("startDate").replace("Z", "+00:00")
                    dt_obj = datetime.fromisoformat(clean_dt)
                    local_dt = dt_obj + timedelta(hours=8)
                    start_time_readable = local_dt.strftime("%Y/%m/%d %H:%M:%S")
                except Exception:
                    pass

            # 若詳情資料缺漏 (尤其是列表 API 未提供卡路里時)，以標準 HTML Header 抓取活動單頁擷取真實卡路里與心率
            if not calories or not avg_hr:
                detail_url = f"https://www.strava.com/activities/{act_id}"
                try:
                    detail_resp = requests.get(detail_url, headers=page_headers, timeout=15)
                    if detail_resp.status_code == 200:
                        d_soup = BeautifulSoup(detail_resp.text, "html.parser")
                        if not calories:
                            calories = extract_calories_from_detail_page(detail_resp.text, d_soup)
                        stat_spans = d_soup.select(".inline-stats li, .stats li, .more-stats .row, [data-testid=stat]")
                        for li in stat_spans:
                            txt = li.text.strip()
                            if ("時間" in txt or "Time" in txt) and not moving_time_mins:
                                num = re.search(r"(\d+)\s*(?:小時|h|hr)?\s*(\d+)?\s*(?:分|m|min)?", txt)
                                if num:
                                    h = int(num.group(1)) if "小時" in txt or "h" in txt else 0
                                    mins = int(num.group(2) or num.group(1)) if h > 0 else int(num.group(1))
                                    moving_time_mins = h * 60 + mins
                            elif ("心率" in txt or "Heart Rate" in txt or "bpm" in txt) and not avg_hr:
                                num = re.search(r"(\d+)\s*bpm", txt)
                                if num:
                                    avg_hr = int(num.group(1))
                except Exception:
                    pass

            # --- Streams 數據流核實與補充 (權威秒級來源) ---
            if not avg_hr or not max_hr or not moving_time_mins or not calories:
                try:
                    streams_url = f"https://www.strava.com/activities/{act_id}/streams?stream_types%5B%5D=heartrate&stream_types%5B%5D=time&stream_types%5B%5D=distance"
                    s_resp = requests.get(streams_url, headers=headers, timeout=10)
                    if s_resp.status_code == 200:
                        s_data = s_resp.json()
                        hr_list = s_data.get("heartrate", [])
                        time_list = s_data.get("time", [])
                        dist_list = s_data.get("distance", [])

                        if hr_list and not avg_hr:
                            avg_hr = round(sum(hr_list) / len(hr_list))
                        if hr_list and not max_hr:
                            max_hr = max(hr_list)
                        if time_list and not moving_time_mins:
                            moving_time_mins = seconds_to_mins(time_list[-1])
                        if dist_list and not distance_km:
                            distance_km = round(dist_list[-1] / 1000.0, 2)
                        if not is_existing:
                            print(f"    📡 Streams 補充 -> 時長: {moving_time_mins}分, 平均HR: {avg_hr} bpm, 最大HR: {max_hr} bpm, 距離: {distance_km} km")
                except Exception as e:
                    print(f"    ⚠️ Streams 讀取異常: {e}")

            if not calories and moving_time_mins:
                calories = calculate_calories(avg_hr, moving_time_mins)
                if not is_existing:
                    print(f"    🔥 Strava 未提供熱量，依時長×4保底計算: {calories} kcal")

            # 若為既有活動且屬於舊版時長×4保底熱量，僅透過 PATCH 更新 calories 欄位 (保留 GM 作廢等所有設定)
            if is_existing:
                old_cal = legacy_cal_map.get(act_id, 0)
                if calories > 0 and calories != old_cal:
                    try:
                        patch_url = f"{SUPABASE_URL}/rest/v1/activities?id=eq.{act_id}"
                        pr = requests.patch(
                            patch_url,
                            headers={**SUPABASE_HEADERS, "Prefer": "return=minimal"},
                            json={"calories": calories},
                            timeout=10,
                        )
                        if pr.status_code in [200, 204]:
                            healed_calories_count += 1
                            print(f"  🔧 自動校正舊保底熱量：{member_name} | {act_name} (#{act_id}) | {old_cal} -> {calories} kcal")
                    except Exception as e:
                        print(f"  ⚠️ 校正舊熱量失敗 (#{act_id}): {e}")
                legacy_cal_map.pop(act_id, None)
                time.sleep(0.5)
                continue

            if not start_time_readable:
                start_time_readable = datetime.now(TPE).strftime("%Y/%m/%d %H:%M:%S")

            act_data = {
                "id": act_id,
                "hero": member_name,
                "date": start_time_readable,
                "type": sport_type,
                "name": act_name,
                "duration": moving_time_mins,
                "distance": distance_km,
                "elevation": elevation_m,
                "avg_hr": avg_hr,
                "max_hr": max_hr or (avg_hr + 20 if avg_hr else 0),
                "calories": calories,
                "is_manual": False,
                "is_excluded": False
            }

            new_activities_to_insert.append(act_data)
            existing_ids.add(act_id)
            print(f"  ✨ 成功抓取新運動：{member_name} | {act_name} | 時間: {start_time_readable} | 時長: {moving_time_mins}分 | 平均心率: {avg_hr} bpm | 熱量: {calories}卡")

            time.sleep(1)

    if healed_calories_count > 0:
        print(f"\n🔧 本次共自動校正 {healed_calories_count} 筆歷史運動的真實消耗熱量！")

    # Write new activities to Supabase
    if new_activities_to_insert:
        print(f"\n💾 正在將 {len(new_activities_to_insert)} 筆新運動寫入 Supabase 資料庫...")
        insert_url = f"{SUPABASE_URL}/rest/v1/activities"
        try:
            # 爬蟲只新增、絕不覆蓋既有紀錄 (保護 GM 作廢與手動修正的數值)
            insert_headers = {**SUPABASE_HEADERS, "Prefer": "resolution=ignore-duplicates"}
            r = requests.post(insert_url, headers=insert_headers, json=new_activities_to_insert, timeout=15)
            if r.status_code in [200, 201]:
                print(f"🎉 成功寫入 {len(new_activities_to_insert)} 筆新運動至 Supabase！前台看板與世界 Boss 戰況已秒速同步！")
            else:
                print(f"❌ 寫入 Supabase 失敗 (HTTP {r.status_code}): {r.text}")
                raise RuntimeError(f"寫入 Supabase 失敗 (HTTP {r.status_code})")
        except Exception as e:
            print(f"❌ 寫入 Supabase 發生錯誤: {e}")
            raise
    else:
        print("\n✅ 本次檢查無新活動需要寫入，全服近 2 個月數據已是最新狀態！")


if __name__ == "__main__":
    print("=== Strava 雲端爬蟲 (2 個月月份區間精準掃描直連版) 啟動 ===")
    if HAS_DATA_SOURCE:
        # 🛰️ 鋼鐵英雄紀元 2.0：先看 GM 後台「資料來源」開關，只有切到「自己抓 Strava」才會真的抓
        sys.path.insert(0, SCRIPT_DIR)
        from data_source import get_mode, write_status
        mode = get_mode(SUPABASE_URL, SUPABASE_KEY)
        if mode is None:
            raise SystemExit("❌ 無法讀取資料來源開關 (新資料庫連不上？)，為安全起見本次不抓取。")
        if mode != "strava":
            print("⏸️ 資料來源 = 鏡像舊資料庫 (平行測試期)，本次只報到、不抓 Strava。")
            write_status(SUPABASE_URL, SUPABASE_KEY, "crawler", {"result": "skipped", "mode": mode,
                         "cookie": bool(os.environ.get("STRAVA_COOKIE", "").strip())})
            raise SystemExit(0)

        STRAVA_COOKIE = os.environ.get("STRAVA_COOKIE", "").strip()
        if not STRAVA_COOKIE:
            write_status(SUPABASE_URL, SUPABASE_KEY, "crawler", {"result": "error", "mode": mode, "cookie": False,
                         "message": "缺少 STRAVA_COOKIE"})
            raise SystemExit("❌ 未提供 STRAVA_COOKIE 環境變數，請在 GitHub Secrets 設定。")

        before = len(get_existing_activity_ids() or ())
        try:
            heroes = load_heroes_from_supabase()
            exclude_keywords = load_exclude_keywords_from_supabase()
            scrape_strava_activities(STRAVA_COOKIE, heroes, exclude_keywords)
        except Exception as e:
            write_status(SUPABASE_URL, SUPABASE_KEY, "crawler", {"result": "error", "mode": mode, "cookie": True,
                         "message": str(e)[:300]})
            raise
        after = len(get_existing_activity_ids() or ())
        write_status(SUPABASE_URL, SUPABASE_KEY, "crawler", {"result": "ok", "mode": mode, "cookie": True,
                     "added": max(0, after - before), "total": after})
    else:
        # 🏛️ 鋼鐵英雄紀元 1.0 (iron-heroes-web-clean)：直接執行爬蟲
        STRAVA_COOKIE = os.environ.get("STRAVA_COOKIE", "").strip()
        if not STRAVA_COOKIE:
            print("❌ 警告：未提供 STRAVA_COOKIE 環境變數，請在 GitHub Secrets 設定。")
        heroes = load_heroes_from_supabase()
        exclude_keywords = load_exclude_keywords_from_supabase()
        scrape_strava_activities(STRAVA_COOKIE, heroes, exclude_keywords)
