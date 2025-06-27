# Todo Integrator Plugin 設計書

## 概要

Todo Integrator は、Obsidian と Microsoft Todo を双方向同期するプラグインです。
本設計書は、t-wada氏のTDDアプローチに従って、テスト可能な設計を目指します。

# Microsoft Todo Integrator - 設計・開発計画

## 概要

Microsoft ToDoとObsidianのDaily Noteを双方向同期するプラグイン
- Microsoft ToDoの新規タスクを自動的にObsidianのDaily NoteのToDoセクションに追加
- Obsidianの未完了タスクをMicrosoft ToDoに同期（重複チェック付き）
- 完了タスクの双方向同期とDataView準拠の完了日時記録

## バージョン履歴

- **v0.3.5** - DataViewプラグイン互換性とMicrosoft To Do完了同期修正
  - Microsoft To Do側で完了したタスクがObsidianに反映されない問題を修正
  - completedDateTimeがオブジェクト形式で返される場合の処理追加
  - DataViewプラグイン検出機能とタスク完了日フォーマット互換性
  - DataViewの「Use emoji shorthand for completion」設定を尊重
  - 完了日フォーマットの柔軟な処理（絵文字形式とインラインフィールド形式の両対応）
- **v0.3.4** - 内部同期機能とタイムゾーン処理の実装
  - デイリーノートとメタデータストアの内部同期機能
  - 存在しないデイリーノートファイルのメタデータ自動削除
  - UTC日付変換のバグ修正（Zサフィックス追加）
  - ユニバーサルタイムゾーン対応
  - タスク削除・変更の検出と処理
- **v0.3.1-dev** - [todo::ID]パターン処理の改善とテスト強化
  - 過去のバグで生成された[todo::ID]パターンの確実な除去
  - cleanTaskTitle()メソッドの改善（ステップごとの処理）
  - メタデータストアとの完了状態同期時のタイトルマッチング改善
  - 包括的なエッジケーステストの追加
  - SyncResult型に後方互換性フィールド追加
- **v0.3.0** - 最新安定版リリース
  - プラグイン読み込み時のバージョン表示機能追加
  - 詳細なデバッグログの追加
  - タスク同期時のログ改善
- **v0.2.10** - バグ修正とパフォーマンス改善
- **v0.2.9** - デバッグ機能の強化
  - タスク追加時の詳細ログ
  - 同期処理のトレーサビリティ向上
- **v0.2.8** - 安定性の向上
- **v0.2.6** - タスク配置ロジックの改善
  - Microsoft Todo → Obsidian同期時に期限日を優先的に参照
  - 期限日がない場合のみ作成日を使用
  - タスクをより適切な日付のDaily Noteに配置
- **v0.2.5** - TaskMetadataStore実装、包括的なタイトルクリーニング、ログレベル初期化修正
  - メタデータベースのタスク管理システム実装
  - タスクタイトルからのtodo IDタグ自動除去強化
  - ログレベル設定の初期化タイミング修正
  - プラグインインスタンスの必須パラメータ化
- **v0.2.4** - タイムゾーンサポート準備、タスクID除去の強化
- **v0.2.3** - タスク追加時のセクション配置修正
- **v0.2.2** - 重複タスク防止、タイトルクリーニング、テンプレート設定同期
- **v0.2.1** - セキュリティパッチの修正、設定画面の警告表示改善
- **v0.2.0** - セキュリティ強化（InputSanitizer, SecureErrorHandler追加）
- **v0.1.14** - パス検証機能の追加
- **v0.1.13** - Advanced Configuration機能の追加
- **v0.1.12** - ブラウザベース認証UIへの変更
- **v0.1.11** - Daily Notes設定継承機能の実装

## アーキテクチャ概要

```
main.ts (エクスポートファイル)
└── src/TodoIntegratorPlugin.ts (実際のプラグインクラス)
    ├── Core Components
    │   ├── Logger (simpleLogger with log level support)
    │   ├── ErrorHandler
    │   ├── PluginSettings
    │   └── Authentication & API
    │       ├── MSALAuthenticationManager
    │       └── TodoApiClient
    ├── Data Management
    │   ├── DailyNoteManager
    │   ├── ObsidianTodoParser
    │   ├── TodoSynchronizer
    │   └── TaskMetadataStore (v0.2.5+)
    ├── UI Components
    │   ├── TodoIntegratorSettingsTab
    │   ├── SidebarButton
    │   └── AuthenticationModal
    └── Security & Utils
        ├── InputSanitizer
        ├── PathValidator
        └── SecureErrorHandler
```

## 関数分解・開発計画

### 1. プラグインライフサイクル管理

