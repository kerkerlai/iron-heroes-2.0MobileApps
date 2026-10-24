/**
 * 鋼鐵英雄紀元 2.0 (獨立版) — 部署環境設定
 * -------------------------------------------------------------------------
 * 這個網站使用「自己的」Supabase 資料庫，與舊版遊戲完全分開。
 *   supabaseUrl : 新 Supabase 專案網址 (Project Settings → API → Project URL)
 *   anonKey     : 新專案的 anon public key (可公開；絕對不要放 service_role key)
 *   mode        : 'production' 讀寫上面的資料庫；'sandbox' 寫入只留在瀏覽器 (測試用)
 *   label       : 顯示用標籤
 */
window.IRON_ENV = {
  mode: 'production',
  label: '鋼鐵英雄紀元 2.0',
  supabaseUrl: 'https://frhnfvdxukwzuzzklzyf.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZyaG5mdmR4dWt3enV6emtsenlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI4MDk5NzMsImV4cCI6MjEwODM4NTk3M30.h9sIlytfgS26EJ1sNqGeQbp0rHGNfKxEZOMcm4orNwI'
};
