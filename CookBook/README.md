# CookBook 示例索引

本目录按功能对示例做了分类，便于查找与学习。所有示例均归入子目录，根目录仅保留本索引。

---

## 目录结构

```
CookBook/
├── README.md                   # 本索引（唯一入口说明）
├── agents_as_tools/            # Agent 作为工具（多 Agent 编排）
├── session_memory/             # 会话与记忆
├── streaming/                  # 流式输出
├── multimodal/                 # 多模态输入/输出
├── agent_config/               # Agent 配置与上下文
└── monitoring/                 # 监控与统计
```

---

## 1. Agent 作为工具 (`agents_as_tools/`)

| 文件 | 说明 |
|------|------|
| `agents_as_tools_conditional.py` | 条件启用：根据 RunContext（如用户语言偏好）动态启用/禁用子 Agent 工具，支持 HITL 审批。 |
| `agents_as_tools_streaming.py` | 流式子 Agent：主 Agent 调用子 Agent 工具时，通过 `on_stream` 接收并处理子 Agent 的流式事件。 |

---

## 2. 会话与记忆 (`session_memory/`)

| 文件 | 说明 |
|------|------|
| `file_session.py` | 基于文件的会话持久化：将对话历史以 JSON 存盘，支持跨进程恢复。 |
| `file_hitl_example.py` | 文件会话 + 人机协同：磁盘持久化会话，且工具执行前需人工审批。（依赖 `file_session.py`） |
| `advanced_sqlite_session_example.py` | 高级 SQLite 会话：分支对话、使用统计、多时间线管理等。 |
| `dapr_session_example.py` | Dapr 状态存储会话：适用于多实例、多区域，支持 Redis/PostgreSQL 等后端。 |
| `openai_session_hitl_example.py` | OpenAI Conversations 会话 + HITL：使用官方会话存储，并结合工具审批。 |

---

## 3. 流式输出 (`streaming/`)

| 文件 | 说明 |
|------|------|
| `stream_text.py` | 文本流式：逐 token 输出回复（`ResponseTextDeltaEvent`）。 |
| `stream_items.py` | 流式事件：工具调用、工具输出、消息输出等事件的流式处理。 |
| `stream_ws.py` | WebSocket 流式：含流式输出、函数工具、Agent-as-tool、HITL 审批及后续轮次。 |
| `human_in_the_loop_stream.py` | HITL + 流式：工具需审批时暂停，审批后继续；全程支持流式输出。 |

---

## 4. 多模态输入/输出 (`multimodal/`)

| 文件 | 说明 |
|------|------|
| `local_image.py` | 本地图片：通过 base64 将本地图片传给 Agent 进行理解。 |
| `remote_image.py` | 远程图片：通过 URL 将网络图片传给 Agent。 |
| `remote_pdf.py` | 远程 PDF：通过 URL 传入 PDF，让 Agent 总结或问答。 |
| `image_tool_output.py` | 工具返回图片：Function Tool 返回图片，Agent 再对图片进行描述或分析。 |

---

## 5. Agent 配置与上下文 (`agent_config/`)

| 文件 | 说明 |
|------|------|
| `dynamic_system_prompt.py` | 动态系统提示：用 `RunContextWrapper` 根据上下文（如风格）生成不同 system 指令。 |
| `runContextWrapper.py` | RunContext 与多 Agent：在工具中注入 `RunContextWrapper`，实现多 Agent 协作与上下文传递。 |
| `StructuralOutput.py` | 结构化输出：使用 Pydantic 模型（如 `Recipe`）约束 Agent 输出格式。 |
| `agent_lifecycle_example.py` | Agent 生命周期与 Hooks：`on_start` / `on_end` / `on_handoff` / `on_tool_start` / `on_tool_end` 示例与 handoff。 |

---

## 6. 监控与统计 (`monitoring/`)

| 文件 | 说明 |
|------|------|
| `usage_tracking.py` | 使用量统计：从 Run 结果中读取 `Usage`（input/output/total tokens、请求数等）并打印。 |
| `usage.py` | 使用量示例：从 `result.context_wrapper.usage` 读取并打印 token 与请求使用情况。 |

---

## 分类汇总

| 分类 | 子目录 | 文件数 |
|------|--------|--------|
| Agent 作为工具 | `agents_as_tools/` | 2 |
| 会话与记忆 | `session_memory/` | 5 |
| 流式输出 | `streaming/` | 4 |
| 多模态 | `multimodal/` | 4 |
| Agent 配置与上下文 | `agent_config/` | 4 |
| 监控与统计 | `monitoring/` | 2 |

运行示例时请进入对应子目录执行，或使用 `python -m CookBook.子目录.模块名`（视项目根路径与包配置而定）。
