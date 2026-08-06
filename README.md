# Workforce War Room

工讀生總工作藍圖與管理儀表板。正式工作、事件、驗收及薪資仍由 InfoCenter 管理；本網站負責唯讀彙整、資料新鮮度、例外提示及工作建議。

## 主要視圖

- 總覽：InfoCenter 待派、進行中、已完成、逾期及三種覆蓋率。
- 工作盤面：讀取匿名化 InfoCenter 工作摘要，依待派、逾期、進行中及已完成篩選。
- 工讀生狀態：使用公開安全快照，只呈現遮罩姓名、狀態、歷史工時與 paid / due。
- 工作藍圖：工作候選、待派、執行、驗收、完成及結算六個階段。
- 工作建議：依人員涵蓋、逾期、評論工時樣本與可用工時缺口產生管理建議。

## 資料來源

主頁不再讀取舊的 `data/dashboard.json`，目前使用：

- `data/interns.public.json`
- `data/infocenter-work-summary.json`（匿名工作、狀態、P50 / P80 與覆蓋率）
- `data/work-rhythm.internal.json`（人員使用穩定匿名代碼，不顯示姓名）
- `data/radar-week.json`
- `data/radar-tracking.json`
- `data/radar-work-items.md`
- `data/work-blueprint.json`

`data/dashboard.json` 保留作為舊流程相容資料，不應用於新版首頁指標。

## 隱私邊界

首頁不得顯示電話、Email、地址、銀行資料、身分資料、薪資金額、原始事件標題或個人長篇備註。薪資只顯示 `paid / due` 狀態。

InfoCenter 評論只抽取「實際耗時」數字；公開摘要不保存工作標題、評論原文、姓名、原始工作／事件／組織 ID。工時信心以樣本數標示，無樣本時明確使用規劃基準。

## 本機預覽

在專案根目錄啟動任一靜態 HTTP server，例如：

```powershell
python -m http.server 8765 --bind 127.0.0.1
```

再開啟 `http://127.0.0.1:8765/`。

## 部署

正式站：[https://workforce-war-room.vercel.app](https://workforce-war-room.vercel.app)

本專案使用 Vercel 靜態託管，且以 `vercel.json`、頁面 robots meta 與 `robots.txt` 阻擋搜尋索引。正式 push 或部署需 Kevin 核准。

## 設計文件

`DESIGN.draft.md` 只保留設計決策紀錄；實際介面以本次已驗證的管理流程與資料邊界為準，不將草案視為硬性規格。
