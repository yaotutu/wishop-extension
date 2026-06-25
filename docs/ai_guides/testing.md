# 测试指南

> 适用范围：写测试、跑测试、踩 `OrderStatus` enum 的坑、补用例时必读。AGENTS.md 只留一句"测试见此"，细节都在这里。

## 框架与运行

项目使用 Node.js 内置的 `node:test` 测试框架（无需引入第三方 runner），测试文件统一放在 `tests/` 目录，命名 `*.test.ts`（需要 TS 类型时）或 `*.test.mjs`（纯运行逻辑）。运行全部测试用 `npm test`（等价于 `node --test --experimental-strip-types tests/*.test.ts tests/*.test.mjs`）。

- 每次修改后运行 `npm run compile` 做 TypeScript 校验；涉及 background、manifest 或打包行为的修改，还要运行 `npm run build`。
- 涉及业务逻辑、领域计算、适配器解析、repository 行为的改动，应补 `node:test` 用例并跑 `npm test`。
- 测试通过 `import test from 'node:test'` 和 `import assert from 'node:assert/strict'` 编写；需要 IndexedDB 时引入 `fake-indexeddb/auto`。
- 新增测试时，可以与功能代码放在一起，也可以放到 `tests/` 目录。

## CI

CI（`.github/workflows/build.yml`）目前只跑 `compile` 和 `build`，**暂未跑测试**。所以本地 `npm test` 是唯一的回归保障，改了业务逻辑务必主动跑。

## 已知限制：`--experimental-strip-types` 不支持 `enum`

Node 的 `--experimental-strip-types` 只能擦除类型，**不支持 TypeScript `enum` 语法**。目前 `src/shared/types.ts` 中的 `export enum OrderStatus` 会触发 `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`，导致任何 **value import**（`import { OrderStatus }`）该枚举的测试无法运行。

规避方式（写测试时按需选用）：

- 用 `import type { OrderStatus }`（类型擦除，不产生运行时值）；或
- 直接用数字字面量，例如 `20 as OrderStatus`。

新增共享类型时**优先用联合字面量类型而非 `enum`**，以便测试可直接运行。例如：

```ts
// 推荐：联合字面量类型，测试可直接 import
export type TaskKind = 'sync' | 'refresh' | 'cleanup';

// 避免：enum，会导致 import 该符号的测试报错
export enum TaskKind { Sync = 'sync', ... }
```
