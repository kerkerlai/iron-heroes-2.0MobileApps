#!/usr/bin/env python3
"""
鋼鐵英雄紀元 2.0 — 舊資料庫 → 新資料庫 同步工具
=====================================================================
安全原則：
  * 舊資料庫「只讀」：程式裡對舊庫只有 GET，完全沒有寫入的程式碼路徑。
  * 只寫新資料庫；若新舊網址相同會立刻中止。
  * 缺少任何設定就中止 (不會自動退回任何預設資料庫)。

模式：
  mirror (預設，GitHub Actions 每 30 分鐘)：
      只「新增」新庫沒有的英雄 / 運動紀錄 (ID 重複就跳過)，
      不會覆蓋你在 2.0 做的任何修改 (GM 設定、作廢、補登都保留)。
  full (第一次搬家，或想把新庫重置成跟舊庫一樣時手動執行)：
      英雄 / 運動紀錄 / 遊戲設定 全部以舊庫為準覆蓋 (不會刪除新庫多出來的資料)，
      並複製全部頭像。
  --dry-run：只讀取並列出會做什麼，不寫入任何東西。

環境變數：
  OLD_SUPABASE_URL / OLD_SUPABASE_ANON_KEY   舊專案 (只讀)
  SUPABASE_URL     / SUPABASE_ANON_KEY       新專案 (寫入)
用法：
  python scripts/sync_old_to_new.py [mirror|full] [--dry-run]
"""
import os
import sys
import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from data_source import get_mode, write_status  # noqa: E402

MODE = "full" if "full" in sys.argv[1:] else "mirror"
DRY = "--dry-run" in sys.argv[1:]
FORCE = "--force" in sys.argv[1:]

OLD_URL = os.environ.get("OLD_SUPABASE_URL", "").strip().rstrip("/")
OLD_KEY = os.environ.get("OLD_SUPABASE_ANON_KEY", "").strip()
NEW_URL = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
NEW_KEY = os.environ.get("SUPABASE_ANON_KEY", "").strip()

missing = [n for n, v in [("OLD_SUPABASE_URL", OLD_URL), ("OLD_SUPABASE_ANON_KEY", OLD_KEY),
                          ("SUPABASE_URL", NEW_URL), ("SUPABASE_ANON_KEY", NEW_KEY)] if not v]
if missing:
    sys.exit(f"❌ 缺少設定：{', '.join(missing)} (GitHub → Settings → Secrets and variables → Actions)。同步中止。")
if OLD_URL == NEW_URL:
    sys.exit("❌ 新舊資料庫網址相同，為避免誤寫，同步中止。")

OLD_H = {"apikey": OLD_KEY, "Authorization": f"Bearer {OLD_KEY}"}
NEW_H = {"apikey": NEW_KEY, "Authorization": f"Bearer {NEW_KEY}"}
OLD_STORAGE = f"{OLD_URL}/storage/v1/object/public/avatars/"
NEW_STORAGE = f"{NEW_URL}/storage/v1/object/public/avatars/"
CHUNK = 500


# ---------------- 讀取 (舊庫只會用到這裡) ----------------
def read_all(base, headers, table, order):
    out, size = [], 1000
    while True:
        r = requests.get(f"{base}/rest/v1/{table}?select=*&order={order}.asc&limit={size}&offset={len(out)}",
                         headers=headers, timeout=30)
        if r.status_code == 404 and base == NEW_URL:
            sys.exit(f"❌ 新資料庫找不到資料表 {table}：請先在新 Supabase 的 SQL Editor 執行 scripts/supabase_full_setup_v2.sql")
        r.raise_for_status()
        rows = r.json()
        out.extend(rows)
        if len(rows) < size:
            return out


def old_read(table, order):
    return read_all(OLD_URL, OLD_H, table, order)


def new_read(table, order):
    return read_all(NEW_URL, NEW_H, table, order)


# ---------------- 寫入 (只寫新庫) ----------------
def new_write(table, rows, overwrite):
    if not rows or DRY:
        return
    prefer = "resolution=merge-duplicates" if overwrite else "resolution=ignore-duplicates"
    for i in range(0, len(rows), CHUNK):
        r = requests.post(f"{NEW_URL}/rest/v1/{table}", headers={**NEW_H, "Content-Type": "application/json",
                          "Prefer": f"{prefer},return=minimal"}, json=rows[i:i + CHUNK], timeout=60)
        if not r.ok:
            sys.exit(f"❌ 寫入新庫 {table} 失敗 ({r.status_code})：{r.text[:300]}")


