# Version Mapping Summary

## Overview
This document shows the mapping from the original version numbers to the new 0.0.x series.

## Version Mapping Table

| Original Version | New Version | Commit Hash | Notes |
|------------------|-------------|-------------|--------|
| 0.1.1 | 0.0.1 | 34051bc | |
| 0.1.2 | 0.0.2 | a5be0b5 | |
| 0.1.3 | 0.0.3 | 8d219a7 | |
| 0.1.4 | 0.0.4 | 5428a47 | |
| 0.1.5 | 0.0.5 | f6fb8d2 | |
| 0.1.6 | 0.0.6 | 5c8ffbd | |
| 0.1.7 | 0.0.7 | fa98682 | |
| 0.1.8 | 0.0.8 | e5634e2 | |
| 0.1.9 | 0.0.9 | 3f04177 | |
| 0.1.10 | 0.0.10 | 3db89e2 | |
| 0.1.11 | 0.0.11 | 6b937da | |
| 0.1.12 | 0.0.12 | de7b652 | |
| 0.1.13 | 0.0.13 | d5f2cba | |
| 0.1.14 | 0.0.14 | 90a0b24 | |
| 0.2.0 | 0.0.15 | 566a3b4 | |
| 0.2.1 | 0.0.16 | 6cc8106 | |
| 0.2.2 | 0.0.17 | 7cbbcb1 | |
| 0.2.3 | 0.0.18 | 7393860 | |
| 0.2.4 | 0.0.19 | 832c7cb | First 0.2.4 |
| 0.2.4 | SKIPPED | 4bbe52d | Duplicate version |
| 0.2.6 | 0.0.20 | 795e45f | Note: 0.2.5 was skipped |
| 0.2.7 | 0.0.21 | b06c221 | |
| 0.2.8 | 0.0.22 | afdca15 | |
| 0.2.9 | 0.0.23 | 1ed4d51 | |
| 0.2.10 | 0.0.24 | c7df724 | |
| 0.3.0 | 0.0.25 | e835347 | |
| 0.3.1 | 0.0.26 | e3e44a6 | |
| 0.3.2 | 0.0.27 | 3a73941 | |
| 0.3.3 | 0.0.28 | 2ea15dd | |
| 0.3.4 | 0.0.29 | 183453c | |
| 0.3.5 | 0.0.30 | 7eb0ff7 | |
| 0.4.0 | 0.0.31 | 1089d96 | |
| 0.4.1 | 0.0.32 | e453230 | First 0.4.1 |
| 0.4.1 | 0.1.0 | 9949294 | Current commit (as requested) |

## Summary
- Total commits with version tags: 34
- New 0.0.x tags created: 32 (0.0.1 through 0.0.32)
- Current commit (9949294) tagged as: 0.1.0
- Duplicates handled: 
  - 0.2.4 (commit 4bbe52d) - skipped
  - 0.4.1 (commit 9949294) - tagged as 0.1.0 instead

## Git Commands

To create all tags, run:
```bash
./create-tags.sh
```

To push tags to remote:
```bash
git push origin --tags
```

To verify tags were created:
```bash
git tag -l | sort -V
```