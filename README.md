# ANTIGRAVITY Agent Studio - Visual Agent Canvas

這是一個基於 **React (Vite) + Cloudflare Pages Functions + Cloudflare D1 (SQLite)** 開發的視覺化多 Agent 協作與對話調試平台。使用者可以透過畫布配置 Agent 連線，由後端進行拓撲排序順序執行，並提供動態 Prompt 調試與訊息重新生成功能。

---

## 🛠️ 開發環境需求

* **Node.js**: 建議使用 `v18` 或以上版本。
* **npm**: 通常隨 Node.js 一起安裝。

---

## 🚀 跨電腦開發與執行步驟

當你在新的電腦上複製（Clone）此專案後，請依序執行以下步驟：

### 1. 安裝相依套件
在專案根目錄下執行：
```bash
npm install
```

### 2. 設定環境變數與 API 金鑰

#### 🔑 後端 API 金鑰設定 (LLM Provider)
後端 Hono API 會使用 API 金鑰來呼叫 LLM 服務。在本地端開發時，Wrangler 會讀取 `.dev.vars` 中的環境變數。

1. 將專案根目錄下的 `.dev.vars.example` 複製並重新命名為 `.dev.vars`：
   ```bash
   cp .dev.vars.example .dev.vars
   ```
2. 開啟 `.dev.vars` 並填入你擁有的 API 金鑰（如 `GEMINI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`）。

#### 🌐 前端即時同步設定 (Firebase - 選填)
本專案支援以 Firebase Realtime Database 即時同步 Agent 執行狀態。

1. 如果需要啟用此功能，將 `.env.example` 複製為 `.env.local`：
   ```bash
   cp .env.example .env.local
   ```
2. 填入你的 Firebase 應用程式配置。
3. *備註：若不填寫，系統會自動流暢地降級為本地記憶體同步（Local In-memory fallback），不影響核心功能使用。*

---

### 3. 初始化本地 D1 資料庫
在本地端開發時，我們需要建立 SQLite 資料表。請使用 Wrangler 執行 `schema.sql` 初始化本地資料庫：
```bash
npx wrangler d1 execute ai-team-db --local --file=./schema.sql
```
這會在本地的 `.wrangler` 目錄下建立並載入資料庫結構。

---

### 4. 啟動本地開發伺服器
執行以下指令來啟動整合了 Cloudflare Pages Functions 後端與 Vite 前端的開發伺服器：
```bash
npm run pages:dev
```
啟動成功後，請開啟瀏覽器瀏覽 **`http://localhost:8788`**。

---

## 📂 專案結構簡介

* **`src/`**：前端 React 原始碼
  * [src/App.tsx](file:///Users/vic/aiTeam/src/App.tsx)：主應用程式狀態與佈局控制。
  * [src/components/Canvas.tsx](file:///Users/vic/aiTeam/src/components/Canvas.tsx)：視覺化節點連線畫布（基於 React Flow）。
  * [src/components/AgentNode.tsx](file:///Users/vic/aiTeam/src/components/AgentNode.tsx)：自訂的 Agent 節點卡片元件。
  * [src/components/ChatPanel.tsx](file:///Users/vic/aiTeam/src/components/ChatPanel.tsx)：聊天面板與行內 Prompt 微調編輯器。
  * [src/utils/firebase.ts](file:///Users/vic/aiTeam/src/utils/firebase.ts)：Firebase 同步與本地 Event Emitter 控制器。
* **`functions/`**：後端 Cloudflare Pages Functions (Serverless APIs)
  * [functions/api/[[path]].ts](file:///Users/vic/aiTeam/functions/api/[[path]].ts)：核心 Hono API 進入點與 Pipeline 執行邏輯（拓撲排序、訊息遞送、資料庫讀寫）。
  * [functions/api/utils/llm.ts](file:///Users/vic/aiTeam/functions/api/utils/llm.ts)：多模型供應商（Gemini, OpenAI, Anthropic）的 fetch 介面封裝。
* **`schema.sql`**：Cloudflare D1 資料庫綱要定義。
* **`wrangler.toml`**：Cloudflare Pages 部署設定檔。

---

## 🔒 Git 提交注意事項

為保護敏感資訊，以下檔案已加入到 `.gitignore`，**請絕對不要提交**到 GitHub：
* 包含 API 金鑰的 `.dev.vars`
* 包含 Firebase 設定的 `.env`, `.env.local`
* 本地資料庫狀態與快取 `.wrangler/`
* 各種日誌檔案與 `node_modules/`
