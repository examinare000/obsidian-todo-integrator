#!/bin/bash

# Manual script for reorganizing commits with atomic principles
# This provides step-by-step commands you can run manually

echo "=== Manual Git Commit Reorganization ==="
echo ""
echo "This script provides commands to manually reorganize your commits."
echo "Copy and paste these commands as needed."
echo ""

cat << 'COMMANDS'
# Step 1: Create backup branch
git branch master-backup-$(date +%Y%m%d-%H%M%S)

# Step 2: Start interactive rebase
git rebase -i origin/master

# In the editor, change 'pick' to 'edit' for these commits:
# - 723754e TaskMetadataStoreの実装とテスト追加、プラグインインスタンス渡しの矛盾解消
# - 0ab3f99 期限日優先のタスク配置ロジックを実装 (if it has many files)

# Step 3: When git stops at commit 723754e, run these commands:

# Reset the commit but keep changes staged
git reset --soft HEAD^

# Unstage all files
git reset

# Now create atomic commits:

# 1. Constants update
git add src/constants.ts
git commit -m "定数: TaskMetadataStoreのストレージキーを追加"

# 2. Type definition changes
git add src/types.ts
git commit -m "型定義: 不要なtodoIdプロパティを削除"

# 3. TaskMetadataStore implementation
git add src/sync/TaskMetadataStore.ts
git commit -m "TaskMetadataStore: タスクメタデータの永続化機能を実装"

# 4. Plugin updates
git add src/TodoIntegratorPlugin.ts
git commit -m "TodoIntegratorPlugin: TaskMetadataStoreインスタンスを渡すように修正"

# 5. DailyNoteManager updates
git add src/sync/DailyNoteManager.ts
git commit -m "DailyNoteManager: プラグインインスタンスの受け渡しを修正"

# 6. Parser updates
git add src/parser/ObsidianTodoParser.ts
git commit -m "ObsidianTodoParser: タスクIDパース処理を改善"

# 7. TodoSynchronizer updates
git add src/sync/TodoSynchronizer.ts
git commit -m "TodoSynchronizer: TaskMetadataStoreを使用したメタデータ同期を実装"

# 8. TaskMetadataStore unit tests
git add tests/unit/taskMetadataStore.test.ts
git commit -m "テスト: TaskMetadataStoreの単体テストを追加"

# 9. Title cleaning tests
git add tests/unit/titleCleaning.test.ts
git commit -m "テスト: タイトルクリーニング処理のテストを追加"

# 10. Integration tests
git add tests/integration/metadataSync.test.ts
git commit -m "テスト: メタデータ同期の統合テストを追加"

# 11. Update existing tests
git add tests/unit/dailyNoteManager.test.ts
git add tests/unit/todoSynchronizer.test.ts
git add tests/unit/todoSynchronizer.simple.test.ts
git commit -m "テスト: 既存テストをTaskMetadataStore対応に更新"

# 12. Version updates
git add manifest.json package.json package-lock.json versions.json
git commit -m "バージョン: 0.2.4-dev5へ更新"

# Continue rebase
git rebase --continue

# Step 4: If you need to split commit 0ab3f99, when git stops:

# Check the files changed
git show --stat

# If it has many unrelated changes, reset and split:
git reset --soft HEAD^
git reset

# Example split (adjust based on actual files):
# Implementation files
git add src/sync/TodoSynchronizer.ts src/sync/DailyNoteManager.ts
git commit -m "TodoSynchronizer/DailyNoteManager: 期限日優先のタスク配置ロジックを実装"

# Test files
git add tests/
git commit -m "テスト: 期限日優先タスク配置のテストを追加"

# Other files
git add -A
git commit -m "設定: 期限日優先機能の関連設定を更新"

# Continue rebase
git rebase --continue

# Step 5: After rebase completes, verify the result
git log --oneline origin/master..HEAD

# Step 6: If you need to abort and restore original state
# git rebase --abort  # During rebase
# git reset --hard master-backup-YYYYMMDD-HHMMSS  # After rebase

COMMANDS

echo ""
echo "Copy the commands above and run them step by step."
echo "Make sure to review files before committing to ensure proper grouping."