#### `TodoIntegratorPlugin.onload()`
```typescript
async onload(): Promise<void>
```
- `loadData()` - 設定データの事前読み込み (v0.2.5+)
- `new simpleLogger(logLevel)` - ログレベルを適用したロガー初期化 (v0.2.5+)
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

#### `TodoApiClient.createTaskWithStartDate()`
```typescript
async createTaskWithStartDate(title: string, startDate?: string): Promise<TodoTask>
```
- `validateTaskInput()` - 入力値検証
- `cleanTitle()` - タイトルから[todo::タグを除去 (v0.2.2+, v0.2.5強化)
- `formatTaskData()` - タスクデータフォーマット
- `submitToGraph()` - Graph APIへの送信

#### `TodoApiClient.updateTaskTitle()`
```typescript
async updateTaskTitle(listId: string, taskId: string, newTitle: string): Promise<void>
```
- `validateInput()` - 入力値検証
- `cleanTitle()` - タイトルから[todo::タグを除去 (v0.2.5+)
- `sendUpdateRequest()` - Graph APIへの更新リクエスト

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
async addTaskToTodoSection(filePath: string, taskTitle: string, taskSectionHeading?: string): Promise<void>
```
- `findOrCreateTodoSection()` - Todoセクションの検索/作成
- `rereadFileContent()` - セクション作成後のファイル再読み込み (v0.2.3+)
- `findInsertionPoint()` - 挿入位置特定
- `formatTaskLine()` - タスク行フォーマット（todo IDタグを含めない v0.2.5+）
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

#### `TodoSynchronizer` コンストラクタ (v0.2.5+)
```typescript
constructor(apiClient: TodoApiClient, dailyNoteManager: DailyNoteManager, logger: Logger, taskSectionHeading: string | undefined, plugin: Plugin)
```
- プラグインインスタンスが必須パラメータに変更
- TaskMetadataStoreの初期化

#### `TodoSynchronizer.performFullSync()`
```typescript
async performFullSync(): Promise<SyncResult>
```
- `ensureTodayNoteExists()` - 今日のデイリーノート確保
- `reconcileMetadataWithDailyNotes()` - メタデータとデイリーノートの内部同期 (v0.3.4+)
- `syncMsftToObsidian()` - Microsoft Todo → Obsidian同期
- `syncObsidianToMsft()` - Obsidian → Microsoft Todo同期
- `syncCompletions()` - 完了状態双方向同期
- `cleanupOldMetadata()` - 90日以上古いメタデータのクリーンアップ (v0.2.5+)
- `generateSyncReport()` - 同期結果レポート生成
- **v0.3.1+**: SyncResult型に後方互換性フィールド追加
  - `added`: 総追加数
  - `completed`: 総完了数
  - `errors`: 全エラー配列

#### `TodoSynchronizer.reconcileMetadataWithDailyNotes()` (v0.3.4+)
```typescript
async reconcileMetadataWithDailyNotes(): Promise<void>
```
- `getAllDailyNoteFiles()` - 全デイリーノートファイル取得
- `extractDatesFromFiles()` - ファイル名から日付抽出
- `getAllMetadata()` - 全メタデータ取得
- `removeMetadataForNonExistentFiles()` - 存在しないファイルのメタデータ削除
- `detectTaskDeletion()` - タスクの削除検出
- `detectTaskModification()` - タスクの変更検出（タイトル変更）
- `updateMetadataForModifiedTasks()` - 変更されたタスクのメタデータ更新

#### `TodoSynchronizer.syncMsftToObsidian()`
```typescript
async syncMsftToObsidian(): Promise<{added: number, errors: string[]}>
```
- `fetchMsftTasks()` - Microsoft Todoタスク取得
- `cleanMsftTaskTitles()` - Microsoft Todoタスクタイトルのクリーニング (v0.2.5+)
  - `[todo::ID]`パターンを検出して除去
  - Microsoft Todo APIでタイトルを更新
- `fetchObsidianTasks()` - Obsidianタスク取得
- `findNewMsftTasks()` - 新規Microsoft Todoタスク特定（メタデータベース）
- `determineTaskDate()` - タスクの配置日付決定 (v0.2.6+)
  - 期限日（dueDateTime）を優先的に使用
  - 期限日がない場合は作成日（createdDateTime）を使用
  - **v0.3.4+**: UTC日時文字列にZサフィックスを追加してタイムゾーン変換
- `addTasksToDailyNote()` - Daily Noteへタスク追加
- `storeTaskMetadata()` - TaskMetadataStoreへのメタデータ保存 (v0.2.5+)

#### `TodoSynchronizer.syncObsidianToMsft()`
```typescript
async syncObsidianToMsft(): Promise<{added: number, errors: string[]}>
```
- `findNewObsidianTasks()` - 新規Obsidianタスク特定（メタデータベース）
- `checkExistingMsftTasks()` - 既存Microsoft Todoタスクの重複チェック (v0.2.2+)
- `createMsftTasks()` - Microsoft Todoタスク作成（createTaskWithStartDateを使用）
- `storeTaskMetadata()` - TaskMetadataStoreへのメタデータ保存 (v0.2.5+)
  - **重要**: メタデータは常にクリーンなタイトル（[todo::ID]を除去済み）で保存

#### `TodoSynchronizer.syncCompletions()`
```typescript
async syncCompletions(): Promise<{completed: number, errors: string[]}>
```
- `findCompletedMsftTasks()` - 完了Microsoft Todoタスク特定（メタデータベース）
- `findCompletedObsidianTasks()` - 完了Obsidianタスク特定（メタデータベース）
- `syncCompletionStates()` - 完了状態同期
  - **v0.3.1+**: 両方のタイトルをcleanTaskTitle()でクリーン化してから比較
- `parseCompletionDate()` - 完了日の解析 (v0.3.5+)
  - completedDateTimeがオブジェクト形式の場合の処理
  - dateTimeプロパティから日付文字列を抽出
- `addCompletionDates()` - 完了日時記録
  - **v0.3.5+**: DataViewCompat経由でフォーマット決定

#### `TodoSynchronizer.detectDuplicates()`
```typescript
detectDuplicates(obsidianTasks: ObsidianTask[], msftTasks: TodoTask[]): TaskPair[]
```
- `normalizeTaskTitles()` - タスクタイトル正規化
- `compareTaskTitles()` - タスクタイトル比較
- `generateTaskPairs()` - タスクペア生成

#### `TodoSynchronizer.cleanTaskTitle()` (private, v0.3.1+)
```typescript
private cleanTaskTitle(title: string): string
```
- `[todo::ID]`パターンを完全に除去
- 複数の空白を単一スペースに正規化
- 前後の空白をトリミング
- **改善点**: 
  - ステップごとの処理で可読性向上
  - デバッグログレベルの使用

### 7. 設定管理

#### `PluginSettings.loadSettings()`
```typescript
async loadSettings(): Promise<TodoIntegratorSettings>
```
- `readSettingsFile()` - 設定ファイル読み込み
- `mergeWithDefaults()` - デフォルト値とマージ
- `validateSettings()` - 設定値検証
- `inheritDailyNotesSettings()` - Daily Notesプラグインからの設定継承

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
- `trackUserModification()` - ユーザー変更の追跡（継承フラグ）
- `updateDailyNoteManager()` - DailyNoteManager設定の即時更新 (0.2.2+)

#### `PluginSettings.getClientConfig()`
```typescript
getClientConfig(): {clientId: string, tenantId: string}
```
- `extractAuthConfig()` - 認証設定抽出
- `validateAuthConfig()` - 認証設定検証
- `resolveAdvancedConfig()` - Advanced Configuration有効時の設定解決

### 追加実装メソッド（design.mdに未記載）

#### `TodoIntegratorPlugin.applyDailyNotesDefaults()`
```typescript
applyDailyNotesDefaults(): void
```
- Daily Notesプラグインからのデフォルト設定適用
- 設定の継承管理

#### `TodoIntegratorPlugin.getAuthenticationStatus()`
```typescript
getAuthenticationStatus(): AuthenticationStatus
```
- 現在の認証状態を返す
- UIコンポーネントで使用

#### `TodoIntegratorPlugin.logout()`
```typescript
async logout(): Promise<void>
```
- ユーザーのログアウト処理
- トークンクリア
- 設定リセット

#### `DailyNoteManager.getAllDailyNoteFiles()`
```typescript
async getAllDailyNoteFiles(): Promise<TFile[]>
```
- すべてのDaily Noteファイルを取得
- 日付パターンマッチング

#### `DailyNoteManager.extractDateFromFilename()`
```typescript
extractDateFromFilename(filename: string): string | null
```
- ファイル名から日付を抽出
- 日付フォーマット変換

### 8. UI コンポーネント

#### `TodoIntegratorSettingsTab.display()`
```typescript
display(): void
```
- `renderAuthSection()` - 認証セクション描画
- `renderAdvancedClientSettings()` - Advanced Configuration設定（条件付き表示）
- `renderSyncSettings()` - 同期設定描画
- `renderDailyNoteSettings()` - Daily Note設定描画（継承表示付き）
- `renderAdvancedSettings()` - 詳細設定描画
- `showValidationMessage()` - パス検証メッセージ表示
- `showFileSelector()` - テンプレートファイルセレクター

#### `AuthenticationModal.showDeviceCodeInstructions()`
```typescript
showDeviceCodeInstructions(userCode: string, verificationUri: string): void
```
- `updateProgress()` - 進行状況更新
- `displayDeviceCode()` - デバイスコード表示
- `showInstructions()` - 認証手順表示
- `enableActionButtons()` - アクションボタン有効化
- `openBrowserDirectly()` - ブラウザ直接開き機能（0.1.12+）

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

### 11. エラーコード定数

#### `ERROR_CODES`
```typescript
const ERROR_CODES = {
  AUTH_FAILED: 'AUTH_FAILED',
  NETWORK_ERROR: 'NETWORK_ERROR',
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  INVALID_INPUT: 'INVALID_INPUT',
  // その他のエラーコード
}
```
- エラーハンドリングで使用
- 一貫したエラー分類

### 12. セキュリティユーティリティ (0.2.0+)

#### `InputSanitizer`
```typescript
class InputSanitizer
```
- `sanitize()` - 基本的な文字列トリミング
- `sanitizeHtml()` - XSS攻撃防止のためのHTML文字エスケープ
- `sanitizeFilename()` - ファイル名の危険文字除去
- `sanitizePath()` - パストラバーサル攻撃防止
- `validateUrl()` - URL検証とサニタイゼーション
- `sanitizeForNotification()` - 通知用文字列のサニタイゼーション
- `validateString()` - 文字列長と内容の検証

#### `PathValidator`
```typescript
class PathValidator
```
- `validateFolderPath()` - フォルダパスの存在確認
- `validateFilePath()` - ファイルパスの存在確認
- `createFolderIfNeeded()` - フォルダの作成提案と実行
- `normalizePath()` - パス正規化とセキュリティチェック
- `getAllFolders()` - Vault内全フォルダ一覧取得
- `getAllMarkdownFiles()` - Vault内全Markdownファイル一覧取得

#### `SecureErrorHandler`
```typescript
class SecureErrorHandler
```
- `handleApiError()` - API エラーの安全な処理
- `handleAuthError()` - 認証エラーの安全な処理
- `handleFileError()` - ファイルエラーの安全な処理
- `handleNetworkError()` - ネットワークエラーの安全な処理
- `handleValidationError()` - 検証エラーの安全な処理
- `handleGenericError()` - 汎用エラーの安全な処理
- `createSafeErrorMessage()` - 機密情報をマスクしたエラーメッセージ生成

### 13. データストレージ (v0.2.5+)

#### `TaskMetadataStore`
```typescript
class TaskMetadataStore
```
- `constructor(plugin: Plugin, logger: SimpleLogger)` - プラグインインスタンスを必須に
- `setMetadata(date: string, title: string, msftTaskId: string)` - メタデータ保存
- `getMsftTaskId(date: string, title: string)` - Microsoft Todo ID取得
- `getMetadataByDate(date: string)` - 特定日付のメタデータ取得
- `findByMsftTaskId(msftTaskId: string)` - Microsoft Todo IDでメタデータ検索
- `updateTitle(date: string, oldTitle: string, newTitle: string)` - タイトル更新時のメタデータ更新
- `removeMetadata(date: string, title: string)` - メタデータ削除
- `cleanupOldMetadata()` - 90日以上古いメタデータの自動削除
- `clearAll()` - 全メタデータクリア（テスト・リセット用）
- `loadMetadata()` - プラグインデータからメタデータ読み込み
- `saveMetadata()` - プラグインデータへメタデータ保存

### 14. DataView互換性 (v0.3.5+)

#### `DataViewCompat`
```typescript
class DataViewCompat
```
- `constructor(app: App, logger: Logger)` - DataViewプラグインの検出
- `checkDataViewPlugin()` - DataViewプラグインのインストール状態確認
- `loadDataViewSettings()` - DataView設定の読み込み
- `getCompletionFormat(date: string)` - 完了日フォーマットの決定
  - DataView未インストール時: `✅ YYYY-MM-DD`
  - DataViewインストール済み＆emoji shorthand有効時: DataView設定に従う
- `shouldUseEmojiShorthand()` - 絵文字ショートハンド使用判定
- `parseCompletionDate(taskText: string)` - 完了日の解析
  - 絵文字形式（✅ YYYY-MM-DD）
  - DataViewインラインフィールド形式（[completion:: YYYY-MM-DD]）
  - カスタム完了テキスト対応
- `refreshSettings()` - DataView設定の再読み込み

## データフロー

### 認証フロー
1. `authenticateWithMicrosoft()` → 認証開始
2. `MSALAuthenticationManager.authenticate()` → デバイスコード取得
3. `AuthenticationModal.showDeviceCodeInstructions()` → ユーザーへ表示
4. ユーザー認証完了 → トークン取得
5. `TodoApiClient.initialize()` → API初期化
6. `fetchUserInfo()` → ユーザー情報取得

### 同期フロー (v0.3.4強化)
1. `performManualSync()` → 手動同期開始
2. `TodoSynchronizer.performFullSync()` → 全体同期実行
   - `ensureTodayNoteExists()` → 今日のデイリーノート確保
   - **v0.3.4+**: `reconcileMetadataWithDailyNotes()` → 内部同期
     - 存在しないデイリーノートファイルのメタデータ削除
     - タスクの削除・変更検出
     - メタデータの更新
3. `syncMsftToObsidian()` → Microsoft Todo → Obsidian
   - Microsoft Todoタスクタイトルのクリーニング
     - `[todo::ID]`パターンの検出と除去（過去のバグで付与されたもの）
     - Microsoft Todo APIでのタイトル更新
   - TaskMetadataStoreによるタスク識別
   - タスクを[日付, タイトル]タプルで管理
   - タスク配置日付の決定 (v0.2.6+)
     - 期限日（dueDateTime）を優先的に使用
     - 期限日がない場合は作成日（createdDateTime）を使用
     - **v0.3.4+**: UTC日時のタイムゾーン変換（Zサフィックス追加）
   - メタデータの永続保存
4. `syncObsidianToMsft()` → Obsidian → Microsoft Todo
   - TaskMetadataStoreによる新規タスク特定
   - 重複防止のための正規化タイトル比較
   - メタデータの保存（クリーンなタイトルで保存）
5. `syncCompletions()` → 完了状態同期
   - TaskMetadataStoreによるタスクマッピング
   - 双方向の完了状態同期
   - **v0.3.1+**: 両タイトルをcleanTaskTitle()でクリーン化してから比較
6. `cleanupOldMetadata()` → 90日以上古いメタデータの自動削除
7. 同期結果通知（v0.3.1+: 後方互換性フィールド付き）

### Daily Note作成フロー
1. `DailyNoteManager.ensureTodayNoteExists()` → 今日のノート確保
2. `findOrCreateTodoSection()` → ToDoセクション作成
3. `addTaskToTodoSection()` → タスク追加

## 実装済み機能

✅ **認証システム**
- MSAL デバイスコードフロー
- トークン管理・更新
- ユーザー情報取得
- ブラウザベース認証UI (0.1.12+)

✅ **Microsoft Graph API統合**
- タスクリスト管理
- タスクCRUD操作
- ユーザープロファイル取得

✅ **Daily Note管理**
- 自動Daily Note作成
- ToDoセクション管理
- カスタムセクションヘッダー対応
- セクション内適切なタスク配置 (0.2.3+)
- DataView準拠完了日記録
  - **v0.3.5+**: DataViewプラグイン設定の尊重
  - 絵文字形式とインラインフィールド形式の両対応
- Daily Notesプラグインからの設定継承 (0.2.0+)
- テンプレートファイルの即時反映 (0.2.2+)

✅ **双方向同期**
- 重複検出・除外
- タイトル正規化による重複防止 (v0.2.2+)
- タスクタイトルの自動クリーニング (v0.2.2+, v0.2.5強化)
  - 正規表現パターン: `/\[todo::[^\]]*\]/g`
  - Microsoft Todo側のタイトル更新機能
- TaskMetadataStoreによるタスク識別 (v0.2.5+)
  - [日付, タイトル]タプルでの一意識別
  - Microsoft Todo IDの分離管理
- 完了状態同期
  - **v0.3.5+**: Microsoft To Do APIのcompletedDateTimeオブジェクト形式対応
  - 双方向の完了状態反映
- エラーハンドリング

✅ **UI コンポーネント**
- 設定タブ
- 認証モーダル
- サイドバーボタン
- Advanced Configuration機能 (0.1.13+)
- パス検証機能付き設定画面 (0.1.14+)

✅ **設定・ログシステム**
- 永続化設定管理
- 包括的ログ機能
  - ログレベル初期化修正 (v0.2.5+)
  - 設定読み込み前のログレベル適用
  - デバッグ、情報、エラーの3レベル対応
- エラーハンドリング

✅ **セキュリティ機能** (v0.2.0+)
- 入力値サニタイゼーション (InputSanitizer)
- パストラバーサル攻撃防止 (PathValidator)
- セキュアエラーハンドリング (SecureErrorHandler)
- XSS攻撃防止
- 機密情報のマスキング
- ログ出力での機密情報自動マスキング (v0.2.5+)

✅ **データストレージ** (v0.2.5+)
- TaskMetadataStore実装
  - タスクを[日付, タイトル]タプルで識別
  - Microsoft Todo IDの分離管理
  - 自動メタデータクリーンアップ（90日）
  - プラグインデータとしての永続化
  - メタデータ構造：
    ```typescript
    interface TaskMetadata {
      msftTaskId: string;
      date: string;
      title: string;
      lastSynced: number;
    }
    ```

✅ **DataView互換性** (v0.3.5+)
- DataViewプラグインの自動検出
- タスク完了日フォーマットの柔軟な対応
  - DataView未インストール時: デフォルト形式（✅ YYYY-MM-DD）
  - DataViewインストール時: プラグイン設定を尊重
- 「Use emoji shorthand for completion」設定の読み取り
- カスタム完了テキスト対応

## テストカバレッジ

- **180+ テスト** すべて通過 (v0.3.1時点)
- **単体テスト**: 各クラス・メソッドの個別テスト
- **統合テスト**: コンポーネント間連携テスト
- **UIテスト**: モーダル・設定タブのテスト
- **エラーハンドリングテスト**: 異常系処理テスト
- **セキュリティテスト**: パス検証・入力サニタイゼーションテスト (v0.2.0+)
- **TaskMetadataStoreテスト**: 完全なテストスイート追加 (v0.2.5+)
- **タイトルクリーニングテスト**: 正規表現によるタグ除去テスト (v0.2.5+)
- **エッジケーステスト**: (v0.3.1+)
  - 空の[todo::]パターン
  - ネストした[[todo::ID]]パターン
  - 複数の[todo::ID]パターン
  - 特殊文字を含む[todo::ID]
  - タイトルが[todo::ID]のみの場合
- **同期競合解決テスト**: 両システムで同時変更時の処理 (v0.3.1+)
- **大規模データテスト**: 大量タスクの同期処理 (v0.3.1+)

## タイムゾーンサポート (v0.3.4実装)

### 実装内容
- **UTC日時の正しい変換**: Microsoft To Do APIから返されるUTC日時文字列を正しく解析
- **自動タイムゾーン変換**: JavaScriptのDateオブジェクトによる自動ローカルタイムゾーン変換
- **Zサフィックスの追加**: Microsoft To Do APIの日時文字列にZサフィックスがない場合に自動追加
- **グローバル対応**: 世界中のどのタイムゾーンでも正しく動作

### 技術的詳細
```typescript
// UTC日時文字列の処理
let dueDateTimeStr = task.dueDateTime.dateTime;
if (!dueDateTimeStr.endsWith('Z')) {
    dueDateTimeStr += 'Z';  // UTC時間として確実に解析
}
const dueDate = new Date(dueDateTimeStr);
// JavaScriptが自動的にローカルタイムゾーンに変換
const localDate = `${dueDate.getFullYear()}-${month}-${day}`;
```

## Microsoft To Do API完了日時形式対応 (v0.3.5実装)

### 問題の背景
- Microsoft To Do APIのcompletedDateTimeが文字列形式とオブジェクト形式の両方で返される
- オブジェクト形式: `{ dateTime: "2025-01-27T08:48:52.937Z", timeZone: "UTC" }`
- 文字列形式: `"2025-01-27T08:48:52.937Z"`

### 実装内容
```typescript
private parseCompletionDate(task: TodoTask): string {
    if (!task.completedDateTime) {
        return new Date().toISOString().slice(0, 10);
    }
    
    // Handle both string and object formats
    let dateTimeString: string;
    if (typeof task.completedDateTime === 'object' && 'dateTime' in task.completedDateTime) {
        dateTimeString = (task.completedDateTime as any).dateTime;
    } else if (typeof task.completedDateTime === 'string') {
        dateTimeString = task.completedDateTime;
    } else {
        // Fallback to current date
        return new Date().toISOString().slice(0, 10);
    }
    
    return new Date(dateTimeString).toISOString().slice(0, 10);
}
```

## 実装状況（2025年1月現在）

### 完全実装済み機能 ✅

**認証システム**
- MSAL デバイスコードフロー認証
- トークンの自動更新とキャッシング
- マルチテナント対応（カスタムAzure App Registration）
- セキュアなトークン管理

**Microsoft Graph API統合**
- タスクのCRUD操作（作成・読取・更新・削除）
- タスクリストの管理（検索・作成）
- ユーザー情報の取得
- [todo::ID]タグの自動クリーニング

**Daily Note管理**
- 自動Daily Note作成（テンプレート対応）
- タスクセクションの自動管理
- カスタム日付フォーマット対応
- Daily Notesプラグイン設定の継承
- テンプレート変数処理（{{date}}, {{time}}等）

**タスク同期**
- 双方向同期（Microsoft Todo ⇔ Obsidian）
- 重複検出（正規化タイトルマッチング）
- 完了状態の同期
- TaskMetadataStoreによるタスク関係追跡
- 日付ベースのタスク配置（期限日優先）
- 90日以上古いメタデータの自動削除

**セキュリティ**
- 入力値のサニタイゼーション
- パストラバーサル攻撃の防止
- セキュアエラーハンドリング
- ログ内の機密情報マスキング

**UI/UX**
- 設定タブ（Advanced Configuration対応）
- 認証モーダル（デバイスコード表示）
- サイドバーボタン（同期ステータス表示）
- リアルタイムステータス更新
- パス検証と提案機能

### 既知の制限事項 ⚠️

**ログシステム**
- ログレベル変更が即座に反映されない場合がある
- 一部のデバッグログが期待通りに表示されない

### 今後の開発予定 📋

**タイムゾーンサポート**
- ユーザーのローカルタイムゾーンでのタスク作成
- Microsoft TodoとObsidian間でのタイムゾーン変換
- 設定画面でのタイムゾーン選択オプション
- Daily Note日付のタイムゾーン考慮

**パフォーマンス最適化**
- 大量タスクの同期時のパフォーマンス改善
- バッチ処理の実装
- キャッシュ機構の強化

**UI/UX改善**
- 同期進捗の詳細表示
- タスクのフィルタリングオプション
- カスタムショートカットキー

## 技術的詳細

### タイトルクリーニング機能
- **目的**: タスクタイトルから過去のバグで付与された[todo::ID]パターンを除去
- **背景**: 
  - 過去のプラグインバージョンでMicrosoft To-DoのタスクIDをタイトルに誤って付記していた
  - 例: "買い物リスト [todo::AQMkADAwATM3...]"
  - 現在はメタデータストアで管理し、タイトルには含めない設計
- **実装**:
  - 正規表現パターン: `/\[todo::[^\]]*\]/g`
  - TodoSynchronizer.cleanTaskTitle()メソッド（v0.3.1で改善）
  - Microsoft Todo APIでのタイトル更新
- **適用箇所**:
  - Microsoft → Obsidian同期時
  - Obsidian → Microsoft同期時（メタデータ保存時にクリーン化）
  - タスク作成時
  - 完了状態同期時のタイトルマッチング（v0.3.1+）

### メタデータストレージ
- **目的**: タスクIDを見えない形で管理
- **実装**: TaskMetadataStoreクラス
- **データ永続化**: Obsidianプラグインデータとして保存
- **自動クリーンアップ**: 90日以上古いデータを削除

### ログレベル初期化
- **問題**: プラグイン読み込み時にログレベルが適用されない
- **解決**: onload()でloadData()を先に実行してログレベルを取得
- **影響**: 起動時のログ出力が設定に従うように改善

---

# 新設計: テスト駆動開発とサービス指向アーキテクチャ

## アーキテクチャ概要

### 現在のレイヤー構造

```
┌─────────────────────────────────────────────────┐
│                   UI Layer                      │
│  (Settings Tab, Modal, Sidebar Button)          │
├─────────────────────────────────────────────────┤
│                Plugin Core                      │
│         (TodoIntegratorPlugin)                  │
├─────────────────────────────────────────────────┤
│              Service Layer                      │
│  (TodoSynchronizer, DailyNoteManager)          │
├─────────────────────────────────────────────────┤
│             Infrastructure                      │
│  (TodoApiClient, MSALAuthManager, Parser)       │
├─────────────────────────────────────────────────┤
│                Utilities                        │
│  (Logger, ErrorHandler, PathValidator,          │
│   DataViewCompat)                               │
└─────────────────────────────────────────────────┘
```

## 現在の設計の課題

### 1. 外部サービスへの強結合
- Microsoft Todo に特化した実装が全体に散在
- `TodoApiClient` が Microsoft Graph API に直接依存
- 認証が MSAL に固定

### 2. テスタビリティの問題
- 外部依存が多く、単体テストが困難
- モックの作成が複雑
- 統合テストに依存しがち

### 3. 責務の混在
- `TodoSynchronizer` が同期ロジックとビジネスルールを混在
- `DailyNoteManager` がファイル操作とタスク管理を兼務

## 新設計：サービス指向アーキテクチャ

### 1. TodoService インターフェース

```typescript
interface TodoService {
  // 認証
  authenticate(): Promise<AuthResult>;
  logout(): Promise<void>;
  isAuthenticated(): boolean;
  
