# Microsoft Todo Integrator - 設計・開発計画

## 概要

Microsoft ToDoとObsidianのDaily Noteを双方向同期するプラグイン
- Microsoft ToDoの新規タスクを自動的にObsidianの当日Daily NoteのToDoセクションに追加
- Obsidianの未完了タスクをMicrosoft ToDoに同期（重複チェック付き）
- 完了タスクの双方向同期とDataView準拠の完了日時記録

## アーキテクチャ概要

```
main.ts (TodoIntegratorPlugin)
├── Core Components
│   ├── Logger
│   ├── ErrorHandler
│   ├── PluginSettings
│   └── Authentication & API
│       ├── MSALAuthenticationManager
│       └── TodoApiClient
├── Data Management
│   ├── DailyNoteManager
│   ├── ObsidianTodoParser
│   └── TodoSynchronizer
└── UI Components
    ├── TodoIntegratorSettingsTab
    ├── SidebarButton
    └── AuthenticationModal
```

## 関数分解・開発計画

### 1. プラグインライフサイクル管理

#### `TodoIntegratorPlugin.onload()`
```typescript
async onload(): Promise<void>
```
- `initializeComponents()` - コアコンポーネントの初期化
- `loadSettings()` - 設定の読み込みと適用
- `addCommands()` - コマンドパレット項目の追加
- `addRibbonIcon()` - リボンアイコンの追加
- `addSettingTab()` - 設定タブの追加
- `createSidebarButton()` - サイドバーボタンの作成
- `initializeAfterAuth()` - 認証後初期化（条件付き）

#### `TodoIntegratorPlugin.onunload()`
```typescript
onunload(): void
```
- `cleanup()` - リソースクリーンアップ
- `stopAutoSync()` - 自動同期の停止

### 2. 認証機能

#### `MSALAuthenticationManager.initialize()`
```typescript
async initialize(clientId: string, tenantId: string): Promise<void>
```
- MSAL PublicClientApplicationの設定
- ロガー設定
- 権限スコープの設定

#### `MSALAuthenticationManager.authenticate()`
```typescript
async authenticate(deviceCodeCallback?: Function): Promise<AuthenticationResult>
```
- `attemptSilentAuth()` - サイレント認証の試行
- `initiateDeviceCodeFlow()` - デバイスコードフローの開始
- `handleDeviceCodeCallback()` - UIへのデバイスコード表示

#### `MSALAuthenticationManager.getAccessToken()`
```typescript
async getAccessToken(): Promise<string>
```
- `checkTokenExpiry()` - トークン有効期限チェック
- `refreshTokenSilently()` - サイレントトークン更新

### 3. Microsoft Graph API連携

#### `TodoApiClient.initialize()`
```typescript
initialize(accessToken: string): void
```
- Graph Clientの初期化
- 認証プロバイダーの設定

#### `TodoApiClient.getOrCreateTaskList()`
```typescript
async getOrCreateTaskList(listName: string): Promise<string>
```
- `fetchExistingLists()` - 既存リスト取得
- `findTargetList()` - 対象リスト検索
- `createNewList()` - 新規リスト作成（必要時）

#### `TodoApiClient.getTasks()`
```typescript
async getTasks(): Promise<TodoTask[]>
```
- `fetchTasksFromGraph()` - Graph APIからタスク取得
- `transformTaskData()` - タスクデータの変換

#### `TodoApiClient.createTask()`
```typescript
async createTask(title: string, startDate?: string): Promise<TodoTask>
```
- `validateTaskInput()` - 入力値検証
- `formatTaskData()` - タスクデータフォーマット
- `submitToGraph()` - Graph APIへの送信

#### `TodoApiClient.completeTask()`
```typescript
async completeTask(taskId: string): Promise<void>
```
- `validateTaskId()` - タスクID検証
- `updateTaskStatus()` - タスク状態更新

#### `TodoApiClient.getUserInfo()`
```typescript
async getUserInfo(): Promise<{email: string, displayName: string}>
```
- `fetchUserProfile()` - ユーザープロファイル取得
- `extractUserData()` - ユーザーデータ抽出

### 4. Daily Note管理

#### `DailyNoteManager.getTodayNotePath()`
```typescript
getTodayNotePath(): string
```
- `formatDateString()` - 日付文字列フォーマット
- `constructFilePath()` - ファイルパス構築

#### `DailyNoteManager.ensureTodayNoteExists()`
```typescript
async ensureTodayNoteExists(): Promise<string>
```
- `checkFileExists()` - ファイル存在確認
- `createDailyNote()` - Daily Note作成
- `addDefaultTemplate()` - デフォルトテンプレート追加

