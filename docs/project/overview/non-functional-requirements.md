<!-- INIT:STAGE-A:NFR -->

# Non-functional Requirements (NFR)

## Conclusions (read first)
- Security/privacy: 复用 My-Chat **Logto/OIDC**；财务为**组织/团队级**能力 + 账套级隔离 + 组织内 RBAC；财务数据高敏感、**强隔离**于生态检索/推荐（DP24）。
- Performance: 后台交互型，常规列表/录入 **P95 < 500ms**，过账 < 1s，报表 < 5s；OCR/批处理异步。
- Availability: v1 目标 **99.5%**；财务写入强一致、可恢复。
- Compliance: 中国财务合规（借贷记账法、单据留痕、封账规则）；**会计档案法定留存**（凭证/账簿约 30 年、年报永久、月/季报 10 年）；密钥经阿里云 KMS/Secrets Manager。

## Security and privacy
- Data classification: 财务数据（凭证、余额、资金账户、银行账号）= **高敏感**；往来单位/个人信息按 PII 处理（PIPL）。
- Authentication/authorization:
  - 认证：**Logto/OIDC SSO**（与 My-Chat 同一身份源），后端校验短时 JWT。
  - 多租户：财务为**组织/团队级**（DP22）；账套属于组织，一组织可多账套，**账套级行级隔离**。
  - 授权：组织内 **RBAC**（会计/出纳/主管/管理员/只读查看者）。
  - **职责分离（SoD）**：制单 ≠ 审核；付款发起 ≠ 审批。团队仅 1 人时可显式开启**单人模式**（放宽 SoD，但强制二次确认 + 全量留痕，DP23）。
- 集成隔离护栏（DP24）: 财务明细**禁止**进入 My-Chat 的 RAG/知识库/论坛 public-draft/个性化推荐；对外仅暴露**通知元数据 + 审批回写**；事件 payload 不含金额/账号等敏感明细。
- Audit/logging（操作审计）: 关键操作（建/改科目、制单、审核、过账、红冲、收付款、审批、结账、反结账、单人模式开关）写**不可篡改审计记录**（操作人/时间/前后值）；操作审计日志保留 **≥ 1 年**。
- 会计档案法定留存（与操作审计区分）: 会计凭证、会计账簿按法规长期保存（**约 30 年**）；**年度财务报告永久**；月度/季度财务报告 **10 年**（以《会计档案管理办法》为准，落地前与财务/法务复核）。
- Threat model notes: 防跨账套越权；防绕过审批直接出款；防凭证静默删除/篡改（仅作废/红冲留痕）；防财务数据泄漏入生态检索；事件/回调校验签名防伪造；单人模式滥用监控。
- Compliance: 借贷记账法、会计期间封账；密钥经阿里云 KMS/Secrets Manager（生产不使用 Bitwarden）；数据存储与出境遵循 My-Chat 既有约束。

## Performance and scalability
- Target latency: 常规录入/查询 **P95 < 500ms**；凭证过账单笔 < 1s；中小账套报表 < 5s；OCR 识别异步、秒级返回结果即可。
- Throughput: v1 面向单组织财务团队（数人~数十人并发），峰值数十 RPS。
- Data size expectations: 年凭证量级 1 万~10 万条/账套；按账套 + 期间分区/索引设计。
- Scaling assumptions: 无状态 API 水平扩展；重计算（报表/批量过账/OCR）走异步任务（BullMQ，对齐 My-Chat）。

## Availability and resilience
- Availability target: v1 99.5%（工作时段优先保障）。
- Backup/restore expectations: PostgreSQL 每日备份 + PITR；定期恢复演练；财务数据 RPO ≤ 24h、RTO ≤ 4h（v1 目标，可调）；会计档案需满足法定留存的长期可恢复性。
- Failure modes and degradation: My-Chat/事件通道不可用时，ERP 后台仍可独立录入与审批（通知降级、事件缓冲于 outbox 重试），保证财务主流程不中断；OCR 不可用时回退手工录入。

## Operability
- Observability: 结构化日志 + 关键业务指标（待审批数、过账失败、事件积压、OCR 成功率、单人模式启用情况）+ 关键链路追踪；对齐 My-Chat 可观测约定（后置接入）。
- Support workflows: 事件重放/补偿（outbox dead-letter）；反结账与红冲作为业务级纠错；管理员可查审计轨迹定位问题。

## Verification
- 每个章节均给出可度量目标，或以「待定项」明确登记到 `risk-open-questions.md`（含 owner/options/decision due）。
