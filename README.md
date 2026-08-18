# Workforce War Room

工讀生總工作藍圖與管理儀表板。正式工作、事件、驗收及薪資仍由 InfoCenter 管理；本網站負責唯讀彙整、資料新鮮度、例外提示及工作建議。

## 主要視圖

- 總覽：InfoCenter 待派、進行中、已完成、逾期及三種覆蓋率。
- 工作盤面：讀取匿名化 InfoCenter 工作摘要，優先辨識「進行中但無主責」與「已有主責／事件卻仍待開始」，並提供單筆安全處理指引。
- 工讀生狀態：只呈現 active 成員的遮罩姓名與遮罩 Email；本週容量與四軸知能證據分開呈現，能力階段一律待人工確認。
- 工作藍圖：工作候選、待派、執行、驗收、完成及結算六個階段。
- 工作建議：依人員涵蓋、逾期、評論工時樣本與可用工時缺口產生管理建議；每則建議可展開逐筆明細、複製修正清單，再由管理者到 InfoCenter 人工確認與修改。
- 設定審核中心：以意圖導引方式審核 9 個欄位、3 組工作／事件範本、13 個計算規格與執行證據狀態；不直接寫入 InfoCenter。

## 資料來源

主頁不再讀取舊的 `data/dashboard.json`，目前使用：

- `data/interns.public.json`
- `data/infocenter-work-summary.json`（匿名工作、狀態、P50 / P80 與覆蓋率）
- `data/work-rhythm.internal.json`（人員使用穩定匿名代碼；公開人員卡片另由安全快照提供遮罩姓名與 Email）
- `data/radar-week.json`
- `data/radar-tracking.json`
- `data/radar-work-items.md`
- `data/work-blueprint.json`
- `data/capacity-week.public.json`（本週容量本地骨架；不填假資料，僅接受匿名人員 ID）
- `data/event-experience.public.json`（只含 stable hashed personId 與已驗證事件的彙總分鐘、XP、件數及日期）

`data/dashboard.json` 保留作為舊流程相容資料，不應用於新版首頁指標。

## 隱私邊界

首頁只顯示遮罩姓名與遮罩 Email，不得顯示電話、完整 Email、地址、銀行資料、身分資料、薪資金額、原始事件標題或個人長篇備註。薪資只顯示 `paid / due` 狀態。

能力採社工知能、財務知能、AI 知能、馴錢師知能四軸；每位 active 成員顯示四項知能證據指數。歷史工作只產生待人工確認的適配候選，不自動評等、派工或調薪。語音轉文字與自定義名詞以馴錢師知能為主、AI 知能為輔。

正式經驗值以 InfoCenter 事件管理為準：只有 review SUCCESS、事件已關閉、成員可對應且核准分鐘可解析的事件，才以 `Math.round(verifiedMinutes / 6)` 計入；同一 eventId 只計一次。`event-experience-policy.js` 與 `local-spec/event-experience.public.schema.json` 分別在 runtime 與資料契約層執行 fail-closed 驗證，來源狀態通過時固定顯示 `total/scanned、0 errors、verified`。只有事件詳情完成全量對帳、來源 fingerprint 與 active roster 相符、所有 error／duplicate／ID mismatch 都為 0，才在首頁列為正式 XP；部分、畸形或 roster 不符時一律顯示「待事件核對」。完整核對後沒有合格事件者顯示「0 XP／尚無合格事件」。工時報帳僅作歷史投入參考，不會替代事件確認 XP。薪資階段採共同門檻；量化結果只列為審查候選，人工驗收、返工與主管核准尚未完成前不得視為調薪決定。

InfoCenter 評論只抽取「實際耗時」數字；公開摘要不保存工作標題、評論原文、姓名、原始工作／事件／組織 ID。工時信心以樣本數標示，無樣本時明確使用規劃基準。

事件 XP 公開檔只允許 12 位 stable hashed `personId`、彙總分鐘、XP、合格事件數與首末日期；原始 event／work／organization ID、標題、評論、姓名、聯絡資料、薪資、銀行與身分資料都不得進入 repo。私有 ledger 與 raw snapshot 只留在 repo 外。

## 本機預覽

在專案根目錄啟動任一靜態 HTTP server，例如：

```powershell
python -m http.server 8765 --bind 127.0.0.1
```

再開啟 `http://127.0.0.1:8765/`。

## 部署

正式站：[https://workforce-war-room.vercel.app](https://workforce-war-room.vercel.app)

設定審核中心：[https://workforce-war-room.vercel.app/local-spec/](https://workforce-war-room.vercel.app/local-spec/)

本專案使用 Vercel 靜態託管，且以 `vercel.json`、頁面 robots meta 與 `robots.txt` 阻擋搜尋索引。正式 push 或部署需 Kevin 核准。

`noindex` 只降低被搜尋引擎索引的機會，不是存取控制；因此公開版本只包含去識別資料，不包含原始工作標題、完整姓名、完整 Email、電話、評論或 InfoCenter ID。

## 設計文件

`DESIGN.draft.md` 只保留設計決策紀錄；實際介面以本次已驗證的管理流程與資料邊界為準，不將草案視為硬性規格。