#### `DailyNoteManager.findOrCreateTodoSection()`
```typescript
async findOrCreateTodoSection(filePath: string): Promise<number>
```
- `parseFileContent()` - ファイル内容解析
- `locateTodoSection()` - ToDoセクション検索
- `insertTodoSection()` - ToDoセクション挿入（必要時）

#### `DailyNoteManager.addTaskToTodoSection()`
```typescript
async addTaskToTodoSection(filePath: string, taskTitle: string, todoId?: string): Promise<void>
```
- `findInsertionPoint()` - 挿入位置特定
- `formatTaskLine()` - タスク行フォーマット
- `insertTaskLine()` - タスク行挿入

#### `DailyNoteManager.getDailyNoteTasks()`
```typescript
async getDailyNoteTasks(filePath: string): Promise<DailyNoteTask[]>
```
- `parseFileForTasks()` - ファイル内タスク解析
- `extractTaskMetadata()` - タスクメタデータ抽出

### 5. Obsidianタスク解析

#### `ObsidianTodoParser.parseVaultTodos()`
```typescript
async parseVaultTodos(): Promise<ObsidianTask[]>
```
- `scanMarkdownFiles()` - Markdownファイルスキャン
- `extractCheckboxes()` - チェックボックス抽出
- `parseTaskMetadata()` - タスクメタデータ解析

#### `ObsidianTodoParser.updateCheckboxStatus()`
```typescript
async updateCheckboxStatus(filePath: string, lineNumber: number, completed: boolean, completionDate?: string): Promise<void>
```
- `readFileContent()` - ファイル内容読み込み
- `modifyTaskLine()` - タスク行修正
- `addCompletionDate()` - 完了日追加（DataView形式）
- `writeFileContent()` - ファイル内容書き込み

#### `ObsidianTodoParser.extractTaskTitle()`
```typescript
extractTaskTitle(taskLine: string): string
```
- `removeCheckboxSyntax()` - チェックボックス構文除去
- `cleanupTaskText()` - タスクテキストクリーンアップ

### 6. 同期ロジック

#### `TodoSynchronizer.performFullSync()`
```typescript
async performFullSync(): Promise<SyncResult>
```
- `syncMsftToObsidian()` - Microsoft Todo → Obsidian同期
- `syncObsidianToMsft()` - Obsidian → Microsoft Todo同期
- `syncCompletions()` - 完了状態双方向同期
- `generateSyncReport()` - 同期結果レポート生成

#### `TodoSynchronizer.syncMsftToObsidian()`
```typescript
async syncMsftToObsidian(): Promise<{added: number, errors: string[]}>
```
- `fetchMsftTasks()` - Microsoft Todoタスク取得
- `fetchObsidianTasks()` - Obsidianタスク取得
- `findNewMsftTasks()` - 新規Microsoft Todoタスク特定
- `addTasksToDailyNote()` - Daily Noteへタスク追加

#### `TodoSynchronizer.syncObsidianToMsft()`
```typescript
async syncObsidianToMsft(): Promise<{added: number, errors: string[]}>
```
- `findNewObsidianTasks()` - 新規Obsidianタスク特定
- `createMsftTasks()` - Microsoft Todoタスク作成
- `linkTasksWithIds()` - タスクID連携

#### `TodoSynchronizer.syncCompletions()`
```typescript
async syncCompletions(): Promise<{completed: number, errors: string[]}>
```
- `findCompletedMsftTasks()` - 完了Microsoft Todoタスク特定
- `findCompletedObsidianTasks()` - 完了Obsidianタスク特定
- `syncCompletionStates()` - 完了状態同期
- `addCompletionDates()` - 完了日時記録

#### `TodoSynchronizer.detectDuplicates()`
```typescript
detectDuplicates(obsidianTasks: ObsidianTask[], msftTasks: TodoTask[]): TaskPair[]
```
- `normalizeTaskTitles()` - タスクタイトル正規化
- `compareTaskTitles()` - タスクタイトル比較
- `generateTaskPairs()` - タスクペア生成

### 7. 設定管理

#### `PluginSettings.loadSettings()`
```typescript
async loadSettings(): Promise<TodoIntegratorSettings>
```
- `readSettingsFile()` - 設定ファイル読み込み
- `mergeWithDefaults()` - デフォルト値とマージ
- `validateSettings()` - 設定値検証

#### `PluginSettings.saveSettings()`
```typescript
async saveSettings(settings: TodoIntegratorSettings): Promise<void>
```
- `validateBeforeSave()` - 保存前検証
- `writeSettingsFile()` - 設定ファイル書き込み

