# Development Log

## 概要
Obsidian Todo Integrator Plugin - Microsoft To Doとの同期機能を持つObsidianプラグインの開発履歴と課題解決記録

---

## 🚀 プロジェクト初期構築

### アーキテクチャ設計
- **モジュラー構造**: 認証、API、UI、データ管理の責任分離設計
- **TypeScript基盤**: 厳密な型安全性とObsidian API統合
- **テスト駆動開発**: Jest + Obsidian APIモックによる包括的テスト基盤

### コア機能実装
**1. Microsoft認証システム**
- MSAL.js統合によるDevice Code Flow認証
- Azure App Registration設定 (c6b68d29-5d13-4caf-aba6-14bf3de5c772)
- 認証進行状況モーダルUI

**2. Microsoft Graph API統合**
- Todo APIクライアント (作成・取得・更新機能)
- エラーハンドリングとログ機能
- 設定管理機能

**3. Obsidian統合**
- Daily Note管理とタスク解析パーサー
- サイドバーボタンと設定タブUI
- Task同期機能

**4. 開発基盤**
- Jest テストフレームワーク設定
- esbuild バンドル設定
- TypeScript 型定義とインターフェース

---

## 🔧 重大Issue解決履歴

### Issue 1: TypeScript型安全性問題
**問題**: Obsidian API型定義との不整合、`instanceof TFile`モック問題
**アプローチ**: 
- 適切な型ガードとインターフェース定義
- Obsidian APIモック戦略の最適化
- DailyNoteManagerテストの修正
**結果**: 開発時エラー検出とコード品質向上

### Issue 2: テスト基盤構築課題
**問題**: Obsidian環境での複雑なテスト設定、統合テストタイムアウト
**アプローチ**: 
- Mock戦略とJest設定最適化
- 非同期処理テストパターン確立
- API Mock設計の改善
**結果**: CI/CD対応とリグレッション防止基盤

### Issue 3: Git戦略とプロセス改善
**問題**: mainブランチの安定性確保、複数機能にわたる変更の管理
**アプローチ**: 
- Main Branch Protection規約導入
- Feature Branch戦略確立
- 単一責任原則に基づくコミット分割
**結果**: リリース品質向上と開発効率化

---

## 💥 Critical Issue: Microsoft認証JWT問題

### 問題の詳細
**エラー**: `JWT is not well formed, there are no dots (.)`
**根本原因**: Microsoft Graph Client v3.0.7がJWT形式トークンを期待するが、MSALが返すMicrosoft Access TokenはOpaque形式

### 段階的解決アプローチ

**Phase 1: デバッグと原因特定**
- 認証フローのデバッグ情報追加
- commonテナント vs consumersテナント設定検証
- Client ID検証エラーとAzure設定確認

**Phase 2: トークン管理改善**
- 静的トークンから動的Token Providerパターンへ移行
- 認証タイミング問題の解決
- トークン更新自動化

**Phase 3: 根本的解決策**
- **Microsoft Graph Client SDK回避**: JWT問題を根本的に解決
- **Direct Fetch実装**: `getOrCreateTaskList()`と`getUserInfo()`をfetch()直接呼び出し
- **Token Provider統合**: 動的トークン取得との組み合わせ

### 技術的実装詳細

**APIクライアント改修**:
```typescript
// 旧実装: Graph Client SDK使用
const lists = await this.graphClient.api('/me/todo/lists').get();

// 新実装: Direct Fetch
const response = await fetch('https://graph.microsoft.com/v1.0/me/todo/lists', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  }
});
```

**Token Provider Pattern**:
```typescript
// 旧実装: 静的トークン
initialize(accessToken: string): void

// 新実装: 動的プロバイダー
initialize(tokenProvider: () => Promise<string>): void
```

### テスト対応
- Fetch モッキング戦略への移行
- Graph Client SDKモックからfetchモックへの変更
- Token Provider パターンに対応したテストケース
- 17テストケース全合格達成

---

## 🎯 実装された主要機能

### 認証フロー
- **Device Code Flow**: ブラウザレス認証対応
- **Token Provider Pattern**: 動的トークン管理
- **Azure Integration**: 個人アカウント対応設定
- **Error Recovery**: 認証エラーハンドリング

### API統合
- **Direct API Calls**: JWT問題回避の根本解決
- **Task List Management**: 自動作成・取得機能
- **User Info Retrieval**: プロファイル情報取得
- **Error Handling**: 包括的エラー管理

### UI/UX
- **認証進行モーダル**: ユーザーフレンドリーな認証体験
- **設定タブ**: シンプルな設定管理
- **サイドバー統合**: Obsidianネイティブな操作感
- **フィードバック**: 適切なステータス表示

