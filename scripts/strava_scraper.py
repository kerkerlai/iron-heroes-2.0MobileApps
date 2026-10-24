#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Strava 雲端爬蟲 (2 個月月份區間精準掃描版 + React Microfrontend 支援 + Supabase 直連)
"""

import os
import re
import time
import sys
import json
import html
import requests
from bs4 import BeautifulSoup
from datetime import datetime, timedelta

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_ANON_KEY", os.environ.get("SUPABASE_KEY", "")).strip()
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

def get_existing_activity_ids():
    """從 Supabase activities 表取得所有現存活動 ID，避免重複寫入。
    - 分頁讀取 (PostgREST 單次最多回傳 1000 筆)，資料量成長後也不會漏掉舊 ID。
    - 讀取失敗時回傳 None，由主程式中止本次寫入，避免把所有舊活動當成新活動重新寫入
      (那會把 GM 的作廢 / 修改全部蓋回原值)。"""
    ids = set()
    page_size = 1000
    offset = 0
    try:
        while True:
            url = f"{SUPABASE_URL}/rest/v1/activities?select=id&order=id.asc&limit={page_size}&offset={offset}"
            r = requests.get(url, headers=SUPABASE_HEADERS, timeout=15)
            if r.status_code != 200:
                print(f"❌ 讀取現存活動 ID 失敗 (HTTP {r.status_code}): {r.text}")
                return None
            rows = r.json()
            ids.update(str(item["id"]) for item in rows)
            if len(rows) < page_size:
                break
            offset += page_size
        print(f"📋 [Supabase] 資料庫現存 {len(ids)} 筆歷史活動紀錄")
        return ids
    except Exception as e:
        print(f"❌ 無法取得現存活動 ID: {e}")
        return None

def calculate_calories(avg_hr, duration_mins):
    try:
        hr = float(avg_hr)
        dur = float(duration_mins)
        c = ((-59.0 + (0.45 * hr) + (0.074 * 55) + (0.274 * 34)) / 4.184) * dur
        return max(int(round(c)), int(round(dur * 4.0)))
    except Exception:
        return int(round(float(duration_mins) * 4.5))

def fetch_interval_activities(ath_id, ym, headers):
    """透過月份區間 API 抓取該選手該月份的所有活動"""
    url = f"https://www.strava.com/athletes/{ath_id}/interval?interval={ym}&interval_type=month&chart_type=miles&year_offset=0"
    try:
        r = requests.get(url, headers=headers, timeout=15)
        if r.status_code != 200: return []
        
        idx = r.text.find("data-react-props")
        if idx == -1: return []
        
        s_idx = r.text.find("{", idx)
        if s_idx == -1: return []
        
        tag_end = r.text.find(">", idx)
        e_idx = r.text.rfind("}", s_idx, tag_end)
        if e_idx == -1: return []
        
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

    # 計算當前月與前一個月的 YYYYMM (涵蓋 2 個月完整區間)
    now = datetime.now()
    curr_ym = now.strftime("%Y%m")
    prev_month_date = now.replace(day=1) - timedelta(days=1)
    prev_ym = prev_month_date.strftime("%Y%m")
    months_to_scan = [curr_ym, prev_ym]

    existing_ids = get_existing_activity_ids()
    if existing_ids is None:
        print("🛑 無法確認資料庫現存紀錄，為避免重複寫入或覆蓋 GM 修正資料，本次爬蟲中止，下次排程會自動重試。")
        return
    new_activities_to_insert = []

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
                        if not props_raw: continue
                        try:
                            p_data = json.loads(props_raw)
                            entries = p_data.get("appContext", {}).get("preFetchedEntries", [])
                            for e in entries:
                                if e.get("activity"): all_month_acts.append(e.get("activity"))
                        except Exception: pass
            except Exception: pass

        print(f"  📡 近 2 個月共解析出 {len(all_month_acts)} 筆運動紀錄")

        for act in all_month_acts:
            act_id = str(act.get("id"))
            if not act_id or act_id in existing_ids:
                continue

            act_name = str(act.get("activityName") or "運動")
            sport_type = str(act.get("type") or "Workout")

            # Check Excluded Keywords against BOTH activityName and sport_type (case-insensitive)
            if any(
                str(kw).strip().lower() in act_name.lower() or str(kw).strip().lower() in sport_type.lower()
                for kw in (exclude_keywords or [])
                if str(kw).strip()
            ):
                print(f"  🚫 略過排除關鍵字活動：{act_name} [類型: {sport_type}] (#{act_id})")
                continue

            elapsed = act.get("elapsedTime", 0)
            moving_time_mins = round(elapsed / 60) if elapsed else 0
            distance_km = 0
            elevation_m = 0
            avg_hr = 0
            max_hr = 0
            calories = 0
            start_time_readable = None

            for st in act.get("stats", []):
                val_str = str(st.get("value", ""))
                sub = str(st.get("key", ""))
                if "Time" in val_str or "stat_one" in sub:
                    m_min = re.search(r"(\d+)m", val_str)
                    m_hr = re.search(r"(\d+)h", val_str)
                    h = int(m_hr.group(1)) if m_hr else 0
                    m = int(m_min.group(1)) if m_min else 0
                    if h or m: moving_time_mins = h * 60 + m
                elif "bpm" in val_str:
                    m_bpm = re.search(r"(\d+)", val_str)
                    if m_bpm: avg_hr = int(m_bpm.group(1))
                elif "Cal" in val_str or "kcal" in val_str:
                    m_cal = re.search(r"([\d,]+)", val_str)
                    if m_cal: calories = int(m_cal.group(1).replace(",", ""))
                elif "km" in val_str.lower():
                    m_km = re.search(r"([\d.,]+)\s*km", val_str, re.I)
                    if m_km:
                        try: distance_km = float(m_km.group(1).replace(",", ""))
                        except Exception: pass
                elif re.search(r"\b([\d,]+)\s*m\b", val_str):
                    m_elev = re.search(r"\b([\d,]+)\s*m\b", val_str)
                    if m_elev:
                        try: elevation_m = int(m_elev.group(1).replace(",", ""))
                        except Exception: pass

            if act.get("startDate"):
                try:
                    clean_dt = act.get("startDate").replace("Z", "+00:00")
                    dt_obj = datetime.fromisoformat(clean_dt)
                    local_dt = dt_obj + timedelta(hours=8)
                    start_time_readable = local_dt.strftime("%Y/%m/%d %H:%M:%S")
                except Exception:
                    pass

            # 若詳情資料缺漏，抓取活動單頁
            if not calories or not avg_hr:
                detail_url = f"https://www.strava.com/activities/{act_id}"
                try:
                    detail_resp = requests.get(detail_url, headers=headers, timeout=15)
                    if detail_resp.status_code == 200:
                        d_soup = BeautifulSoup(detail_resp.text, "html.parser")
                        stat_spans = d_soup.select(".inline-stats li, .stats li, [data-testid=stat]")
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
                                if num: avg_hr = int(num.group(1))
                            elif ("卡路里" in txt or "熱量" in txt or "Calories" in txt) and not calories:
                                num = re.search(r"([\d,]+)\s*(?:卡|kcal|Calories)", txt)
                                if num: calories = int(num.group(1).replace(",", ""))
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
                            moving_time_mins = round(time_list[-1] / 60.0)
                        if dist_list and not distance_km:
                            distance_km = round(dist_list[-1] / 1000.0, 2)
                        print(f"    📡 Streams 補充 -> 時長: {moving_time_mins}分, 平均HR: {avg_hr} bpm, 最大HR: {max_hr} bpm, 距離: {distance_km} km")
                except Exception as e:
                    print(f"    ⚠️ Streams 讀取異常: {e}")

            if not calories and avg_hr and moving_time_mins:
                calories = calculate_calories(avg_hr, moving_time_mins)
                print(f"    🔥 依心率自動推算熱量: {calories} kcal")

            if not start_time_readable:
                start_time_readable = datetime.now().strftime("%Y/%m/%d %H:%M:%S")

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
        except Exception as e:
            print(f"❌ 寫入 Supabase 發生錯誤: {e}")
    else:
        print("\n✅ 本次檢查無新活動需要寫入，全服近 2 個月數據已是最新狀態！")

if __name__ == "__main__":
    print("=== Strava 雲端爬蟲 (2 個月月份區間精準掃描直連版) 啟動 ===")
    # 🛰️ 鋼鐵英雄紀元 2.0：先看 GM 後台「資料來源」開關，只有切到「自己抓 Strava」才會真的抓
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
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
