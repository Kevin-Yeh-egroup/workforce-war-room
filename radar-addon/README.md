# Radar Add-on（附加功能，不改動主站）

用途：在 Workforce War Room 旁邊，提供一個獨立頁面來「看每週雷達、搜尋/篩選、看追蹤清單、匯出 Markdown」。

## 入口
- `radar-addon/index.html`

## 資料檔（同 repo、可被 Vercel 靜態讀取）
- `data/radar-week.json`
- `data/radar-tracking.json`

> 每週更新只需要覆寫 `data/radar-week.json`，並視情況更新 `data/radar-tracking.json`。