  // リスト管理
  getLists(): Promise<TodoList[]>;
  createList(name: string): Promise<TodoList>;
  
  // タスク操作
  getTasks(listId: string): Promise<TodoTask[]>;
  createTask(listId: string, task: CreateTaskInput): Promise<TodoTask>;
  updateTask(listId: string, taskId: string, update: UpdateTaskInput): Promise<TodoTask>;
  deleteTask(listId: string, taskId: string): Promise<void>;
  
  // 同期用メタデータ
  getTaskMetadata(taskId: string): Promise<TaskMetadata>;
}
```

### 2. プロバイダー中立なモデル

```typescript
// プロバイダー中立なタスクモデル
interface UniversalTask {
  id: string;
  title: string;
  completed: boolean;
  dueDate?: string;
  createdDate: string;
  completedDate?: string;
  metadata: Record<string, any>;
}

// プロバイダー固有の変換
interface TaskConverter<T> {
  toUniversal(providerTask: T): UniversalTask;
  fromUniversal(universalTask: UniversalTask): T;
}
```

### 3. 同期エンジンの抽象化

```typescript
interface SyncEngine {
  // 同期設定
  configure(options: SyncOptions): void;
  
  // 同期実行
  sync(): Promise<SyncResult>;
  
  // 競合解決
  resolveConflict(conflict: SyncConflict): Promise<Resolution>;
  