### 開発体験
- **TypeScript Strict**: 厳密な型チェック
- **Test Coverage**: 包括的テストスイート
- **Git Strategy**: Feature-branchベース開発
- **Documentation**: CLAUDE.md開発ガイダンス

---

## 🔄 Git戦略とブランチ管理

### Branch Strategy
- **Main Branch**: リリース専用、常に安定状態
- **Feature Branches**: 単一責任原則に基づく機能開発
- **Fix Branches**: Issue別の修正作業

### 実践例: Microsoft認証問題解決
- `fix-ms_auth-impl`: 認証実装修正専用
- `fix-test-ms_auth`: テスト修正専用
- 機能とテストの責任分離によるクリーンな履歴

---

## 📈 技術的成果

### 解決した技術課題
- Microsoft Authentication Ecosystem理解
- Graph Client SDK制限の克服
- Access Token vs JWT Token形式差異対応
- Obsidian Plugin Lifecycle管理

### 確立した開発パターン
- Token Provider Pattern
- Direct API Call Pattern
- Feature Branch Strategy
- Mock-based Testing Strategy

### 品質指標
- **Test Coverage**: 17テストケース (100%合格)
- **Type Safety**: TypeScript strict mode
- **Error Handling**: 包括的エラー管理
- **Documentation**: 完全な開発ガイド

---

*このログは初期実装から認証問題完全解決まで（v0.1.9）の全開発履歴を記録*

## 解決した主要Issue

### 1. Microsoft認証JWT問題 (v0.1.9)
- **Issue**: `JWT is not well formed, there are no dots (.)`
- **Root Cause**: Microsoft Graph Client SDK がJWT形式を期待するがAccess TokenはOpaque形式
- **Solution**: Graph Client回避してDirect Fetch実装
- **Impact**: 認証フロー完全動作

### 2. Token Provider Pattern Migration (v0.1.9)
- **Issue**: 静的トークンによる認証タイミング問題
- **Solution**: 動的トークンプロバイダーパターン実装
- **Benefits**: トークン更新の自動化、認証エラー削減

### 3. TypeScript型安全性 (v0.1.5)
- **Issue**: Obsidian API型定義との不整合
- **Solution**: 適切な型ガード、インターフェース定義
- **Benefits**: 開発時エラー検出、コード品質向上

### 4. Test Infrastructure (v0.1.3-0.1.5)
- **Issue**: Obsidian環境での複雑なテスト設定
- **Solution**: Mock戦略とJest設定最適化
- **Benefits**: CI/CD対応、リグレッション防止

---

## 技術スタック

### Core Technologies
- **TypeScript**: プラグインコア実装
- **Obsidian API**: プラグインフレームワーク
- **Microsoft Graph API**: Todo同期
- **MSAL.js**: Microsoft認証
- **Jest**: テストフレームワーク

### Build Tools
- **esbuild**: バンドリング
- **npm scripts**: ビルド自動化
- **Git**: バージョン管理とfeature-branch戦略

### Authentication Flow
- **Azure App Registration**: c6b68d29-5d13-4caf-aba6-14bf3de5c772
- **Device Code Flow**: ブラウザレス認証
- **Token Provider Pattern**: 動的トークン管理
- **Direct API Calls**: JWT問題回避

---

## 開発プロセス改善

### Git Strategy Implementation
- **Main Branch Protection**: リリース専用ブランチ
- **Feature Branches**: 機能別開発
- **Single Responsibility**: コミット単位の責任分離
- **Version Management**: 自動バージョンバンプ

### Code Quality
- **TypeScript Strict**: 厳密な型チェック
- **Test Coverage**: 機能カバレッジ
- **Error Handling**: 包括的エラー管理
- **Documentation**: Claude.md開発ガイダンス

---

## 今後の改善予定

### Performance Optimization
- Task同期の効率化
- Batch API呼び出し最適化
- ローカルキャッシュ戦略

### Feature Enhancements
- Bi-directional同期
- Custom Task属性
- 複数Workspace対応

### Developer Experience
- Hot Reload対応
- デバッグツール改善
- CI/CD Pipeline

---

## 学習・克服した技術課題

### Microsoft Authentication Ecosystem
- Graph Client SDK制限の理解
- Access Token vs JWT Token形式差異
- Azure App Registration設定最適化

### Obsidian Plugin Development
- Plugin Lifecycle管理
- API制約とMock戦略
- TypeScript型安全性

### Testing Strategy
- 非同期処理テスト
- API Mock設計
- 統合テスト自動化

---

*Development Log as of v0.1.9 (2025-06-23)*