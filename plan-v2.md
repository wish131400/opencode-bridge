# Plan v2（修订版）：仿 CodePilot UI，OpenCode 引擎不动

## 一、目标

把 Bridge Web 从"配置管理面板"升级成"**可用的 AI 对话工作区**"，观感和 CodePilot 一致：

- 漂亮的消息流（流式打字、代码高亮、Reasoning 折叠、Tool 卡片）
- 会话侧边栏（创建/切换/重命名/删除/搜索）
- Git 面板、文件树、终端（本次新增）
- 权限请求弹窗、TodoWrite 面板

**但引擎完全不换**：session、message、prompt、stream 都复用现有的 `opencodeClient`（`src/opencode/client.ts`）。Bridge 不建自己的 SQLite chat 表，不引入 Claude Agent SDK，不存储消息。

---

## 二、架构

```
浏览器
  │
  │  REST:   /api/chat/sessions, /api/chat/prompt, /api/chat/permission ...
  │  SSE:    /api/chat/events?session_id=xxx
  │
Bridge Admin Server（Express）
  │
  │  薄封装层：src/admin/routes/chat-*.ts
  │  事件归一层：src/admin/chat/event-normalizer.ts
  │
  ▼
opencodeClient（src/opencode/client.ts，现有）
  │
  ▼
OpenCode :4096（跑模型、存会话、存消息）
```

**关键原则**：
1. **不存数据**。会话和消息都问 `opencodeClient`；前端刷新就重新拉。
2. **后端做归一化**。OpenCode 的事件语义复杂（Part 类型多、字段不统一），后端把它们映射成干净的 `ChatEvent` 协议，前端只消费这一种协议。
3. **前端只关心渲染**。不直接调 OpenCode API、不解析 Part 结构。

---

## 三、事件协议（前后端契约）

后端归一化后推给前端的事件（SSE，`/api/chat/events`）：

```ts
type ChatEvent =
  | { type: 'message_start';   msg: { id: string; role: 'assistant'; createdAt: number } }
  | { type: 'text_delta';      msgId: string; text: string }           // 增量追加
  | { type: 'reasoning_delta'; msgId: string; text: string }           // thinking 增量
  | { type: 'tool_start';      msgId: string; tool: { id: string; name: string; input: unknown } }
  | { type: 'tool_delta';      msgId: string; toolId: string; output: string }  // stdout 流
  | { type: 'tool_end';        msgId: string; toolId: string; result: string; isError: boolean }
  | { type: 'message_end';     msgId: string; usage?: TokenUsage }
  | { type: 'permission_ask';  req: { id: string; tool: string; description: string; risk?: string } }
  | { type: 'permission_resolved'; reqId: string; decision: 'allow' | 'reject' }
  | { type: 'task_update';     todos: Array<{ id: string; content: string; status: string }> }
  | { type: 'session_idle';    sessionId: string }
  | { type: 'error';           message: string }
  | { type: 'keepalive' };
```

**映射逻辑**（在 `event-normalizer.ts` 实现）：
- `messagePartUpdated` (text 类型) → `text_delta`
- `messagePartUpdated` (tool 类型, status=running) → `tool_start` 或 `tool_delta`
- `messagePartUpdated` (tool 类型, status=completed) → `tool_end`
- `messagePartUpdated` (reasoning 类型) → `reasoning_delta`
- `permissionRequest` → `permission_ask`
- `sessionIdle` → `session_idle`
- `sessionError` → `error`
- `questionAsked` → 归到 `permission_ask` 的变体或单独事件（后续定）

前端看到的就是简单线性事件流，不用管 OpenCode 的内部结构。

---

## 四、后端改动

### 新增（都在 `src/admin/`）

| 文件 | 行数估计 | 职责 |
|------|----------|------|
| `chat/event-normalizer.ts` | ~300 | 订阅 `opencodeClient` EventEmitter，映射成 `ChatEvent`，按 sessionId 分发 |
| `chat/event-bus.ts` | ~150 | 每个 sessionId 维护订阅者列表，新客户端可拿到最近 N 条 snapshot |
| `routes/chat-sessions.ts` | ~250 | REST：列表/创建/重命名/删除/消息历史，内部调 `opencodeClient.listSessionsAcrossProjects()` 等 |
| `routes/chat-prompt.ts` | ~150 | `POST /api/chat/prompt`：发消息，内部调 `opencodeClient.sendMessagePartsAsync()` |
| `routes/chat-events.ts` | ~120 | `GET /api/chat/events?session_id=xxx` 长连接 SSE，从 `event-bus` 订阅 |
| `routes/chat-permission.ts` | ~80 | `POST /api/chat/permission/:id` 批准/拒绝 |
| `routes/chat-abort.ts` | ~50 | `POST /api/chat/sessions/:id/abort` 中断 |