  // 同期状態
  getStatus(): SyncStatus;
}
```

## テスト戦略

### 1. 単体テストの充実

#### テスト対象の分離
- ビジネスロジックを純粋関数として抽出
- 外部依存をインターフェースで抽象化
- Dependency Injection の活用

#### テストパターン
```typescript
describe('TaskSyncLogic', () => {
  describe('タスクの重複検出', () => {
    it('タイトルが完全一致する場合は重複と判定する', () => {
      // Arrange
      const task1 = createTask({ title: 'Buy milk' });
      const task2 = createTask({ title: 'Buy milk' });
      
      // Act
      const isDuplicate = detectDuplicate(task1, task2);
      
      // Assert
      expect(isDuplicate).toBe(true);
    });
    
    it('タイトルの大文字小文字の違いは無視する', () => {
      // Arrange
      const task1 = createTask({ title: 'Buy Milk' });
      const task2 = createTask({ title: 'buy milk' });
      
      // Act
      const isDuplicate = detectDuplicate(task1, task2);
      
      // Assert
      expect(isDuplicate).toBe(true);
    });
  });
});
```

### 2. 統合テストの整理

#### テストダブルの活用
```typescript
class FakeTodoService implements TodoService {
  private tasks: Map<string, TodoTask[]> = new Map();
  
