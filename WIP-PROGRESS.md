# WIP: Microsoft Todo IDクリーニング機能

## 現在のブランチ
`fix/regex-for-todo-id-cleaning`

## 実装済み
1. ✅ 正規表現の修正 (`[a-zA-Z0-9\-]+` → `[^\]]+`)
   - TodoApiClient.ts
   - constants.ts
   - TodoSynchronizer.ts

2. ✅ タイトルクリーニング機能
   - `cleanTaskTitle()` メソッドの実装
   - デバッグログの追加

3. ✅ Microsoft Todo自動クリーンアップ
   - `updateTaskTitle()` メソッドの追加
   - 同期時の自動クリーニング処理

## 課題
- ログレベルの変更が動作していない
- デバッグログが出力されない

## 次のステップ
1. mainブランチからログレベル修正用ブランチを作成
2. ログレベル機能を修正
3. 現在のブランチにマージして開発継続

## コミット履歴
- 66d2f1c Microsoft Todoのタスクタイトルから自動的にtodo IDを除去する機能を追加
- a5f40c9 Microsoft Todo APIから取得したタスクの内容をログ出力
- 541d0a3 TodoSynchronizerのタイトルクリーニング処理を強化しデバッグログを追加
- 1341c01 todo IDを含む全ての文字に対応する正規表現に修正