### 注册
在 `src/admin/admin-server.ts` 的路由装载处加 6 行挂载新路由。

### 依赖
后端**无新增依赖**。

### 不动的
- `src/opencode/client.ts` 一行不改
- `src/handlers/`、`src/feishu/`、`src/router/`、IM 桥接全部保持

---

## 五、前端改动

### 新增目录 `web/src/views/chat/`（对标 CodePilot `src/components/chat/`）

| 文件 | 职责 |
|------|------|
| `ChatWorkspace.vue` | 三栏布局容器（侧边栏 / 对话区 / 辅助面板） |
| `SessionSidebar.vue` | 会话列表、搜索、新建、重命名、删除 |
| `ChatView.vue` | 消息流 + 输入框（主区） |
| `MessageList.vue` | 滚动容器，stick-to-bottom |
| `MessageItem.vue` | 单条消息（用户/助手/系统） |
| `StreamingMessage.vue` | 正在流式中的助手消息 |
| `MessageInput.vue` | 输入框、发送、附件、模型选择 |
| `PermissionDialog.vue` | 权限请求弹窗 |
| `TaskPanel.vue` | TodoWrite 面板 |
| `SessionHeader.vue` | 顶栏（标题、模型、中断按钮） |

### 新增 `web/src/components/ai-elements/`（对标 CodePilot `src/components/ai-elements/`）

纯渲染原子组件，不含业务逻辑：

| 文件 | 职责 |
|------|------|
| `Conversation.vue` | stick-to-bottom 容器（用 `use-stick-to-bottom` 的 Vue 端实现或自写） |
| `Message.vue` | 消息气泡（按 role 切样式） |
| `Markdown.vue` | Markdown 渲染（markdown-it + shiki） |
| `CodeBlock.vue` | 代码块 + 语言标签 + 复制按钮 |
| `Reasoning.vue` | 可折叠的 thinking 块 |
| `Tool.vue` | 工具调用卡片（输入 / 输出 / 状态 / 错误） |
| `Task.vue` | TodoWrite 任务项 |
| `Terminal.vue` | Bash 输出（ansi-to-html） |
| `FileTree.vue` | Glob / LS 结果渲染 |

### 新增 `web/src/composables/`

| 文件 | 职责 |
|------|------|
| `useChatSessions.ts` | 会话 CRUD 调 REST |
| `useChatMessages.ts` | 拉历史消息、监听流增量 |
| `useChatStream.ts` | 订阅 `/api/chat/events`，按 msgId 合并 delta |
| `usePermission.ts` | 处理权限弹窗队列 |

### 路由
在 `web/src/router/index.ts` 新增：
```ts
{ path: '/chat', component: () => import('../views/chat/ChatWorkspace.vue'), meta: { title: 'AI 工作区' } },
{ path: '/chat/:sessionId', component: () => import('../views/chat/ChatWorkspace.vue'), meta: { title: 'AI 工作区' } },
```

### Git / 文件 / 终端（沿用 v1 思路，但重做）

放在 `web/src/views/chat/side-panels/`，在右侧辅助面板切换：

| 文件 | 职责 |
|------|------|
| `GitPanel.vue` | Git 状态、commit/push/pull、分支切换、diff 查看 |
| `FileExplorer.vue` | 工作目录文件树 |
| `TerminalPanel.vue` | xterm.js 终端（复用 OpenCode 的 PTY，如果可用）|

配套后端：
- `src/admin/routes/workspace-git.ts` — `simple-git` 驱动
- `src/admin/routes/workspace-files.ts` — 目录列表/读文件
- `src/admin/routes/workspace-pty.ts` —（可选）WebSocket PTY

### 前端新增依赖
```json
{
  "shiki": "^1.x",            // 代码高亮
  "markdown-it": "^14.x",     // Markdown
  "ansi-to-html": "^0.7.x",   // Bash 输出
  "simple-git": "^3.x",       // 后端用（Git 面板）
  "@xterm/xterm": "^5.x"      // 终端（可延后）
}
```

