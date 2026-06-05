<!-- INIT:STAGE-A:RISK -->

# Risks and Open Questions

## Conclusions (read first)
- Highest risk areas:
  - **个人生态 × 组织财务的张力**：My-Chat 个人优先，财务需组织/多角色/职责分离（已用 DP22/DP23 缓解，但落地仍需验证组织在 My-Chat 中的普及度）。
  - 与 My-Chat 的**身份/事件集成契约**（Logto Organization 接入、事件消费端、审批回写）尚需与 My-Chat 团队确认。
  - **财务正确性与合规**（借贷平衡、过账/结账一致性、单据留痕、会计档案法定留存）为硬约束，错误代价高。
- Biggest unknowns:
  - My-Chat 侧组织（Organization）使用是否普遍、是否需引导用户先建组织/团队。
  - My-Chat 侧消费 ERP 事件并推送通知的能力现状（需新增还是已有）。
  - OCR 通道的可用性与准确率（试点依赖外部模型）。
- Decisions landed（本轮已定）:
  - DP7/DP22：账套**组织级**、一组织可多账套。
  - DP8：银行对账移至 **v1.1**。
  - DP9：集成走**事件 + ERP 后台审批**。
  - DP10：内置《小企业会计准则》科目模板。
  - DP11：v1 含**现金流量表**。
  - DP12：v1 **试点票据 OCR**。
  - DP13：角色 = 会计/出纳/主管/管理员 + 只读查看者。
  - DP14：辅助核算 = 往来单位 + 部门 + 项目。
  - DP23：默认强 SoD + 单人模式可选。
  - DP24：财务数据**强隔离**于生态检索/推荐。
  - DP21：操作审计日志（≥1 年）与会计档案法定留存（约 30 年/永久/10 年）分列。
  - DP25：组织成员**邀请制**加入 + 严格权限管理（RBAC + 最小权限 + 账套级 + 操作级）。
  - DP26：按**角色组织工作流**（待办/任务驱动），而非线性财务管道。
  - DP27：v1 支持**期初建账**（启用期间 + 期初余额录入/导入）。
  - DP28：收付款单按**记账规则自动生成凭证草稿**，会计复核过账。
  - DP29：审批**可配置多级 + 金额阈值分级**。
  - DP30：v1 支持**导出(Excel/PDF) + 打印 + 凭证导入**。
  - DP31：会计期间 = 自然年、12 期 + 年结期。
  - DP32：凭证记录**税额（价税分离）字段**，但不做税务申报。

## Open questions (prioritized)

1. Question: 与 My-Chat 的集成契约（Logto 组织接入 + 事件 schema + 审批回写）如何落定？
   - Why it matters: 决定 SSO、事件消费端、通知回写的实现量与时序。
   - Owner: 用户 / My-Chat 团队
   - Options: (a) ERP 发 outbox 事件、My-Chat 新增消费端推送（当前选向）；(b) 先用 mock 消费端联调，My-Chat 后接。
   - Decision due: Stage B 前（接口细节可 Stage C 细化）

2. Question: My-Chat 中「组织/团队」的普及与引导？
   - Why it matters: 财务为组织级；若用户多为个人，需引导先建组织或提供建组织入口。
   - Owner: 用户 / My-Chat 产品
   - Options: 财务入口处引导建组织 / 仅对已有组织开放 / 后续考虑个体账套（当前 v1 不做）。
   - Decision due: Stage B 前

3. Question: OCR 通道选型（复用 My-Chat 通义/Dashscope vs 独立 OCR 服务）与准确率门槛？
   - Why it matters: 影响 v1 试点可行性与外部依赖。
   - Owner: 用户
   - Options: 复用 My-Chat llm（优先）/ 接专用票据 OCR / 仅预留接口先不接。
   - Decision due: Stage B（可作为试点专项）

4. Question: 现金流量表采用直接法（打标现金流量项目）还是后续补间接法？
   - Why it matters: 影响数据模型（现金流量项目打标）与录入负担。
   - Owner: 用户 / 会计
   - Options: 直接法打标（当前选向）/ 间接法从报表推导。
   - Decision due: Stage B 前

5. Question: 单人模式的合规边界与可用范围？
   - Why it matter: 放宽 SoD 可能削弱内控，需明确适用场景与留痕要求。
   - Owner: 用户 / 财务
   - Options: 仅小微/个体允许 / 全量允许但强提示 / 不提供（要求≥2 人）。
   - Decision due: Stage B 前

## Risks

- Risk: 个人生态缺少组织/第二审批人，导致财务内控弱化或无法使用。
  - Impact: 高（合规与可用性）
  - Likelihood: 中
  - Mitigation: 财务组织级 + 引导建组织；单人模式强留痕 + 二次确认；明确框定为团队能力。
  - Trigger: 大量个人用户无组织。

- Risk: 集成契约依赖 My-Chat 侧改造，进度受外部影响。
  - Impact: 高（阻塞联动验收）
  - Likelihood: 中
  - Mitigation: ERP 以独立后台为主、事件单向解耦；定义清晰事件 schema；先用 mock 消费端联调。
  - Trigger: My-Chat 侧无消费端或接口未就绪。

- Risk: 财务正确性缺陷（借贷不平、过账/结账不一致）。
  - Impact: 高（数据不可信）
  - Likelihood: 中
  - Mitigation: 借贷必平在服务层强校验 + DB 约束；过账/结账走事务；完整单元/集成测试。
  - Trigger: 并发过账、异常中断。

- Risk: 财务数据泄漏进 My-Chat 生态检索/推荐。
  - Impact: 高（隐私与信任）
  - Likelihood: 低-中
  - Mitigation: DP24 强隔离；事件 payload 仅元数据；安全测试与代码评审守门。
  - Trigger: 误把财务内容写入共享检索/知识库。

- Risk: OCR 准确率不足导致预填错误。
  - Impact: 中
  - Likelihood: 中
  - Mitigation: OCR 仅预填、人工确认后保存；失败回退手工；留存原票据可核对。
  - Trigger: 票据质量差/版式多样。

- Risk: 会计档案法定留存被低估（误用 1 年审计期）。
  - Impact: 中-高（合规）
  - Likelihood: 低
  - Mitigation: NFR 已区分操作审计与会计档案；落地前与财务/法务复核留存策略与归档方案。
  - Trigger: 备份/清理策略错误删除档案。

- Risk: 范围蔓延（被期望一次做成完整 ERP）。
  - Impact: 中
  - Likelihood: 中-高
  - Mitigation: 明确 v1 仅财务（会计+出纳）；其余模块仅预留扩展点；分阶段里程碑。
  - Trigger: 新增非财务模块需求。

## Assumptions register (optional)
- Assumption: My-Chat 的 Logto Organization/Membership 可作为 ERP 组织与成员来源。
  - Validation plan: Stage B 前与 My-Chat 团队确认接入参数与组织映射。
- Assumption: v1 单一本位币（人民币）。
  - Validation plan: 与用户确认；多币种后置。
- Assumption: OCR/LLM 可复用 My-Chat 合规模型（通义/Dashscope）。
  - Validation plan: 试点阶段验证可用性与准确率。
- Assumption: 财务团队规模为数人~数十人并发。
  - Validation plan: 与用户确认并据此定性能目标。

## Verification
- All unresolved items from other docs are consolidated here.
