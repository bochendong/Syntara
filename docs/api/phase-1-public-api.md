# Syntara Public API v1（第一批测试能力）

这套 API 把测试中心当前 7 条核心流程变成 8 个外部接口；日历拆成“文件导入”和“自然语言命令”两个接口。

## 1. 基础约定

- Base URL：`https://<your-host>`
- 鉴权：`Authorization: Bearer <SYNTARA_API_KEY>`
- 可选追踪头：`X-Request-Id: caller-request-id`
- JSON 字段统一使用 `snake_case`
- OpenAPI：`GET /openapi-v1.yaml`

服务端配置示例：

```env
SYNTARA_PUBLIC_API_KEY=sk_syntara_replace_me
SYNTARA_PUBLIC_API_USER_ID=user_cuid
SYNTARA_PUBLIC_API_KEY_ID=partner-a
```

多 Key 配置：

```env
SYNTARA_PUBLIC_API_KEYS=[{"token":"sk_syntara_a","userId":"user_a","keyId":"partner-a"},{"token":"sk_syntara_b","userId":"user_b","keyId":"partner-b"}]
```

成功响应：

```json
{
  "success": true,
  "request_id": "req_...",
  "data": {}
}
```

失败响应：

```json
{
  "success": false,
  "request_id": "req_...",
  "error": {
    "code": "invalid_request",
    "message": "Invalid request.",
    "details": {}
  }
}
```

## 2. 接口总表

| 测试流程 | Method | Endpoint | 主要产物 |
| --- | --- | --- | --- |
| 上传文件生成 Cheat Sheet | POST | `/api/v1/cheat-sheets` | PNG / 图片 data URL |
| AI 路由并生成结构化笔记 | POST | `/api/v1/structured-notes` | 路由、结构化字段、完整 Markdown |
| Syllabus 生成日历 | POST | `/api/v1/calendars/import` | caller-managed calendar 快照 |
| 自然语言日历增删改查 | POST | `/api/v1/calendars/commands` | proposal 或更新后的 calendar |
| 题库与笔记题源路由 | POST | `/api/v1/question-sets` | 选题、补题、RAG 轨迹、验收结果 |
| 知识点 / 题目文字讲解 | POST | `/api/v1/explanations/text` | Markdown 讲解 |
| 知识点 PPT 讲解 | POST | `/api/v1/explanations/slides` | 1–2 页 SVG data URL 与播放动作 |
| 证据化复习计划 | POST | `/api/v1/review-plans` | 计划、证据、选题与理由 |

`GET /api/v1` 可读取机器友好的 capability list。

## 3. Cheat Sheet

`POST /api/v1/cheat-sheets`，请求类型为 `multipart/form-data`。

字段：

| 字段 | 必填 | 格式 |
| --- | --- | --- |
| `file` | 是 | PDF、PPTX、Markdown 或文本文件 |
| `sourceTitle` | 否 | 原资料标题 |
| `language` | 否 | `zh-CN`（默认）或 `en-US` |
| `usageProfile` | 否 | `university_course`、`research`、`daily_use` |
| `coverTitle` | 否 | Cheat Sheet 标题 |
| `coverCourseLabel` | 否 | 课程标签 |
| `coverFocus` | 否 | 希望重点覆盖的内容 |

默认返回 JSON，`data.image.data_url` 可直接赋给 `<img src>`：

```bash
curl -X POST "$BASE_URL/api/v1/cheat-sheets" \
  -H "Authorization: Bearer $SYNTARA_API_KEY" \
  -F "file=@lecture.pdf" \
  -F "language=zh-CN" \
  -F "coverTitle=期末复习 Cheat Sheet" \
  -F "coverFocus=定义、选法、适用条件、边界和检索词"
```

