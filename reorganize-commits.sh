#!/bin/bash

# Script to reorganize commits following atomic commit principles
# Created: 2025-06-24

set -e

echo "=== Git Commit Reorganization Script ==="
echo "This script will reorganize commits from origin/master to HEAD"
echo "following atomic commit principles."
echo ""

# Ensure we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo "Error: Not in a git repository"
    exit 1
fi

# Check for uncommitted changes
if ! git diff-index --quiet HEAD --; then
    echo "Error: You have uncommitted changes. Please commit or stash them first."
    exit 1
fi

# Get current branch name
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
BACKUP_BRANCH="${CURRENT_BRANCH}-backup-$(date +%Y%m%d-%H%M%S)"

echo "Current branch: $CURRENT_BRANCH"
echo "Creating backup branch: $BACKUP_BRANCH"

# Create backup branch
git branch "$BACKUP_BRANCH"
echo "✓ Backup branch created"

# Create a temporary file for the rebase todo list
REBASE_TODO=$(mktemp)

echo "Generating rebase todo list..."

# Generate the rebase todo list with special handling for commit 723754e
cat > "$REBASE_TODO" << 'EOF'
# Rebase todo list for atomic commit reorganization

# First commits (keep as-is)
pick dabb438 同期時の重複タスク作成を防ぐ処理を追加
pick 203fcba タスク作成時にタイトルから[todo::タグを除外する処理を追加
pick 4e0a70b 設定変更時にDailyNoteManagerの設定を更新する処理を追加
pick 2e2bf2d 0.2.2
pick b2e02ae タスク追加時にファイルを再読み込みしてセクション配下に正しく配置する修正
pick bec065c 0.2.3
pick c401454 Microsoft TodoタスクのタイトルからtodoIDを確実に除外する処理を追加
pick 4518c0e 0.2.4
pick 1341c01 todo IDを含む全ての文字に対応する正規表現に修正
pick 541d0a3 TodoSynchronizerのタイトルクリーニング処理を強化しデバッグログを追加
pick a5f40c9 Microsoft Todo APIから取得したタスクの内容をログ出力
pick 66d2f1c Microsoft Todoのタスクタイトルから自動的にtodo IDを除去する機能を追加
pick 70bdeee ログレベル設定の初期化タイミングを修正
pick 5913368 デバッグログレベル修正をマージ

# Split commit 723754e into atomic commits
edit 723754e TaskMetadataStoreの実装とテスト追加、プラグインインスタンス渡しの矛盾解消

# Continue with remaining commits
pick 7943b6e テスト修正とバージョン0.2.4-dev5への更新
pick b39e37d TodoApiClient：正規表現パターンを設計仕様に統一
pick 11490c7 TodoSynchronizer: 完了済みMicrosoftタスクをObsidianに完了状態で追加する機能を実装
pick 1313604 DailyNoteManager: addTaskToTodoSectionメソッドに完了状態パラメータを追加
pick 61bde5a テスト追加: 完了済みMicrosoftタスクの同期テストケース
pick a1bac0b TodoSynchronizer: 完了済みMicrosoftタスクの新規追加を除外
pick 93cdc7f DailyNoteManager: 完了状態パラメータを削除して元の仕様に戻す
pick e939ee1 テスト: 完了済みMicrosoftタスクがスキップされることを確認するテストを追加
pick 2e3d68a テスト計画ログ更新
pick 89555b7 0.2.4
pick dd57f92 バージョン0.2.5へ更新

# Split commit 0ab3f99 if needed
edit 0ab3f99 期限日優先のタスク配置ロジックを実装

pick 6163c34 0.2.6
pick c389e51 TodoSynchronizer: 完了日時の無効な値に対するエラーハンドリングを追加
pick cc349c5 テスト: 無効な完了日時のハンドリングテストを追加
pick bd8347c テスト計画: 完了状態同期のエラーハンドリングテストを追加
pick f75a75e バージョン0.2.7-dev.0へ更新
EOF

echo "✓ Rebase todo list generated"

# Create helper script for splitting commits
cat > split-commits.sh << 'SPLIT_SCRIPT'
#!/bin/bash

# Helper script to split commits during interactive rebase

echo "=== Splitting commits ==="

# Function to create atomic commit
atomic_commit() {
    local files="$1"
    local message="$2"
    
    git add $files
    git commit -m "$message"
}

# Check which commit we're on
CURRENT_COMMIT=$(git rev-parse HEAD)
COMMIT_MESSAGE=$(git log -1 --pretty=%s)

echo "Current commit: $COMMIT_MESSAGE"

if [[ "$COMMIT_MESSAGE" == *"TaskMetadataStoreの実装とテスト追加"* ]]; then
    echo "Splitting TaskMetadataStore commit..."
    
    # Reset to unstage all changes
    git reset HEAD^
    
    # 1. Constants update
    atomic_commit "src/constants.ts" "定数: TaskMetadataStoreのストレージキーを追加"
    
    # 2. Type definition changes
    atomic_commit "src/types.ts" "型定義: 不要なtodoIdプロパティを削除"
    
    # 3. TaskMetadataStore implementation
    atomic_commit "src/sync/TaskMetadataStore.ts" "TaskMetadataStore: タスクメタデータの永続化機能を実装"
    
    # 4. Plugin instance passing updates
    atomic_commit "src/TodoIntegratorPlugin.ts" "TodoIntegratorPlugin: TaskMetadataStoreインスタンスを渡すように修正"
    
    # 5. DailyNoteManager updates
    atomic_commit "src/sync/DailyNoteManager.ts" "DailyNoteManager: プラグインインスタンスの受け渡しを修正"
    
    # 6. ObsidianTodoParser updates
    atomic_commit "src/parser/ObsidianTodoParser.ts" "ObsidianTodoParser: タスクIDパース処理を改善"
    
    # 7. TodoSynchronizer updates
    atomic_commit "src/sync/TodoSynchronizer.ts" "TodoSynchronizer: TaskMetadataStoreを使用したメタデータ同期を実装"
    
    # 8. Unit tests for TaskMetadataStore
    atomic_commit "tests/unit/taskMetadataStore.test.ts" "テスト: TaskMetadataStoreの単体テストを追加"
    
    # 9. Title cleaning tests
    atomic_commit "tests/unit/titleCleaning.test.ts" "テスト: タイトルクリーニング処理のテストを追加"
    
    # 10. Integration tests
    atomic_commit "tests/integration/metadataSync.test.ts" "テスト: メタデータ同期の統合テストを追加"
    
    # 11. Update existing tests
    atomic_commit "tests/unit/dailyNoteManager.test.ts tests/unit/todoSynchronizer.test.ts tests/unit/todoSynchronizer.simple.test.ts" "テスト: 既存テストをTaskMetadataStore対応に更新"
    
    # 12. Version and manifest updates
    atomic_commit "manifest.json package.json package-lock.json versions.json" "バージョン: 0.2.4-dev5へ更新"
    
elif [[ "$COMMIT_MESSAGE" == *"期限日優先のタスク配置ロジック"* ]]; then
    echo "Checking if commit needs splitting..."
    
    # Reset to see what files are changed
    git reset HEAD^
    
    # Check how many files changed
    CHANGED_FILES=$(git diff --cached --name-only | wc -l)
    
    if [ "$CHANGED_FILES" -gt 5 ]; then
        echo "Splitting due date priority commit..."
        
        # Split implementation and tests
        # (Add specific file patterns here based on actual changes)
        git add src/sync/TodoSynchronizer.ts src/sync/DailyNoteManager.ts
        git commit -m "TodoSynchronizer/DailyNoteManager: 期限日優先のタスク配置ロジックを実装"
        
        # Add tests separately
        git add tests/
        git commit -m "テスト: 期限日優先タスク配置のテストを追加"
        
        # Add remaining files
        git add -A
        git commit -m "設定・ドキュメント: 期限日優先機能の設定を更新"
    else
        # If not many files, keep as single commit
        git add -A
        git commit -m "$COMMIT_MESSAGE"
    fi
else
    echo "No special handling needed for this commit"
fi

echo "✓ Commit splitting complete"
SPLIT_SCRIPT

chmod +x split-commits.sh

echo ""
echo "=== Instructions ==="
echo "1. The script will now start an interactive rebase"
echo "2. When git stops at commits marked 'edit', run: ./split-commits.sh"
echo "3. After splitting, run: git rebase --continue"
echo "4. Repeat for each commit marked for editing"
echo ""
echo "Press Enter to start the rebase, or Ctrl+C to cancel..."
read

# Start the interactive rebase
GIT_SEQUENCE_EDITOR="cp $REBASE_TODO" git rebase -i origin/master

echo ""
echo "=== Rebase Complete ==="
echo "If successful, your commits are now atomic!"
echo "Backup branch saved as: $BACKUP_BRANCH"
echo ""
echo "To verify the result, run:"
echo "  git log --oneline origin/master..HEAD"
echo ""
echo "If you need to restore the original state:"
echo "  git reset --hard $BACKUP_BRANCH"

# Cleanup
rm -f "$REBASE_TODO" split-commits.sh