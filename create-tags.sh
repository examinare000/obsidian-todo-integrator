#!/bin/bash

# Script to create git tags in 0.0.x series for all version commits

echo "Creating git tags for version commits in 0.0.x series..."
echo ""
echo "Version Mapping:"
echo "=================="

# Create tags for each version commit
git tag -a 0.0.1 34051bc -m "Version 0.0.1 (was 0.1.1)"
echo "0.1.1 -> 0.0.1 (commit: 34051bc)"

git tag -a 0.0.2 a5be0b5 -m "Version 0.0.2 (was 0.1.2)"
echo "0.1.2 -> 0.0.2 (commit: a5be0b5)"

git tag -a 0.0.3 8d219a7 -m "Version 0.0.3 (was 0.1.3)"
echo "0.1.3 -> 0.0.3 (commit: 8d219a7)"

git tag -a 0.0.4 5428a47 -m "Version 0.0.4 (was 0.1.4)"
echo "0.1.4 -> 0.0.4 (commit: 5428a47)"

git tag -a 0.0.5 f6fb8d2 -m "Version 0.0.5 (was 0.1.5)"
echo "0.1.5 -> 0.0.5 (commit: f6fb8d2)"

git tag -a 0.0.6 5c8ffbd -m "Version 0.0.6 (was 0.1.6)"
echo "0.1.6 -> 0.0.6 (commit: 5c8ffbd)"

git tag -a 0.0.7 fa98682 -m "Version 0.0.7 (was 0.1.7)"
echo "0.1.7 -> 0.0.7 (commit: fa98682)"

git tag -a 0.0.8 e5634e2 -m "Version 0.0.8 (was 0.1.8)"
echo "0.1.8 -> 0.0.8 (commit: e5634e2)"

git tag -a 0.0.9 3f04177 -m "Version 0.0.9 (was 0.1.9)"
echo "0.1.9 -> 0.0.9 (commit: 3f04177)"

git tag -a 0.0.10 3db89e2 -m "Version 0.0.10 (was 0.1.10)"
echo "0.1.10 -> 0.0.10 (commit: 3db89e2)"

git tag -a 0.0.11 6b937da -m "Version 0.0.11 (was 0.1.11)"
echo "0.1.11 -> 0.0.11 (commit: 6b937da)"

git tag -a 0.0.12 de7b652 -m "Version 0.0.12 (was 0.1.12)"
echo "0.1.12 -> 0.0.12 (commit: de7b652)"

git tag -a 0.0.13 d5f2cba -m "Version 0.0.13 (was 0.1.13)"
echo "0.1.13 -> 0.0.13 (commit: d5f2cba)"

git tag -a 0.0.14 90a0b24 -m "Version 0.0.14 (was 0.1.14)"
echo "0.1.14 -> 0.0.14 (commit: 90a0b24)"

git tag -a 0.0.15 566a3b4 -m "Version 0.0.15 (was 0.2.0)"
echo "0.2.0 -> 0.0.15 (commit: 566a3b4)"

git tag -a 0.0.16 6cc8106 -m "Version 0.0.16 (was 0.2.1)"
echo "0.2.1 -> 0.0.16 (commit: 6cc8106)"

git tag -a 0.0.17 7cbbcb1 -m "Version 0.0.17 (was 0.2.2)"
echo "0.2.2 -> 0.0.17 (commit: 7cbbcb1)"

git tag -a 0.0.18 7393860 -m "Version 0.0.18 (was 0.2.3)"
echo "0.2.3 -> 0.0.18 (commit: 7393860)"

# Handle duplicate 0.2.4 - using the first one
git tag -a 0.0.19 832c7cb -m "Version 0.0.19 (was 0.2.4)"
echo "0.2.4 -> 0.0.19 (commit: 832c7cb)"

# Skip the duplicate 0.2.4 (4bbe52d)
echo "0.2.4 (duplicate) -> SKIPPED (commit: 4bbe52d)"

git tag -a 0.0.20 795e45f -m "Version 0.0.20 (was 0.2.6)"
echo "0.2.6 -> 0.0.20 (commit: 795e45f)"

git tag -a 0.0.21 b06c221 -m "Version 0.0.21 (was 0.2.7)"
echo "0.2.7 -> 0.0.21 (commit: b06c221)"

git tag -a 0.0.22 afdca15 -m "Version 0.0.22 (was 0.2.8)"
echo "0.2.8 -> 0.0.22 (commit: afdca15)"

git tag -a 0.0.23 1ed4d51 -m "Version 0.0.23 (was 0.2.9)"
echo "0.2.9 -> 0.0.23 (commit: 1ed4d51)"

git tag -a 0.0.24 c7df724 -m "Version 0.0.24 (was 0.2.10)"
echo "0.2.10 -> 0.0.24 (commit: c7df724)"

git tag -a 0.0.25 e835347 -m "Version 0.0.25 (was 0.3.0)"
echo "0.3.0 -> 0.0.25 (commit: e835347)"

git tag -a 0.0.26 e3e44a6 -m "Version 0.0.26 (was 0.3.1)"
echo "0.3.1 -> 0.0.26 (commit: e3e44a6)"

git tag -a 0.0.27 3a73941 -m "Version 0.0.27 (was 0.3.2)"
echo "0.3.2 -> 0.0.27 (commit: 3a73941)"

git tag -a 0.0.28 2ea15dd -m "Version 0.0.28 (was 0.3.3)"
echo "0.3.3 -> 0.0.28 (commit: 2ea15dd)"

git tag -a 0.0.29 183453c -m "Version 0.0.29 (was 0.3.4)"
echo "0.3.4 -> 0.0.29 (commit: 183453c)"

git tag -a 0.0.30 7eb0ff7 -m "Version 0.0.30 (was 0.3.5)"
echo "0.3.5 -> 0.0.30 (commit: 7eb0ff7)"

git tag -a 0.0.31 1089d96 -m "Version 0.0.31 (was 0.4.0)"
echo "0.4.0 -> 0.0.31 (commit: 1089d96)"

# Handle duplicate 0.4.1 - using the first one
git tag -a 0.0.32 e453230 -m "Version 0.0.32 (was 0.4.1)"
echo "0.4.1 -> 0.0.32 (commit: e453230)"

# The current commit (9949294) becomes 0.1.0 as requested
git tag -a 0.1.0 9949294 -m "Version 0.1.0 (was 0.4.1)"
echo "0.4.1 (current) -> 0.1.0 (commit: 9949294)"

echo ""
echo "=================="
echo "All tags created successfully!"
echo ""
echo "To push tags to remote, run:"
echo "git push origin --tags"