```json
{
  "success": true,
  "request_id": "req_...",
  "data": {
    "id": "cs_...",
    "object": "cheat_sheet",
    "title": "无穷级数收敛判别",
    "summary": "...",
    "sections": [{ "title": "...", "summary": "..." }],
    "source": { "title": "lecture.pdf", "hash": "...", "ai_input": "openai_file_id" },
    "image": {
      "data_url": "data:image/png;base64,...",
      "width": 1024,
      "height": 1448,
      "mime_type": "image/png"
    },
    "model": { "text": "openai:...", "image": "gpt-image-2" },
    "usage": {},
    "cost_estimate": {}
  }
}
```

如果调用方只要图片字节，增加 `Accept: image/png`：

```bash
curl -X POST "$BASE_URL/api/v1/cheat-sheets" \
  -H "Authorization: Bearer $SYNTARA_API_KEY" \
  -H "Accept: image/png" \
  -F "file=@lecture.pdf" \
  --output cheat-sheet.png
```

此流程不创建或修改业务笔记本。

## 4. 结构化笔记

`POST /api/v1/structured-notes`，同样使用 `multipart/form-data`。

```bash
curl -X POST "$BASE_URL/api/v1/structured-notes" \
  -H "Authorization: Bearer $SYNTARA_API_KEY" \
  -F "file=@paper.pdf" \
  -F "language=zh-CN" \
  -F "usageProfile=research"
```

核心返回格式：

```json
{
  "success": true,
  "request_id": "req_...",
  "data": {
    "id": "note_...",
    "object": "structured_note",
    "title": "...",
    "source": { "title": "paper.pdf", "hash": "...", "ai_input": "openai_file_id" },
    "classification": {
      "documentType": "research_paper",
      "usageProfile": "research",
      "topic": "...",
      "courseCode": null
    },
    "routing": {
      "usageProfile": "research",
      "confidence": 0.94,
      "reasons": ["..."],
      "sourceSignals": ["..."],
      "source": "ai"
    },
    "study_guide": { "kind": "research", "content": {} },
    "sections": [{ "key": "...", "title": "...", "summary": "...", "markdown": "..." }],
    "answer_contract": null,
    "full_markdown": "# ...",
    "model": "openai:...",
    "storage": "none"
  }
}
```

`usageProfile` 不传时由 AI 自动路由；传入时表示调用方指定路径。此接口只返回内容，不写业务数据库。

## 5. 日历导入与自然语言 CRUD

### 5.1 导入 syllabus

`POST /api/v1/calendars/import?timezone=Asia/Shanghai`

```bash
curl -X POST "$BASE_URL/api/v1/calendars/import?timezone=Asia/Shanghai" \
  -H "Authorization: Bearer $SYNTARA_API_KEY" \
  -F "pdf=@syllabus.pdf" \
  -F "courseName=CSC148"
```

返回的 `data` 本身就是下一次命令要传入的 calendar：

```json
{
  "id": "cal_...",
  "object": "calendar",
  "timezone": "Asia/Shanghai",
  "events": [
    {
      "id": "syllabus-...",
      "title": "Assignment 1 due",
      "kind": "assignment",
      "date": "2026-09-21",
      "source_name": "CSC148",
      "origin": "syllabus",
      "created_at": 1780000000000
    }
  ],
  "warnings": [],
  "persistence": "caller_managed"
}
```

### 5.2 查询

`POST /api/v1/calendars/commands`

```json
{
  "instruction": "查看 2026-09-21 的作业",
  "course_id": "course_csc148",
  "course_name": "CSC148",
  "calendar": {
    "id": "cal_...",
    "timezone": "Asia/Shanghai",
    "events": []
  }
}
```

查询直接返回 `operation: "search"` 和 `matched_events`，不需要确认。

### 5.3 新增、修改、删除：两段式确认

第一次请求不要设置 `confirm`，服务返回 proposal，calendar 保持不变：

```json
{
  "instruction": "下周三晚上添加 45 分钟链表复习",
  "course_id": "course_csc148",
  "course_name": "CSC148",
  "calendar": {
    "id": "cal_...",
    "timezone": "Asia/Shanghai",
    "events": []
  }
}
```

