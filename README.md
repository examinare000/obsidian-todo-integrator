# Obsidian Todo Integrator

Microsoft To-DoとObsidianのDaily Noteを双方向同期するObsidianプラグインです。

## 機能

### 📝 双方向タスク同期
- **Microsoft To-Do → Obsidian**: 新規タスクを自動的にDaily Noteに追加
- **Obsidian → Microsoft To-Do**: Daily Noteのタスクを自動的にMicrosoft To-Doに作成
- **完了状態の同期**: どちらで完了してももう一方に反映

### 🎯 主な特徴
- **重複防止**: 同じタスクが複数作成されることを防ぐ
- **日付ベース管理**: タスクを適切な日付のDaily Noteに配置
- **メタデータ管理**: タスクの関連付けを見えない形で管理
- **自動クリーンアップ**: 古いメタデータを自動削除

### 🔒 セキュリティ
- 安全な認証フロー（Microsoft Device Code Flow）
- 入力値のサニタイゼーション
- エラー時の機密情報マスキング

## インストール

### 必要条件
- Obsidian v0.15.0以上
- Microsoftアカウント（個人またはAzure AD）
- インターネット接続

### インストール方法

#### コミュニティプラグインから（推奨）
1. Obsidianの設定を開く
2. 「コミュニティプラグイン」→「ブラウズ」
3. 「Todo Integrator」を検索
4. インストール → 有効化

#### 手動インストール
1. [最新リリース](https://github.com/examinare000/obsidian-todo-integrator/releases/latest)から以下をダウンロード：
   - `main.js`
   - `manifest.json`
2. Obsidianのプラグインフォルダに`obsidian-todo-integrator`フォルダを作成
   - Windows: `%APPDATA%\Obsidian\Vault\.obsidian\plugins\`
   - macOS: `~/Library/Application Support/Obsidian/Vault/.obsidian/plugins/`
   - Linux: `~/.config/Obsidian/Vault/.obsidian/plugins/`
3. ダウンロードしたファイルをフォルダにコピー
4. Obsidianを再起動して、設定でプラグインを有効化

## 使い方

### 初期設定

1. **プラグインを有効化**
   - 設定 → コミュニティプラグイン → Todo Integratorを有効化

2. **Microsoftアカウントでログイン**
   - プラグイン設定を開く
   - 「Authenticate with Microsoft」をクリック
   - 表示されたコードをブラウザで入力
   - Microsoftアカウントでログイン

3. **Daily Note設定**（オプション）
   - Daily Noteフォルダのパス設定
   - 日付フォーマットの設定
   - TODOセクションのヘッダー設定

### 基本的な使い方

#### 手動同期
- サイドバーの同期ボタンをクリック
- または、コマンドパレットから「Sync with Microsoft Todo」を実行

#### 自動同期
- 設定で自動同期を有効化
- 指定した間隔で自動的に同期

#### タスクの管理
- **Obsidianでタスク作成**: Daily Noteに`- [ ] タスク名`形式で記述
- **Microsoft To-Doでタスク作成**: 通常通りタスクを作成（期日設定推奨）
- **タスク完了**: どちらで完了してもOK

## 設定項目

### 認証設定
- **Advanced Configuration**: カスタムAzure App Registrationの使用
- **Client ID / Tenant ID**: カスタム設定時のみ必要

### 同期設定
- **Auto Sync**: 自動同期の有効/無効
- **Sync Interval**: 自動同期の間隔（分）
- **Task List Name**: Microsoft To-Doのリスト名

### Daily Note設定
- **Daily Notes Folder**: Daily Noteを保存するフォルダ
- **Date Format**: 日付フォーマット（例: `YYYY-MM-DD`）
- **Template File**: 新規Daily Noteのテンプレート
- **Task Section Heading**: タスクセクションのヘッダー（例: `## TODO`）

### 詳細設定
- **Log Level**: ログの詳細度（debug/info/error）

## トラブルシューティング

### 同期されない
1. インターネット接続を確認
2. 認証が有効か確認（設定画面で再認証）
3. ログレベルを「debug」に設定して詳細を確認

### 重複タスクが作成される
- 通常は重複検出機能により防がれます
- 発生する場合は、タスクのタイトルが微妙に異なる可能性があります

### エラーメッセージ
- `AUTH_FAILED`: 認証の有効期限切れ → 再認証が必要
- `NETWORK_ERROR`: ネットワーク接続エラー → 接続を確認
- `FILE_NOT_FOUND`: Daily Noteが見つからない → パス設定を確認

## よくある質問

**Q: どのMicrosoftアカウントが使えますか？**
A: 個人用Microsoftアカウント、職場/学校アカウント（Azure AD）の両方に対応しています。

**Q: タスクはどこに保存されますか？**
A: Obsidianでは指定した日付のDaily Noteに、Microsoft To-Doでは指定したリスト（デフォルト: "Obsidian Tasks"）に保存されます。

**Q: [todo::ID]というテキストが表示されます**
A: 過去のバージョンのバグで付与されたものです。最新版では自動的に除去されます。

**Q: プライバシーは大丈夫ですか？**
A: すべてのデータはローカルとMicrosoftのサーバー間でのみやり取りされます。第三者のサーバーは使用しません。

## ライセンス

MIT License - 詳細は[LICENSE](LICENSE)ファイルを参照してください。

## 開発者向け情報

開発に参加したい方は[開発ガイド](docs/development.md)を参照してください。

## サポート

- バグ報告: [GitHub Issues](https://github.com/examinare000/obsidian-todo-integrator/issues)
- 機能リクエスト: [GitHub Discussions](https://github.com/examinare000/obsidian-todo-integrator/discussions)
- ドキュメント: [Wiki](https://github.com/examinare000/obsidian-todo-integrator/wiki)

## 謝辞

このプラグインは以下のプロジェクトを使用しています：
- [Obsidian API](https://github.com/obsidianmd/obsidian-api)
- [Microsoft Authentication Library (MSAL)](https://github.com/AzureAD/microsoft-authentication-library-for-js)
- [Microsoft Graph API](https://developer.microsoft.com/en-us/graph)