def copy_avatar(url):
    """把舊庫頭像複製到新庫 avatars bucket，回傳新網址；非舊庫圖片原樣回傳。"""
    if not url or not url.startswith(OLD_STORAGE):
        return url
    rest = url[len(OLD_STORAGE):]
    path, _, query = rest.partition("?")
    new_url = NEW_STORAGE + path + (f"?{query}" if query else "")
    if DRY:
        return new_url
    src = requests.get(OLD_STORAGE + path, timeout=30)
    if not src.ok:
        print(f"  ⚠️ 頭像下載失敗 {path} ({src.status_code})，保留原網址")
        return url
    up = requests.post(f"{NEW_URL}/storage/v1/object/avatars/{path}",
                       headers={**NEW_H, "Content-Type": src.headers.get("content-type", "image/webp"),
                                "x-upsert": "true"}, data=src.content, timeout=60)
    if not up.ok:
        print(f"  ⚠️ 頭像上傳失敗 {path} ({up.status_code})：{up.text[:200]}，保留原網址")
        return url
    return new_url


def load_aliases():
    """GM 在 2.0 改過名字的英雄：game_config.hero_aliases = {舊名: 新名}。
    舊遊戲資料庫裡仍是舊名，鏡像時要換成新名，避免又多出一位「舊名」的重複英雄。"""
    try:
        r = requests.get(f"{NEW_URL}/rest/v1/game_config?key=eq.hero_aliases&select=value", headers=NEW_H, timeout=15)
        r.raise_for_status()
        rows = r.json()
        v = (rows[0].get("value") if rows else None) or {}
        return {str(k): str(x) for k, x in v.items() if k and x and k != x} if isinstance(v, dict) else {}
    except Exception as e:  # noqa: BLE001
        sys.exit(f"❌ 讀取英雄改名對照表失敗：{e}（為避免產生重複英雄，本次不同步）")


def load_tombstones(key):
    """GM 在 2.0 刪除過的英雄或運動紀錄：記錄於 game_config.{deleted_heroes|deleted_activity_ids}，
    避免鏡像同步每 30 分鐘又從舊庫塞回來。"""
    try:
        r = requests.get(f"{NEW_URL}/rest/v1/game_config?key=eq.{key}&select=value", headers=NEW_H, timeout=15)
        r.raise_for_status()
        rows = r.json()
        v = (rows[0].get("value") if rows else None) or []
        return {str(x) for x in v if x} if isinstance(v, list) else set()
    except Exception as e:  # noqa: BLE001
        print(f"  ⚠️ 讀取 {key} 失敗 ({e})，略過")
        return set()


def resolve_name(name, aliases):
    seen = set()
    while name in aliases and name not in seen:
        seen.add(name)
        name = aliases[name]
    return name


def heal_duplicates(aliases, new_heroes):
    """自我修復：新庫若已經有「舊名」英雄 (舊版鏡像造成的重複)，而新名英雄也存在，
    就把舊名底下的運動紀錄搬到新名，再刪除重複的舊名英雄 (有手機綁定/健康數據時不動，只提示)。"""
    healed = []
    for old_name in list(aliases):
        target = resolve_name(old_name, aliases)
        if old_name not in new_heroes or target not in new_heroes or target == old_name:
            continue
        q = requests.utils.quote(old_name)
        dh = requests.get(f"{NEW_URL}/rest/v1/daily_health?select=hero&hero=eq.{q}&limit=1", headers=NEW_H, timeout=15)
        dv = requests.get(f"{NEW_URL}/rest/v1/devices_public?select=hero&hero=eq.{q}&limit=1", headers=NEW_H, timeout=15)
        if not (dh.ok and dv.ok):
            print(f"  ⚠️ 無法確認「{old_name}」是否有手機資料 (HTTP {dh.status_code}/{dv.status_code})，本次不自動合併")
            continue
        if dh.json() or dv.json():
            print(f"  ⚠️ 重複英雄「{old_name}」有手機資料，請 GM 在後台處理 (未自動合併)")
            continue
        if not DRY:
            r1 = requests.patch(f"{NEW_URL}/rest/v1/activities?hero=eq.{q}", headers={**NEW_H, "Content-Type": "application/json"},
                                json={"hero": target}, timeout=30)
            r1.raise_for_status()
            r2 = requests.delete(f"{NEW_URL}/rest/v1/heroes?name=eq.{q}", headers=NEW_H, timeout=30)
            r2.raise_for_status()
        new_heroes.pop(old_name, None)
        healed.append(f"{old_name}→{target}")
    if healed:
        print(f"🩹 合併重複英雄：{healed}")
    return healed