---

## 六、分阶段路线

### Phase A：事件归一化 + 后端 REST（2 天）
- [ ] 写 `event-normalizer.ts` + `event-bus.ts`
- [ ] 写 5 个 chat 路由（sessions / prompt / events / permission / abort）
- [ ] 在 `admin-server.ts` 注册
- [ ] 用 curl 打通：能创建会话、发消息、SSE 收到 `text_delta`

### Phase B：前端主骨架（3 天）
- [ ] 路由 `/chat` + 三栏 `ChatWorkspace.vue`
- [ ] `SessionSidebar` 能列会话 / 创建 / 切换
- [ ] `ChatView` + `MessageList` + `MessageInput` 跑通基本问答
- [ ] `useChatStream` 接事件、`StreamingMessage` 流式显示

### Phase C：消息渲染器（3 天）
- [ ] `ai-elements/` 全套组件
- [ ] `MessageItem` 按块类型分发渲染
- [ ] 代码高亮、Markdown、Reasoning 折叠、Tool 卡片到位

### Phase D：权限 + 中断 + Task（1 天）
- [ ] `PermissionDialog` 弹窗 + `/api/chat/permission`
- [ ] 中断按钮 → `/api/chat/sessions/:id/abort`
- [ ] `TaskPanel` 渲染 TodoWrite

### Phase E：Git / 文件 / 终端面板（3 天）
- [ ] 后端 `workspace-git.ts` + `simple-git`
- [ ] 前端 `GitPanel.vue`（状态 / diff / commit / push / pull）
- [ ] `FileExplorer.vue`
- [ ] `TerminalPanel.vue`（如 OpenCode PTY 不可用，延后）

### Phase F：润色（持续）
- [ ] 错误态 / 空态 / loading
- [ ] 快捷键（Cmd+Enter 发送、Esc 中断）
- [ ] 深色模式对齐
- [ ] 会话搜索

---

## 七、验收清单

- [ ] `/chat` 新建会话、发送 "hello"，看到流式打字回复
- [ ] 触发工具（Bash）→ 弹窗 → 允许 → 看到工具卡片 + 输出
- [ ] 代码块有语法高亮，Markdown 正确渲染
- [ ] Thinking 可折叠
- [ ] 切换会话不串号
- [ ] 刷新页面 → 历史消息从 OpenCode 拉回显示（不从本地存储）
- [ ] 中断按钮有效
- [ ] TodoWrite 面板显示任务
- [ ] Git 面板显示当前工作目录状态，可 commit/push
- [ ] 文件树可浏览
- [ ] IM（飞书等）回归正常，OpenCode 依赖不受影响

---

## 八、工作量估算

| 区块 | 新增代码 |
|------|---------|
| 后端 chat 路由 + 归一化 | ~1100 行 |
| 前端 chat 视图 | ~2500 行 |
| ai-elements 原子组件 | ~1500 行 |
| composables | ~500 行 |
| Git/文件/终端（复用 v1 思路重做） | ~2000 行 |
| **合计** | **~7600 行** |

比 v1（8607 行）少一点，但因为架构清晰不会有大量返工，**实际产出质量高得多**。

工期：**单人约 2 周**。

---

## 九、和 v1 的关键区别

| 维度 | v1（已废弃） | v2（本文档） |
|------|------------|------------|
| 消息流路径 | 前端直连 `/api/oc/*` 代理 | 后端归一化事件，前端只认 `ChatEvent` |
| 前端协议 | OpenCode 内部 Part 结构（复杂） | 简单线性 `ChatEvent` 流 |
| 会话存储 | —（无） | —（无，用 OpenCode） |
| 权限/中断 | 调 OpenCode 原始 API | 走 Bridge REST，后端转发 |
| UI 质量 | 简陋 MessageRenderer | 仿 CodePilot 全套 ai-elements |
| 代码组织 | routes/ 混杂 | `admin/chat/` 子模块收敛 |

---

## 十、不在本次范围

- 本地持久化会话/消息（不需要，OpenCode 已有）
- Claude Agent SDK 接入（别人做过了，没意义）
- IM 侧切换（飞书等继续走 OpenCode）
- 文件 checkpoint / rewind（CodePilot 有的高级功能，后续评估）
- 上下文压缩（OpenCode 有 `summarizeSession`，需要时直接调）
