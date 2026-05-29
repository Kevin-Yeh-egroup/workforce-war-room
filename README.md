# Workforce War Room

Kevin 的工讀生人力戰情系統 v0.1。

這個靜態站用來集中呈現：

- 自訂義名詞審核狀態
- 工讀生工作進度
- 人才庫與能力訊號
- 薪資與負載摘要
- 下週派工建議

目前資料是 seed data。後續可接每週 InfoCenter 審核自動化輸出的 JSON。

## Deployment

This site is designed for Vercel static hosting.

Production URL:

https://workforce-war-room.vercel.app

Review-stage search indexing controls are enabled:

- HTML `noindex,nofollow,noarchive`
- `robots.txt` blocks crawlers
- `vercel.json` sets `X-Robots-Tag`
