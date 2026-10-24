#!/usr/bin/env python3
"""
鋼鐵英雄紀元 (Iron Heroes Era) - Multi-threaded Backend Server (v2.4 精準試算持久化版)
Supports In-Season Date Filtering, Real-time Damage Calculation,
Snapshot Archiving, and Server-side State Persistence.
"""

import http.server
import socketserver
import json
import os
import sys
import threading
import queue
import time
import math
import re
from datetime import datetime

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
DATA_FILE = os.path.join(os.path.dirname(__file__), 'data', 'game_data.json')
PUBLIC_DIR = os.path.join(os.path.dirname(__file__), 'public')

sse_clients = []
sse_lock = threading.Lock()
data_lock = threading.Lock()

def parse_date(date_str):
    if not date_str:
        return None
    m = re.match(r'(\d{4})[/-](\d{1,2})[/-](\d{1,2})', str(date_str).strip())
    if m:
        return datetime(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    return None

def load_data():
    with data_lock:
        if os.path.exists(DATA_FILE):
            try:
                with open(DATA_FILE, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception as e:
                print(f"Error loading data: {e}")
        return {}

def save_data(data):
    with data_lock:
        os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
        with open(DATA_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

def broadcast_event(event_type, payload):
    with sse_lock:
        dead = []
        for q in sse_clients:
            try:
                msg = f"event: {event_type}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"
                q.put_nowait(msg)
            except Exception:
                dead.append(q)
        for d in dead:
            if d in sse_clients:
                sse_clients.remove(d)

def calculate_full_season_stats(data):
    """Accurately calculates in-season damage, hero stats, and guild outputs"""
    heroes = data.get('heroes', [])
    guilds = data.get('guilds', [])
    activities = data.get('activities', [])
    boss = data.get('boss', {})
    rules = boss.get('rules', {})
    min_dur = float(rules.get('minDurationMinutes', 30.0) or 30.0)
    mag_mult = float(rules.get('magicMultiplier', 15.0) or 15.0)

    season_start_str = boss.get('seasonStart', '2026/07/27')
    season_end_str = boss.get('seasonEnd', '2026/09/30')
    season_start = parse_date(season_start_str)
    season_end = parse_date(season_end_str)

    hero_stats_map = {}
    for h in heroes:
        name = h.get('name')
        hero_stats_map[name] = {
            'name': name,
            'guild': h.get('guild', '自由英雄'),
            'age': h.get('age', 35),
            'maxHr': h.get('maxHr', 185),
            'rpgClass': h.get('rpgClass', '狂戰士'),
            'avatar': h.get('avatar', f"https://api.dicebear.com/7.x/bottts/svg?seed={name}&backgroundColor=0f172a"),
            'validWorkouts': 0,
            'totalWorkouts': 0,
            'totalDuration': 0,
            'totalCalories': 0,
            'physDmg': 0,
            'magDmg': 0,
            'critDmg': 0,
            'totalDamage': 0,
            'maxGap': 0,
            'trimp': 0,
            'suffer': 0,
            'zone2Count': 0
        }

    valid_season_acts = []
    for act in activities:
        if act.get('isExcluded'):
            continue
        
        hero_name = act.get('hero')
        if hero_name not in hero_stats_map:
            continue

        act_date = parse_date(act.get('date') or act.get('time'))
        in_season = True
        if season_start and season_end and act_date:
            in_season = (season_start <= act_date <= season_end)

        dur = float(act.get('duration', 0) or 0)
        cal = float(act.get('calories', 0) or 0)
        avg_hr = float(act.get('avgHr', 0) or 0)
        max_hr = float(act.get('maxHr', 0) or 0)
        gap = float(act.get('gap', 0) if act.get('gap') is not None else max(0, max_hr - avg_hr))
        trimp = float(act.get('trimp', 0) or 0)
        
        h_info = hero_stats_map[hero_name]
        if trimp <= 0 and h_info['maxHr'] > 0 and avg_hr > 0:
            ratio = avg_hr / h_info['maxHr']
            trimp = dur * ratio * math.exp(1.92 * ratio)
        
        is_zone2 = (0.60 * h_info['maxHr'] <= avg_hr <= 0.75 * h_info['maxHr']) if h_info['maxHr'] > 0 else False

        h = hero_stats_map[hero_name]
        h['totalWorkouts'] += 1
        h['totalDuration'] += dur
        h['totalCalories'] += cal
        if is_zone2:
            h['zone2Count'] += 1

        if dur >= min_dur and in_season:
            h['validWorkouts'] += 1
            p_dmg = round(cal)
            m_dmg = round(trimp * mag_mult) if trimp > 0 else 0

            h['physDmg'] += p_dmg
            h['magDmg'] += m_dmg
            h['maxGap'] = max(h['maxGap'], int(gap))
            valid_season_acts.append(act)

    tot_phys = 0
    tot_mag = 0
    tot_crit = 0
    tot_dmg = 0

    for h in hero_stats_map.values():
        if h['validWorkouts'] > 0:
            h['critDmg'] = h['maxGap'] * 100
        h['totalDamage'] = h['physDmg'] + h['magDmg'] + h['critDmg']
        tot_phys += h['physDmg']
        tot_mag += h['magDmg']
        tot_crit += h['critDmg']
        tot_dmg += h['totalDamage']

    hero_list = list(hero_stats_map.values())
    hero_list.sort(key=lambda x: x['totalDamage'], reverse=True)
    for idx, r in enumerate(hero_list):
        r['rank'] = idx + 1
        r['badge'] = '👑' if idx == 0 else ('🥈' if idx == 1 else ('🥉' if idx == 2 else ''))

    # Guild contributions
    guild_map = {}
    for g in guilds:
        guild_map[g['name']] = {
            'name': g['name'],
            'badge': g.get('badge', '🛡️'),
            'color': g.get('color', '#3b82f6'),
            'members': g.get('members', []),
            'totalDamage': 0
        }
    for h in hero_list:
        if h['guild'] in guild_map:
            guild_map[h['guild']]['totalDamage'] += h['totalDamage']
    
    guild_contribs = list(guild_map.values())
    guild_contribs.sort(key=lambda x: x['totalDamage'], reverse=True)

    max_hp = boss.get('maxHp', 350000)
    current_hp = max(0, max_hp - tot_dmg)
    hp_pct = round((current_hp / max_hp) * 100, 1) if max_hp > 0 else 0

    return {
        'heroStats': hero_list,
        'guildContributions': guild_contribs,
        'summary': {
            'totalPhys': tot_phys,
            'totalMag': tot_mag,
            'totalCrit': tot_crit,
            'totalDamage': tot_dmg
        },
        'boss': {
            'name': boss.get('name', '🌩️ 墮落雷神・索爾 (Fallen Thor)'),
            'avatar': boss.get('avatar', 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600&auto=format&fit=crop&q=80'),
            'description': boss.get('description', '索爾受到雷霆魔劍侵蝕陷入瘋狂！全服英雄透過每日汗水鍛鍊，轉化為真實輸出！'),
            'maxHp': max_hp,
            'currentHp': current_hp,
            'hpPct': hp_pct,
            'seasonStart': season_start_str,
            'seasonEnd': season_end_str
        },
        'validActivities': valid_season_acts
    }

class GameRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=PUBLIC_DIR, **kwargs)

    def do_GET(self):
        if self.path in ('/admin', '/admin/', '/admin.html'):
            self.path = '/admin.html'
            return super().do_GET()

        if self.path == "/api/crawler/config":
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            cfg_path = os.path.join(os.path.dirname(__file__), "data", "crawler_config.json")
            if os.path.exists(cfg_path):
                with open(cfg_path, "r", encoding="utf-8") as f:
                    self.wfile.write(f.read().encode("utf-8"))
            else:
                self.wfile.write(b"{}")
            return

        if self.path == '/api/state':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.end_headers()
            data = load_data()
            self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))
            return

        elif self.path == '/api/hero_stats':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.end_headers()
            data = load_data()
            full_stats = calculate_full_season_stats(data)
            self.wfile.write(json.dumps(full_stats['heroStats'], ensure_ascii=False).encode('utf-8'))
            return

        elif self.path == '/api/season_stats':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.end_headers()
            data = load_data()
            full_stats = calculate_full_season_stats(data)
            self.wfile.write(json.dumps(full_stats, ensure_ascii=False).encode('utf-8'))
            return

        elif self.path == '/api/stream':
            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream')
            self.send_header('Cache-Control', 'no-cache')
            self.send_header('Connection', 'keep-alive')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()

            q = queue.Queue(maxsize=100)
            with sse_lock:
                sse_clients.append(q)

            try:
                init_data = load_data()
                self.wfile.write(f"event: init\ndata: {json.dumps(init_data, ensure_ascii=False)}\n\n".encode('utf-8'))
                self.wfile.flush()

                while True:
                    try:
                        msg = q.get(timeout=25.0)
                        self.wfile.write(msg.encode('utf-8'))
                        self.wfile.flush()
                    except queue.Empty:
                        self.wfile.write(b": ping\n\n")
                        self.wfile.flush()
            except (ConnectionResetError, BrokenPipeError, Exception):
                pass
            finally:
                with sse_lock:
                    if q in sse_clients:
                        sse_clients.remove(q)
            return

        return super().do_GET()

    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length).decode('utf-8')
        try:
            req_data = json.loads(body)
        except Exception:
            req_data = {}

        # 1. Add Activity
        if self.path == '/api/activities/add':
            data = load_data()
            if 'activities' not in data:
                data['activities'] = []
            
            # Enrich manual activity with all physiological calculations
            hero_name = req_data.get('hero')
            heroes = data.get('heroes', [])
            hero_info = next((h for h in heroes if h.get('name') == hero_name), None)
            max_hr_ref = hero_info.get('maxHr', 185) if hero_info else 185
            
            dur = float(req_data.get('duration', 0) or 0)
            avg_hr = float(req_data.get('avgHr', 0) or 0)
            max_hr = float(req_data.get('maxHr', 0) or 0)
            cal = float(req_data.get('calories', 0) or 0)
            
            gap = max(0.0, max_hr - avg_hr)
            trimp = 0.0
            if max_hr_ref > 0 and avg_hr > 0:
                ratio = avg_hr / max_hr_ref
                trimp = dur * ratio * math.exp(1.92 * ratio)
            
            suffer = (pow(avg_hr / 150.0, 2) * dur) if avg_hr > 0 else 0.0
            density = (suffer / dur) if dur > 0 else 0.0
            is_zone2 = (0.60 * max_hr_ref <= avg_hr <= 0.75 * max_hr_ref) if max_hr_ref > 0 else False
            zone_label = '🟢 有氧燃脂' if is_zone2 else ('🚀 極限無氧' if avg_hr > 0.75 * max_hr_ref else '🚶 暖身/恢復')
            
            is_valid = dur >= 30.0
            p_dmg = round(cal) if is_valid else 0
            m_dmg = round(trimp * 15.0) if is_valid else 0
            
            req_data['isManual'] = True
            req_data['guild'] = hero_info.get('guild', '自由英雄') if hero_info else '自由英雄'
            req_data['gap'] = round(gap, 1)
            req_data['trimp'] = round(trimp, 1)
            req_data['suffer'] = round(suffer, 1)
            req_data['density'] = round(density, 2)
            req_data['isZone2'] = is_zone2
            req_data['zoneLabel'] = zone_label
            req_data['isValidAttack'] = is_valid
            req_data['physDmg'] = p_dmg
            req_data['magDmg'] = m_dmg
            req_data['damage'] = p_dmg + m_dmg
            
            data['activities'].insert(0, req_data)
            save_data(data)
            broadcast_event('new_attack', req_data)

            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({"success": True, "activity": req_data}).encode('utf-8'))
            return

        # 2. Delete Activity (Permanent Server-side deletion)
        elif self.path == '/api/activities/delete':
            act_id = str(req_data.get('id', ''))
            data = load_data()
            activities = data.get('activities', [])
            before_len = len(activities)
            data['activities'] = [a for a in activities if str(a.get('id')) != act_id]
            after_len = len(data['activities'])
            save_data(data)
            broadcast_event('game_updated', data)

            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({"success": True, "deleted": before_len > after_len, "id": act_id}).encode('utf-8'))
            return

        # 3. Toggle Exclude Activity (Permanent Server-side exclusion)
        elif self.path == '/api/activities/exclude':
            act_id = str(req_data.get('id', ''))
            is_excluded = bool(req_data.get('isExcluded', True))
            data = load_data()
            for a in data.get('activities', []):
                if str(a.get('id')) == act_id:
                    a['isExcluded'] = is_excluded
                    break
            save_data(data)
            broadcast_event('game_updated', data)

            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({"success": True, "id": act_id, "isExcluded": is_excluded}).encode('utf-8'))
            return

        # 4. Save Snapshots
        elif self.path == '/api/snapshots/save':
            snapshot = req_data.get('snapshot')
            data = load_data()
            if 'snapshots' not in data:
                data['snapshots'] = []
            
            snap_id = snapshot.get('id')
            data['snapshots'] = [s for s in data['snapshots'] if s.get('id') != snap_id]
            data['snapshots'].insert(0, snapshot)
            data['archivedSeasons'] = data['snapshots']
            save_data(data)
            broadcast_event('game_updated', data)

            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({"success": True, "snapshot": snapshot}).encode('utf-8'))
            return

        # 5. Delete Snapshot
        elif self.path == '/api/snapshots/delete':
            snap_id = str(req_data.get('id', ''))
            data = load_data()
            if 'snapshots' in data:
                data['snapshots'] = [s for s in data['snapshots'] if str(s.get('id')) != snap_id]
                data['archivedSeasons'] = data['snapshots']
            save_data(data)
            broadcast_event('game_updated', data)

            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({"success": True, "id": snap_id}).encode('utf-8'))
            return

        # 6. Global Settings Update
        elif self.path == '/api/settings/update':
            data = load_data()
            for k, v in req_data.items():
                if isinstance(v, dict) and k in data and isinstance(data[k], dict):
                    data[k].update(v)
                else:
                    data[k] = v
            save_data(data)
            broadcast_event('game_updated', data)

            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({"success": True, "state": data}).encode('utf-8'))
            return

                # 7. Crawler Config Update
        elif self.path == "/api/crawler/config":
            cfg_path = os.path.join(os.path.dirname(__file__), "data", "crawler_config.json")
            with open(cfg_path, "w", encoding="utf-8") as f:
                json.dump(req_data, f, ensure_ascii=False, indent=2)

            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"success": True, "config": req_data}).encode("utf-8"))
            return

        # 8. Crawler Run On-Demand
        elif self.path == "/api/crawler/run":
            import subprocess
            scr_path = os.path.join(os.path.dirname(__file__), "scripts", "strava_scraper.py")
            try:
                res = subprocess.run([sys.executable, scr_path], capture_output=True, text=True, timeout=60)
                output = res.stdout + ("\n" + res.stderr if res.stderr else "")
                success = (res.returncode == 0)
            except Exception as e:
                output = f"執行異常：{e}"
                success = False

            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"success": success, "output": output}).encode("utf-8"))
            return

        self.send_response(404)
        self.end_headers()

class ThreadedTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True

def run_server():
    with ThreadedTCPServer(("", PORT), GameRequestHandler) as httpd:
        print(f"🎮 鋼鐵英雄紀元多執行緒伺服器啟動於 http://0.0.0.0:{PORT}")
        httpd.serve_forever()

if __name__ == '__main__':
    run_server()


# Vercel entrypoint compatibility
handler = GameRequestHandler
app = GameRequestHandler
