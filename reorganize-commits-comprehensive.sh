#!/bin/bash

# Comprehensive commit reorganization script
# This script will create proper feature branches and reorganize all commits

echo "Starting comprehensive commit reorganization..."

# Save current branch
CURRENT_BRANCH=$(git branch --show-current)
echo "Current branch: $CURRENT_BRANCH"

# Create backup
echo "Creating backup branch..."
git branch -f backup-comprehensive-$(date +%Y%m%d-%H%M%S) HEAD

# Start from origin/master
echo "Switching to origin/master..."
git checkout origin/master -q

# 1. Create feature/clean-task-titles branch
echo "Creating feature/clean-task-titles..."
git checkout -b feature/clean-task-titles -q

# Cherry-pick task title cleaning commits
git cherry-pick dabb438 -q  # 同期時の重複タスク作成を防ぐ処理を追加
git cherry-pick 203fcba -q  # タスク作成時にタイトルから[todo::タグを除外する処理を追加
git cherry-pick b39e37d -q  # TodoApiClient：正規表現パターンを設計仕様に統一
git cherry-pick 1341c01 -q  # todo IDを含む全ての文字に対応する正規表現に修正
git cherry-pick 541d0a3 -q  # TodoSynchronizerのタイトルクリーニング処理を強化しデバッグログを追加
git cherry-pick 66d2f1c -q  # Microsoft Todoのタスクタイトルから自動的にtodo IDを除去する機能を追加
git cherry-pick c401454 -q  # Microsoft TodoタスクのタイトルからtodoIDを確実に除外する処理を追加

echo "feature/clean-task-titles created with $(git rev-list --count origin/master..HEAD) commits"

# 2. Create feature/fix-completed-task-sync branch
echo "Creating feature/fix-completed-task-sync..."
git checkout origin/master -q
git checkout -b feature/fix-completed-task-sync -q

git cherry-pick 61bde5a -q  # テスト追加: 完了済みMicrosoftタスクの同期テストケース
git cherry-pick 1313604 -q  # DailyNoteManager: addTaskToTodoSectionメソッドに完了状態パラメータを追加
git cherry-pick 11490c7 -q  # TodoSynchronizer: 完了済みMicrosoftタスクをObsidianに完了状態で追加する機能を実装
git cherry-pick a1bac0b -q  # TodoSynchronizer: 完了済みMicrosoftタスクの新規追加を除外
git cherry-pick 93cdc7f -q  # DailyNoteManager: 完了状態パラメータを削除して元の仕様に戻す
git cherry-pick e939ee1 -q  # テスト: 完了済みMicrosoftタスクがスキップされることを確認するテストを追加

echo "feature/fix-completed-task-sync created with $(git rev-list --count origin/master..HEAD) commits"

# 3. Create feature/use-due-date-for-task-placement branch
echo "Creating feature/use-due-date-for-task-placement..."
git checkout origin/master -q
git checkout -b feature/use-due-date-for-task-placement -q

git cherry-pick 0ab3f99 -q  # 期限日優先のタスク配置ロジックを実装

echo "feature/use-due-date-for-task-placement created with $(git rev-list --count origin/master..HEAD) commits"

# 4. Create feature/task-metadata-store branch
echo "Creating feature/task-metadata-store..."
git checkout origin/master -q
git checkout -b feature/task-metadata-store -q

# Split the complex commit 723754e
git cherry-pick 723754e -q  # TaskMetadataStoreの実装とテスト追加、プラグインインスタンス渡しの矛盾解消

echo "feature/task-metadata-store created with $(git rev-list --count origin/master..HEAD) commits"

# 5. Create fix/log-level-initialization branch
echo "Creating fix/log-level-initialization..."
git checkout origin/master -q
git checkout -b fix/log-level-initialization -q

git cherry-pick 70bdeee -q  # ログレベル設定の初期化タイミングを修正
git cherry-pick 5913368 -q  # デバッグログレベル修正をマージ

echo "fix/log-level-initialization created with $(git rev-list --count origin/master..HEAD) commits"

# 6. Create fix/completion-date-handling branch (already exists, recreate)
echo "Creating fix/completion-date-handling..."
git checkout origin/master -q
git branch -D fix/completion-date-handling 2>/dev/null || true
git checkout -b fix/completion-date-handling -q

# Apply all fixes in order
git cherry-pick c389e51 -q  # TodoSynchronizer: 完了日時の無効な値に対するエラーハンドリングを追加
git cherry-pick cc349c5 -q  # テスト: 無効な完了日時のハンドリングテストを追加
git cherry-pick 53b33fc -q  # DailyNoteManager: 無効な日時値に対するエラーハンドリングを追加
git cherry-pick ca22518 -q  # TodoSynchronizer: 完了日時処理のデバッグログを追加

echo "fix/completion-date-handling created with $(git rev-list --count origin/master..HEAD) commits"

# 7. Create feature/implement-log-export branch (already exists, recreate)
echo "Creating feature/implement-log-export..."
git checkout origin/master -q
git branch -D feature/implement-log-export 2>/dev/null || true
git checkout -b feature/implement-log-export -q

# Re-apply log export commits from backup
git cherry-pick 0233bda -q  # 型定義: Logger interfaceにexportLogs()メソッドを追加
git cherry-pick 8dd296f -q  # TodoIntegratorPlugin: getLogger()メソッドを追加
git cherry-pick c8cc230 -q  # 設定画面: Export LogsボタンをloggerのexportLogs()に接続
git cherry-pick 0f7409c -q  # SimpleLogger: getLogHistory()をディープコピーに修正
git cherry-pick 54d935c -q  # テスト: SimpleLoggerのログエクスポート機能の単体テストを追加

echo "feature/implement-log-export created with $(git rev-list --count origin/master..HEAD) commits"

# 8. Create release branches for stable versions
echo "Creating release branches..."
git checkout origin/master -q

# Release 0.2.2
git checkout -b release/0.2.2 -q
git cherry-pick 2e2bf2d -q  # 0.2.2
git cherry-pick 4e0a70b -q  # 設定変更時にDailyNoteManagerの設定を更新する処理を追加
echo "release/0.2.2 created"

# Release 0.2.3
git checkout origin/master -q
git checkout -b release/0.2.3 -q
git cherry-pick bec065c -q  # 0.2.3
git cherry-pick b2e02ae -q  # タスク追加時にファイルを再読み込みしてセクション配下に正しく配置する修正
echo "release/0.2.3 created"

# Release 0.2.4
git checkout origin/master -q
git checkout -b release/0.2.4 -q
git cherry-pick 4518c0e -q  # 0.2.4
echo "release/0.2.4 created"

# Release 0.2.6
git checkout origin/master -q
git checkout -b release/0.2.6 -q
git cherry-pick 6163c34 -q  # 0.2.6
echo "release/0.2.6 created"

# Release 0.2.7
git checkout origin/master -q
git checkout -b release/0.2.7 -q
git cherry-pick a926263 -q  # 0.2.7
echo "release/0.2.7 created"

# 9. Return to master and show summary
echo "Returning to master..."
git checkout master -q

echo ""
echo "=== Reorganization Complete ==="
echo ""
echo "Created branches:"
git branch | grep -E "feature/|fix/|release/" | sort

echo ""
echo "Branches with their commit counts:"
for branch in $(git branch | grep -E "feature/|fix/" | sed 's/\*//g' | xargs); do
    count=$(git rev-list --count origin/master..$branch 2>/dev/null || echo "0")
    echo "$branch: $count commits"
done

echo ""
echo "To push all branches to remote:"
echo "git push origin --all"

echo ""
echo "Original branches are backed up as backup-comprehensive-*"