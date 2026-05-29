# Workforce War Room

Kevin 的工讀生人力戰情系統 v0.1。

這個靜態站用來集中呈現：

- 自訂義名詞審核狀態
- 工讀生工作進度
- 人才庫與能力訊號
- 薪資與負載摘要
- 下週派工建議

目前資料是 seed data。後續可接每週 InfoCenter 審核自動化輸出的 JSON。

## Data source

The dashboard reads `data/dashboard.json` as its public snapshot source.

Codex should update that snapshot after reading the latest necessary sources, such as:

- InfoCenter event/review/salary status
- Codex review workflow records
- Kevin-provided intern profile updates
- GitHub/Vercel deployment state when relevant

Because this is a public dashboard, private details should be summarized before publishing.

## Deployment

This site is designed for Vercel static hosting.

Production URL:

https://workforce-war-room.vercel.app

Review-stage search indexing controls are enabled:

- HTML `noindex,nofollow,noarchive`
- `robots.txt` blocks crawlers
- `vercel.json` sets `X-Robots-Tag`
