# 04 — Verification: M1 总账核心

> 记录每次验证：命令 + 预期 + 实际结果。

## 计划中的验证手段
- 单元测试（vitest）：借贷平衡不变式、红冲、RBAC 权限矩阵、金额 Decimal 边界。
- 集成测试（vitest + 测试库）：过账事务一致性、账套隔离（应用层 + RLS）、并发过账、期初平衡。
- 契约：OpenAPI 校验；`docs/context/db/schema.json` 与 Prisma 同步检查。
- CI：lint / test / build / security 绿。

## 验证记录
_(尚未开始。每次运行在此追加：日期 · 命令 · 结果。)_