#### `PluginSettings.updateSetting()`
```typescript
updateSetting<K extends keyof TodoIntegratorSettings>(key: K, value: TodoIntegratorSettings[K]): void
```
- `validateSettingValue()` - 設定値検証
- `updateInMemorySettings()` - メモリ内設定更新

#### `PluginSettings.getClientConfig()`
```typescript
getClientConfig(): {clientId: string, tenantId: string}
```
- `extractAuthConfig()` - 認証設定抽出
- `validateAuthConfig()` - 認証設定検証

### 8. UI コンポーネント

#### `TodoIntegratorSettingsTab.display()`
```typescript
display(): void
```
- `renderAuthSection()` - 認証セクション描画
- `renderSyncSettings()` - 同期設定描画
- `renderDailyNoteSettings()` - Daily Note設定描画
- `renderAdvancedSettings()` - 詳細設定描画

#### `AuthenticationModal.showDeviceCodeInstructions()`
```typescript
showDeviceCodeInstructions(userCode: string, verificationUri: string): void
```
- `updateProgress()` - 進行状況更新
- `displayDeviceCode()` - デバイスコード表示
- `showInstructions()` - 認証手順表示
- `enableActionButtons()` - アクションボタン有効化

#### `SidebarButton.updateSyncStatus()`
```typescript
updateSyncStatus(status: 'idle' | 'syncing' | 'success' | 'error', message?: string): void
```
- `clearPreviousStatus()` - 前回状態クリア
- `setStatusIcon()` - ステータスアイコン設定
- `setStatusText()` - ステータステキスト設定
- `updateButtonState()` - ボタン状態更新

### 9. エラーハンドリング

#### `ErrorHandler.handleApiError()`
```typescript
handleApiError(error: any): string
```
- `classifyError()` - エラー分類
- `extractErrorMessage()` - エラーメッセージ抽出
- `generateUserFriendlyMessage()` - ユーザー向けメッセージ生成

#### `ErrorHandler.logError()`
```typescript
logError(message: string, context: string, error?: any): void
```
- `formatErrorLog()` - エラーログフォーマット
- `addContextInfo()` - コンテキスト情報追加
- `writeToLogger()` - ロガーへの書き込み

### 10. ログ機能

#### `Logger.setLogLevel()`
```typescript
setLogLevel(level: 'debug' | 'info' | 'error'): void
```
- `validateLogLevel()` - ログレベル検証
- `updateLoggerConfig()` - ロガー設定更新

#### `Logger.log()`
```typescript
private log(level: string, message: string, context?: any): void
```
- `checkLogLevel()` - ログレベルチェック
- `formatLogEntry()` - ログエントリフォーマット
- `writeToConsole()` - コンソール出力
- `addToLogHistory()` - ログ履歴追加

## データフロー

### 認証フロー
1. `authenticateWithMicrosoft()` → 認証開始
2. `MSALAuthenticationManager.authenticate()` → デバイスコード取得
3. `AuthenticationModal.showDeviceCodeInstructions()` → ユーザーへ表示
4. ユーザー認証完了 → トークン取得
5. `TodoApiClient.initialize()` → API初期化
6. `fetchUserInfo()` → ユーザー情報取得

### 同期フロー
1. `performManualSync()` → 手動同期開始
2. `TodoSynchronizer.performFullSync()` → 全体同期実行
3. `syncMsftToObsidian()` → Microsoft Todo → Obsidian
4. `syncObsidianToMsft()` → Obsidian → Microsoft Todo
5. `syncCompletions()` → 完了状態同期
6. 同期結果通知

### Daily Note作成フロー
1. `DailyNoteManager.ensureTodayNoteExists()` → 今日のノート確保
2. `findOrCreateTodoSection()` → ToDoセクション作成
3. `addTaskToTodoSection()` → タスク追加

## 実装済み機能

✅ **認証システム**
- MSAL デバイスコードフロー
- トークン管理・更新
- ユーザー情報取得

✅ **Microsoft Graph API統合**
- タスクリスト管理
- タスクCRUD操作
- ユーザープロファイル取得

✅ **Daily Note管理**
- 自動Daily Note作成
- ToDoセクション管理
- DataView準拠完了日記録

✅ **双方向同期**
- 重複検出・除外
- 完了状態同期
- エラーハンドリング

✅ **UI コンポーネント**
- 設定タブ
- 認証モーダル
- サイドバーボタン

✅ **設定・ログシステム**
- 永続化設定管理
- 包括的ログ機能
- エラーハンドリング

## テストカバレッジ

- **94/94 テスト** すべて通過
- **単体テスト**: 各クラス・メソッドの個別テスト
- **統合テスト**: コンポーネント間連携テスト
- **UIテスト**: モーダル・設定タブのテスト
- **エラーハンドリングテスト**: 異常系処理テスト