```json
{
  "success": true,
  "data": {
    "status": "requires_confirmation",
    "operation": "add",
    "proposal": {
      "id": "calact_...",
      "kind": "calendar.propose_add",
      "label": "...",
      "summary": "...",
      "payload": { "items": [{ "title": "链表复习", "date": "2026-07-22", "durationMinutes": 45 }] },
      "confirmation": "required"
    },
    "calendar": {}
  }
}
```

调用方展示确认 UI；用户确认后，把原 proposal 和当前 calendar 原样传回：

```json
{
  "confirm": true,
  "proposal": {
    "id": "calact_...",
    "kind": "calendar.propose_add",
    "label": "...",
    "summary": "...",
    "payload": { "items": [{ "title": "链表复习", "date": "2026-07-22", "durationMinutes": 45 }] },
    "confirmation": "required"
  },
  "calendar": {
    "id": "cal_...",
    "timezone": "Asia/Shanghai",
    "events": []
  }
}
```

执行成功后返回 `status: "completed"`、`changed_events` 和更新后的完整 `calendar`。调用方必须保存最新 calendar，并在下一条自然语言命令中再次传入。修改或删除目标不唯一时返回 HTTP `409` 和 `ambiguous_target`。

相对日期和时间按 `calendar.timezone`（IANA timezone，例如 `Asia/Shanghai`）解释；自然语言动作返回时间时保存在事件的 `start` 字段。

## 6. 其余第一批接口

### 题源路由

`POST /api/v1/question-sets`

```json
{
  "course_code": "CSC148",
  "source_case": "partial_with_notes",
  "topic": "Linked List representation invariant",
  "requested_count": 5,
  "partial_bank_size": 2,
  "notebook_content": "# Linked List\n..."
}
```

`source_case` 可为 `empty_no_notes`、`empty_with_notes`、`sufficient_bank`、`partial_no_notes`、`partial_with_notes`。返回选题、AI 补题、RAG 决策轨迹、题量/格式/来源验收和 token usage。

### 文字讲解

`POST /api/v1/explanations/text`

```json
{
  "kind": "concept",
  "topic": "递归为什么需要基线条件",
  "course_name": "CSC148",
  "language": "zh-CN",
  "source_notes": [
    { "title": "Recursion notes", "content": "...", "source_ref": "notebook:recursion" }
  ]
}
```

返回 `markdown` 和 `evidence_mode`。未传 `source_notes` 时明确按一般知识讲解。

### PPT / 迷你课堂讲解

`POST /api/v1/explanations/slides`，输入与文字讲解相似；返回 1–2 页 `pages[].image_data_url`、四角 marker、spotlight 与 speech actions。

### 证据化复习计划

`POST /api/v1/review-plans`

```json
{
  "target_type": "course",
  "target_id": "course_cuid",
  "query": "围绕链表删除制定 45 分钟复习计划并选 5 道题",
  "schedule_events": [],
  "constraints": { "total_minutes": 45, "question_count": 5, "max_tasks": 4 }
}
```

该接口按 API Key 所属用户读取目标课程/笔记本的题库、作答、问答与学习记忆，因此 `target_id` 必须属于该用户。

## 7. 重要边界

- 文件生成接口是同步 API；调用方超时建议至少设置 300 秒。
- PDF 上限沿用现有生成链路；syllabus 导入上限为 20 MB。
- Cheat Sheet 会产生文本与图片模型费用；其他 AI 接口也按 API Key 对应用户记录 usage。
- API Key 只选择 Syntara 用户归属；调用方不能通过请求头覆盖服务端模型/API Key/Base URL。
- Calendar v1 不伪造服务端持久化。它返回完整快照，由调用方保存；后续可在新增服务端 Calendar 表后升级为 resource URL 模式。