  async getTasks(listId: string): Promise<TodoTask[]> {
    return this.tasks.get(listId) || [];
  }
  
  async createTask(listId: string, task: CreateTaskInput): Promise<TodoTask> {
    const newTask = { ...task, id: generateId() };
    const tasks = this.tasks.get(listId) || [];
    tasks.push(newTask);
    this.tasks.set(listId, tasks);
    return newTask;
  }
}
```

### 3. E2Eテストの最小化

- クリティカルパスのみをE2Eテストでカバー
- 大部分は単体テストと統合テストでカバー
- テストピラミッドの原則に従う

## リファクタリング計画

### Phase 1: インターフェースの導入
1. `TodoService` インターフェースの定義
2. 既存コードを `MicrosoftTodoService` として実装
3. 依存性注入の仕組みを導入

### Phase 2: ビジネスロジックの分離
1. 同期ロジックを純粋関数として抽出
2. ファイル操作とタスク管理の分離
3. 状態管理の明確化

### Phase 3: テストの再構築
1. 単体テストの充実
2. テストダブルの整備
3. テストカバレッジの向上

## 設計原則

### SOLID原則の適用
- **S**ingle Responsibility: 各クラスは単一の責務
- **O**pen/Closed: 拡張に開き、修正に閉じる
- **L**iskov Substitution: サブタイプは基底型と置換可能
- **I**nterface Segregation: 必要なインターフェースのみ依存
- **D**ependency Inversion: 抽象に依存し、具象に依存しない

### テスト駆動開発の実践
1. Red: 失敗するテストを書く
2. Green: テストを通す最小限の実装
3. Refactor: コードを改善

### 継続的な改善
- 小さなステップで進める
- 常にテストが通る状態を保つ
- リファクタリングは別コミット

## 今後の拡張性

### 他のTodoサービスへの対応
- Google Tasks
- Apple Reminders
- Todoist
- Any.do

### 新機能の追加
- リアルタイム同期
- 競合解決UI
- 同期履歴の可視化
- バックアップ・リストア

## コーディング規約

### ネストしたif文の禁止（ゼロトレランス）
```typescript
// ❌ 禁止
if (condition1) {
  if (condition2) {
    // 処理
  }
}

// ✅ 推奨: ガード句
if (!condition1) return;
if (!condition2) return;
// 処理

// ✅ 推奨: 複合条件
if (condition1 && condition2) {
  // 処理
}
```

### 関数の長さ制限
- 最大20行
- 単一責任の原則を守る
- 複雑なロジックは別関数に抽出

### テストファーストの徹底
- 実装前にテストを書く
- テストが失敗することを確認
- 最小限の実装でテストを通す
- リファクタリング

## まとめ

本設計は、テスト可能性と拡張性を重視したアーキテクチャを目指しています。
t-wada氏のTDDアプローチに従い、まずテストを書き、それから実装を行うことで、
品質の高いコードベースを維持します。