def strip_ts(row):
    # 保留原始 created_at / updated_at (批次寫入時每筆欄位必須一致，所以不刪任何欄位)
    return row


def main():
    print(f"🔁 模式：{MODE}{' (dry-run，不寫入)' if DRY else ''}")
    print(f"   舊庫 (只讀)：{OLD_URL}\n   新庫 (寫入)：{NEW_URL}")

    # 🛰️ GM 後台「資料來源」開關：已切到「自己抓 Strava」就不再從舊庫複製
    source = get_mode(NEW_URL, NEW_KEY)
    if source is None:
        sys.exit("❌ 無法讀取資料來源開關 (新資料庫連不上？)，本次不同步。")
    if source == "strava" and not FORCE:
        print("⏸️ 資料來源 = 新 repo 自己抓 Strava (已正式切換)，鏡像同步本次只報到、不複製。")
        if not DRY:
            write_status(NEW_URL, NEW_KEY, "mirror", {"result": "skipped", "mode": source})
        return

    old_heroes = old_read("heroes", "name")
    old_acts = old_read("activities", "id")
    new_heroes = {h["name"]: h for h in new_read("heroes", "name")}
    new_acts_list = new_read("activities", "id")
    new_act_map = {str(a["id"]): a for a in new_acts_list}
    new_act_ids = {a["id"] for a in new_acts_list}
    aliases = load_aliases()
    deleted_heroes = load_tombstones("deleted_heroes")
    deleted_act_ids = load_tombstones("deleted_activity_ids")
    if aliases:
        print(f"   改名對照：{aliases}")
    if deleted_heroes or deleted_act_ids:
        print(f"   已刪除過濾：英雄 {len(deleted_heroes)} 位、運動 {len(deleted_act_ids)} 筆")
    healed = heal_duplicates(aliases, new_heroes)
    print(f"   舊庫：英雄 {len(old_heroes)}、運動紀錄 {len(old_acts)}")
    print(f"   新庫：英雄 {len(new_heroes)}、運動紀錄 {len(new_act_ids)}")

    # ---- 英雄 ----
    # 舊庫英雄若在 2.0 改過名，一律換成新名 (避免產生重複英雄)；若已在 2.0 刪除則略過
    if MODE == "full":
        hero_rows = [h for h in old_heroes if h["name"] not in deleted_heroes and resolve_name(h["name"], aliases) not in deleted_heroes]
    else:
        hero_rows = [
            h for h in old_heroes
            if resolve_name(h["name"], aliases) not in new_heroes
            and h["name"] not in deleted_heroes
            and resolve_name(h["name"], aliases) not in deleted_heroes
        ]
    out = []
    for h in hero_rows:
        h = strip_ts(dict(h))
        h["name"] = resolve_name(h["name"], aliases)
        h["avatar"] = copy_avatar(h.get("avatar") or "")
        out.append(h)
    new_write("heroes", out, overwrite=(MODE == "full"))
    print(f"🦸 英雄：{'覆蓋' if MODE == 'full' else '新增'} {len(out)} 位 {[h['name'] for h in out]}")

    # mirror 模式：補救新庫裡仍指向舊庫的頭像
    if MODE == "mirror":
        fixes = []
        for name, h in new_heroes.items():
            av = h.get("avatar") or ""
            if av.startswith(OLD_STORAGE):
                nu = copy_avatar(av)
                if nu != av:
                    fixes.append((name, nu))
        for name, nu in fixes:
            if not DRY:
                requests.patch(f"{NEW_URL}/rest/v1/heroes?name=eq.{requests.utils.quote(name)}",
                               headers={**NEW_H, "Content-Type": "application/json"},
                               json={"avatar": nu}, timeout=30).raise_for_status()
        if fixes:
            print(f"🖼️ 修正仍指向舊庫的頭像：{[n for n, _ in fixes]}")

    # ---- 運動紀錄 ----
    if MODE == "full":
        act_rows = [a for a in old_acts if str(a["id"]) not in deleted_act_ids]
    else:
        act_rows = [a for a in old_acts if a["id"] not in new_act_ids and str(a["id"]) not in deleted_act_ids]
    out = []
    for a in act_rows:
        a = strip_ts(dict(a))
        a["hero"] = resolve_name(a.get("hero") or "", aliases)
        if a["hero"] in deleted_heroes:
            continue
        a["source"] = "manual" if a.get("is_manual") else (a.get("source") or "strava")
        out.append(a)
    new_write("activities", out, overwrite=(MODE == "full"))
    print(f"🏃 運動紀錄：{'覆蓋/新增' if MODE == 'full' else '新增'} {len(out)} 筆")

    # mirror 模式：若舊庫已校正 Strava 歷史運動熱量（只要舊庫與新庫的 Strava 熱量不一致），自動同步更新 calories（不動 is_excluded）
    if MODE == "mirror":
        cal_patched = 0
        for oa in old_acts:
            aid = str(oa.get("id") or "")
            if not aid or aid in deleted_act_ids or aid not in new_act_map:
                continue
            na = new_act_map[aid]
            if na.get("is_manual") or (na.get("source") and na.get("source") != "strava"):
                continue
            old_cal = int(round(float(oa.get("calories") or 0)))
            new_cal = int(round(float(na.get("calories") or 0)))
            if old_cal > 0 and old_cal != new_cal:
                if not DRY:
                    requests.patch(
                        f"{NEW_URL}/rest/v1/activities?id=eq.{requests.utils.quote(aid)}",
                        headers={**NEW_H, "Content-Type": "application/json", "Prefer": "return=minimal"},
                        json={"calories": old_cal},
                        timeout=20,
                    )
                cal_patched += 1
        if cal_patched > 0:
            print(f"🔥 同步校正舊庫已更新的 Strava 熱量：{cal_patched} 筆")

    # ---- 遊戲設定 (只在 full 模式；保留 2.0 專屬設定並將 gm_ops_config 內的舊名轉換為新名) ----
    if MODE == "full":
        preserve_keys = {
            "hero_aliases", "data_source_config", "data_source_status_mirror",
            "data_source_status_crawler", "mobile_modes_config", "deleted_heroes", "deleted_activity_ids"
        }
        new_cfg_map = {c["key"]: c.get("value") for c in new_read("game_config", "key")}
        cfg = []
        for c in old_read("game_config", "key"):
            c = strip_ts(dict(c))
            k = c.get("key")
            if k in preserve_keys and k in new_cfg_map:
                continue
            if k == "gm_ops_config" and isinstance(c.get("value"), dict):
                val = dict(c["value"])
                for subk in ("heroFx", "manualBadges"):
                    if isinstance(val.get(subk), dict):
                        val[subk] = {resolve_name(hk, aliases): hv for hk, hv in val[subk].items()}
                new_ops = new_cfg_map.get("gm_ops_config")
                if isinstance(new_ops, dict) and "mobileSync" in new_ops:
                    val["mobileSync"] = new_ops["mobileSync"]
                c["value"] = val
            cfg.append(c)
        new_write("game_config", cfg, overwrite=True)
        print(f"⚙️ 遊戲設定：覆蓋 {len(cfg)} 項 {[c['key'] for c in cfg]}")

    if not DRY:
        write_status(NEW_URL, NEW_KEY, "mirror", {"result": "ok", "mode": source, "run": MODE,
                     "heroesAdded": len(hero_rows) if MODE == "mirror" else 0, "activitiesAdded": len(act_rows) if MODE == "mirror" else 0,
                     "oldActivities": len(old_acts)})
    print("✅ 完成" + (" (dry-run，沒有寫入任何資料)" if DRY else ""))


if __name__ == "__main__":
    main()
