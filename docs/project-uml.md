# Syntara Project UML

This document captures the main architecture and workflows of the Syntara codebase.

The project is large, so the UML is split into multiple focused diagrams instead of one unreadable all-in-one graph.

## 1. System Component Diagram

```mermaid
flowchart TB
  User["User"]
  Browser["Browser UI\nNext.js App Router"]

  subgraph App["app/ route shells"]
    Pages["Pages\ncourse, classroom, chat, store, admin, QA"]
    ApiRoutes["API routes\n/api/*"]
  end

  subgraph Components["components/"]
    SharedUI["Shared UI primitives"]
    ChatUI["Chat UI"]
    CreateUI["Notebook creation workspace"]
    ClassroomUI["Classroom and stage UI"]
    ProblemUI["Problem bank UI"]
  end

  subgraph Features["features/ product domains"]
    ChatFeature["chat"]
    PptGeneration["ppt-generation"]
    Problems["problems"]
    Review["review"]
    Memory["memory"]
    Practice["practice"]
    Notifications["notifications"]
    Playback["ppt-playback"]
  end

  subgraph Lib["lib/ shared infrastructure"]
    Stores["Zustand stores"]
    Storage["Client/server storage helpers"]
    Generation["Generation pipeline"]
    AI["LLM/provider adapters"]
    Media["Media orchestrator"]
    Learning["Learning/memory/review logic"]
    Server["Server helpers\nPrisma, auth, repositories"]
  end

  subgraph Packages["packages/ internal packages"]
    MathML["mathml2omml"]
    PPTX["pptxgenjs"]
  end

  subgraph External["External services"]
    LLMProviders["LLM providers"]
    MediaProviders["Image/video providers"]
    SpeechProviders["TTS/ASR providers"]
    PdfProviders["PDF parsers/providers"]
    Stripe["Stripe"]
    Postgres["PostgreSQL"]
  end

  User --> Browser
  Browser --> Pages
  Pages --> Components
  Pages --> ApiRoutes
  Components --> Features
  Components --> Stores
  Features --> Generation
  Features --> Learning
  Features --> Server
  Generation --> AI
  Generation --> Media
  Media --> MediaProviders
  AI --> LLMProviders
  Server --> Postgres
  Server --> Stripe
  Storage --> ApiRoutes
  Storage --> Browser
  Generation --> MathML
  Generation --> PPTX
  ApiRoutes --> Features
  ApiRoutes --> Server
  ApiRoutes --> LLMProviders
  ApiRoutes --> SpeechProviders
  ApiRoutes --> PdfProviders
```

## 2. Next.js Route Map

```mermaid
flowchart LR
  Root["/"] --> Courses["/my-courses"]
  Root --> Store["/store"]
  Root --> Login["/login, /register"]
  Root --> Profile["/profile, /settings"]
  Root --> Chat["/chat"]

  Courses --> CourseDetail["/course/[id]"]
  CourseDetail --> CreateNotebook["/course/[id]/create-notebook"]
  CourseDetail --> CourseMemory["/course/[id]/memory"]
  CourseDetail --> ProblemBank["/course/[id]/problem-bank"]
  CourseDetail --> Milestone["/course/[id]/milestone"]

  CreateNotebook --> Classroom["/classroom/[id]"]
  Classroom --> ClassroomMemory["/classroom/[id]/memory"]

  CourseDetail --> Review["/review/[id]"]
  Review --> ReviewMap["/review/[id]/map"]

  Store --> CourseStore["/store/courses"]
  Store --> AvatarStore["/store/avatars"]
  Store --> Credits["/credits-market, /top-up"]

  Admin["/admin"] --> AdminLLM["/admin/llm"]
  QA["/(qa)/*"] --> TestCenter["generation, problem, review QA pages"]
```

## 3. Server Domain Class Diagram

```mermaid
classDiagram
  class User {
    string id
    string email
    UserRole role
    int creditsBalance
    int computeCreditsBalance
    int purchaseCreditsBalance
  }

  class Course {
    string id
    string ownerId
    string name
    CoursePurpose purpose
    bool listedInCourseStore
    int notebookCount
    int problemCount
  }

  class Notebook {
    string id
    string ownerId
    string courseId
    string name
    NotebookKind notebookKind
    int sceneCount
    int sectionCount
    int problemCount
  }

  class Scene {
    string id
    string notebookId
    string title
    string type
    int order
    Json content
    Json actions
  }

  class NotebookPage {
    string id
    string notebookId
    string courseId
    string title
    string type
    int order
  }

  class NotebookPageContent {
    string pageId
    Json content
    Json whiteboard
  }

  class NotebookPageActions {
    string pageId
    Json actions
    string speechStatus
  }

  class Asset {
    string id
    string path
    string mimeType
    int sizeBytes
    string sha256
  }

  class NotebookProblem {
    string id
    string courseId
    string notebookId
    string title
    NotebookProblemType type
    NotebookProblemStatus status
    Json publicContentJson
    Json gradingJson
  }

  class NotebookProblemAttempt {
    string id
    string problemId
    string userId
    NotebookProblemAttemptKind kind
    NotebookProblemAttemptStatus status
    float score
  }

  class Conversation {
    string id
    string ownerId
    string courseId
    string notebookId
    ConversationKind kind
    string targetId
  }

  class Message {
    string id
    string conversationId
    string ownerId
    string role
    Json content
  }

  class AgentTask {
    string id
    string ownerId
    string courseId
    string notebookId
    AgentTaskStatus status
    Json request
    Json result
  }

  class AgentEnvelope {
    string id
    string taskId
    AgentEnvelopeType envelopeType
    Json payload
  }

  class StudyMemory {
    string id
    string ownerId
    string courseId
    string notebookId
    string scope
    string title
    string text
  }

  class CreditTransaction {
    string id
    string userId
    CreditTransactionKind kind
    CreditAccountType accountType
    int delta
    int balanceAfter
  }

  class TopUpOrder {
    string id
    string userId
    string stripeCheckoutSessionId
    TopUpOrderStatus status
  }

  User "1" --> "*" Course : owns
  User "1" --> "*" Notebook : owns
  Course "1" --> "*" Notebook : contains
  Notebook "1" --> "*" Scene : legacy pages
  Notebook "1" --> "*" NotebookPage : content v2 pages
  NotebookPage "1" --> "0..1" NotebookPageContent : content
  NotebookPage "1" --> "0..1" NotebookPageActions : actions
  NotebookPage "*" --> "*" Asset : page assets
  Course "1" --> "*" NotebookProblem : course problems
  Notebook "1" --> "*" NotebookProblem : notebook problems
  NotebookProblem "1" --> "*" NotebookProblemAttempt : attempts
  User "1" --> "*" NotebookProblemAttempt : submits
  User "1" --> "*" Conversation : owns
  Course "1" --> "*" Conversation : context
  Notebook "1" --> "*" Conversation : context
  Conversation "1" --> "*" Message : messages
  User "1" --> "*" AgentTask : owns
  AgentTask "1" --> "*" AgentEnvelope : envelopes
  User "1" --> "*" StudyMemory : remembers
  Course "1" --> "*" StudyMemory : scoped memory
  Notebook "1" --> "*" StudyMemory : scoped memory
  User "1" --> "*" CreditTransaction : ledger
  User "1" --> "*" TopUpOrder : purchases
```

## 4. Client Data Model Diagram

```mermaid
classDiagram
  class CourseRecord {
    string id
    string name
    string language
    string[] tags
    CoursePurpose purpose
    string accessRole
  }

  class Stage {
    string id
    string courseId
    string name
    NotebookKind notebookKind
    string language
    string style
  }

  class Scene {
    string id
    string stageId
    SceneType type
    string title
    int order
    SceneContent content
    Action[] actions
  }

  class SceneOutline {
    string id
    string type
    string title
    string description
    string[] keyPoints
    int order
  }

  class ChatSession {
    string id
    SessionType type
    SessionStatus status
    UIMessage[] messages
  }

  class ContactConversationRecord {
    string id
    string courseId
    string kind
    string targetId
    unknown[] messages
  }

  class AgentTaskRecord {
    string id
    string courseId
    string notebookId
    string contactKind
    string status
  }

  class MediaTask {
    string elementId
    string stageId
    string type
    MediaTaskStatus status
    string prompt
  }

  CourseRecord "1" --> "*" Stage : contains
  Stage "1" --> "*" Scene : renders
  Stage "1" --> "*" SceneOutline : pending/generated plan
  Stage "1" --> "*" ChatSession : classroom chat
  CourseRecord "1" --> "*" ContactConversationRecord : course chat
  CourseRecord "1" --> "*" AgentTaskRecord : agent work
  Stage "1" --> "*" MediaTask : media generation
```

Note: client `Stage` is the historical frontend name for a notebook/classroom. On the server, the matching domain entity is `Notebook`.

## 5. Notebook Generation Sequence

```mermaid
sequenceDiagram
  actor User
  participant CreatePage as "CreateNotebookWorkspace"
  participant Controller as "useCreateNotebookWorkspaceController"
  participant Task as "runNotebookGenerationTask"
  participant PlanApi as "/api/generate/image-notebook-plan-stream"
  participant MetadataApi as "/api/generate/notebook-metadata"
  participant OutlineApi as "/api/generate/notebook-outlines"
  participant ContentApi as "/api/generate/scene-content"
  participant ActionsApi as "/api/generate/scene-actions"
  participant NotebookApi as "/api/notebooks"
  participant Storage as "stage-storage"
  participant Classroom as "/classroom/[id]"

  User->>CreatePage: Enter requirement and optional source file
  CreatePage->>Controller: Update form, style, outline options
  User->>CreatePage: Start generation
  CreatePage->>Controller: handleGenerate()

  alt Image-first planning path
    Controller->>PlanApi: Stream image notebook plan
    PlanApi-->>Controller: Planning events, page briefs, outlines
    User->>CreatePage: Confirm or edit outline rows
  end

  Controller->>Task: runNotebookGenerationTask(input)
  Task->>MetadataApi: Generate notebook metadata
  MetadataApi-->>Task: Name, description, tags, avatar hints

  opt Standard outline path
    Task->>OutlineApi: Generate scene outlines
    OutlineApi-->>Task: SceneOutline[]
  end

  Task->>NotebookApi: Create or upsert notebook shell
  NotebookApi-->>Task: Notebook id

  loop For each outline/page
    Task->>ContentApi: Generate scene content
    ContentApi-->>Task: Scene content bundle
    Task->>ActionsApi: Generate lecture/actions
    ActionsApi-->>Task: Action list
  end

  Task->>Storage: saveStageData(stage, scenes)
  Storage->>NotebookApi: Persist notebook and scenes
  NotebookApi-->>Storage: Saved records
  Task-->>Controller: Completed notebook id
  Controller->>Classroom: Navigate to classroom
```

## 6. Scene Content Generation Sequence

```mermaid
sequenceDiagram
  participant Client as "Generation client"
  participant Route as "/api/generate/scene-content"
  participant Resolver as "resolveModelFromHeadersForNotebookStage"
  participant Pipeline as "generateSceneContent"
  participant LLM as "callLLM"
  participant Context as "runWithRequestContext"
  participant Credits as "usage/credits accounting"

  Client->>Route: POST outline, allOutlines, stageInfo, media context
  Route->>Route: Validate required fields
  Route->>Route: Normalize slide generation route
  Route->>Route: Normalize outline language and CS structure
  Route->>Resolver: Resolve content-stage model
  Resolver-->>Route: language model, model info
  Route->>Context: Run request with usage context
  Context->>LLM: Prompt or vision prompt
  LLM-->>Context: Text and token usage
  Context-->>Route: LLM result
  Route->>Pipeline: Parse, repair, fallback, flatten content
  Pipeline-->>Route: Generated scene content
  Route->>Credits: Estimate/record token cost
  Route-->>Client: Scene content response
```

## 7. Chat And Agent Orchestration Sequence

```mermaid
sequenceDiagram
  actor User
  participant ChatPage as "/chat ChatPageClient"
  participant LocalChat as "contact-chat-storage"
  participant TaskStorage as "agent-task-storage"
  participant ChatApi as "/api/chat"
  participant Resolver as "resolveModel"
  participant Orchestrator as "statelessGenerate"
  participant LLM as "LLM provider"

  User->>ChatPage: Select notebook, agent, or group
  ChatPage->>LocalChat: Load contact messages
  LocalChat-->>ChatPage: Hydrated thread
  ChatPage->>TaskStorage: Poll active task hints
  TaskStorage-->>ChatPage: Running/waiting tasks

  User->>ChatPage: Send message
  ChatPage->>ChatApi: POST messages, storeState, config
  ChatApi->>Resolver: Resolve model/provider
  Resolver-->>ChatApi: language model
  ChatApi->>Orchestrator: Start stateless generation
  Orchestrator->>LLM: Generate next events
  LLM-->>Orchestrator: Streaming text/tool events

  loop SSE events
    Orchestrator-->>ChatApi: StatelessEvent
    ChatApi-->>ChatPage: text/event-stream event
    ChatPage->>LocalChat: Persist updated messages
  end

  ChatPage-->>User: Render streamed reply and actions
```

## 8. Course And Notebook Persistence Sequence

```mermaid
sequenceDiagram
  participant UI as "Client UI"
  participant CourseStorage as "course-storage"
  participant StageStorage as "stage-storage"
  participant CourseApi as "/api/courses"
  participant NotebookApi as "/api/notebooks"
  participant Repos as "server repositories"
  participant Prisma as "Prisma Client"
  database DB as "PostgreSQL"

  UI->>CourseStorage: listCourses/getCourse/createCourse
  CourseStorage->>CourseApi: backendJson request
  CourseApi->>Repos: list/create/update course
  Repos->>Prisma: Query Course relations
  Prisma->>DB: SQL
  DB-->>Prisma: Rows
  Prisma-->>Repos: Models
  Repos-->>CourseApi: Domain rows
  CourseApi-->>CourseStorage: JSON
  CourseStorage-->>UI: CourseRecord[]

  UI->>StageStorage: listStagesByCourse/loadStageData/saveStageData
  StageStorage->>NotebookApi: backendJson request
  NotebookApi->>Repos: list/create/update notebook and scenes
  Repos->>Prisma: Query Notebook, Scene, Page records
  Prisma->>DB: SQL
  DB-->>Prisma: Rows
  Prisma-->>Repos: Models
  Repos-->>NotebookApi: Domain rows
  NotebookApi-->>StageStorage: JSON
  StageStorage-->>UI: Stage and Scene data
```

## 9. Zustand State Diagram

```mermaid
stateDiagram-v2
  [*] --> AppLoaded

  AppLoaded --> CourseSelected: useCurrentCourseStore.setCurrentCourse
  CourseSelected --> NotebookLoading: open /classroom/[id]
  NotebookLoading --> StageReady: useStageStore.loadFromStorage
  StageReady --> SceneSelected: setCurrentSceneId
  SceneSelected --> EditingDraft: update scene/canvas
  EditingDraft --> StageReady: draft snapshot queued

  CourseSelected --> NotebookGenerating: runQueuedAiTask(course-generation)
  NotebookGenerating --> Planning: generate outlines
  Planning --> PageGenerating: generate content/actions
  PageGenerating --> Saving: saveStageData
  Saving --> StageReady: notebook saved

  StageReady --> MediaPending: useMediaGenerationStore.enqueueTasks
  MediaPending --> MediaGenerating: markGenerating
  MediaGenerating --> MediaReady: markDone
  MediaGenerating --> MediaFailed: markFailed
  MediaFailed --> MediaPending: retry

  AppLoaded --> SettingsHydrated: useSettingsStore persisted state
  SettingsHydrated --> ProviderConfigured: model/provider changes

  AppLoaded --> ChatIdle
  ChatIdle --> ChatStreaming: /api/chat SSE
  ChatStreaming --> ChatIdle: stream done
```

## 10. Store Responsibility Diagram

```mermaid
flowchart TB
  UI["React UI"]

  CurrentCourse["useCurrentCourseStore\ncurrent course context"]
  StageStore["useStageStore\nstage/notebook, scenes, outlines, playback selection"]
  SettingsStore["useSettingsStore\nLLM/media/PDF/TTS/ASR/web-search settings"]
  MediaStore["useMediaGenerationStore\nper-element media task state"]
  AiTaskQueue["useAiTaskQueueStore\nlocal concurrent AI task runner"]
  OrchestratorGen["useOrchestratorNotebookGenStore\ncourse orchestrator notebook options"]
  Notifications["useNotificationStore\nbanners and notification UI"]
  UserProfile["useUserProfileStore\nnickname/avatar/profile UI state"]

  UI --> CurrentCourse
  UI --> StageStore
  UI --> SettingsStore
  UI --> MediaStore
  UI --> AiTaskQueue
  UI --> OrchestratorGen
  UI --> Notifications
  UI --> UserProfile

  OrchestratorGen --> AiTaskQueue
  AiTaskQueue --> StageStore
  StageStore --> MediaStore
  SettingsStore --> OrchestratorGen
  SettingsStore --> MediaStore
  CurrentCourse --> StageStore
  CurrentCourse --> Notifications
```

## 11. Problem Bank And Review Flow

```mermaid
flowchart LR
  CoursePage["Course detail"] --> ProblemBankPage["Problem bank page"]
  ProblemBankPage --> ImportPreview["/api/courses/[id]/problems/import-preview"]
  ImportPreview --> ProblemImport["features/problems/server/import"]
  ProblemImport --> ProblemDrafts["Problem drafts"]
  ProblemDrafts --> ImportCommit["/api/courses/[id]/problems/import-commit"]
  ImportCommit --> ProblemsRepo["Problem service/repository"]
  ProblemsRepo --> NotebookProblem["NotebookProblem"]

  ProblemBankPage --> ManualEdit["Manual create/edit"]
  ManualEdit --> ProblemsRepo

  NotebookProblem --> ReviewAssess["/api/review-route/assess-problem-bank"]
  ReviewAssess --> ReviewGenerate["/api/review-route/generate"]
  ReviewGenerate --> ReviewRoute["Review route"]
  ReviewRoute --> ReviewPage["/review/[id]"]
  ReviewPage --> Attempt["Problem attempt"]
  Attempt --> Grade["features/problems/server/evaluate/judge"]
  Grade --> Progress["NotebookProblemProgress"]
```

## 12. Gamification And Credits Flow

```mermaid
flowchart TB
  UserAction["Learning action\nlesson, quiz, review, sign-in"] --> GamificationApi["/api/gamification/events"]
  GamificationApi --> ActionLog["LearningActionLog"]
  GamificationApi --> Engagement["UserEngagementProfile"]
  GamificationApi --> Mission["UserMissionProgress"]
  GamificationApi --> Rewards["CreditTransaction"]

  Store["Course/avatar/store pages"] --> Spend["Unlock, gacha, purchase"]
  Spend --> CreditLedger["credit-ledger-repository"]
  CreditLedger --> CreditTransaction["CreditTransaction"]
  CreditLedger --> UserBalance["User credit balances"]

  TopUp["/top-up"] --> Checkout["/api/top-up/checkout-session"]
  Checkout --> Stripe["Stripe checkout"]
  Stripe --> Webhook["/api/top-up/webhooks/stripe"]
  Webhook --> TopUpOrder["TopUpOrder"]
  Webhook --> CreditLedger

  Rewards --> UserBalance
  CreditTransaction --> UserBalance
```

## 13. Deployment And Provider Diagram

```mermaid
flowchart TB
  Browser["Browser"]
  NextApp["Next.js 16 app"]
  Api["Route handlers /api/*"]
  Prisma["Prisma Client"]
  DB[("PostgreSQL")]

  subgraph ClientStorage["Browser storage"]
    LocalStorage["localStorage\nsettings, current course"]
    SessionStorage["sessionStorage\ngeneration session"]
    IndexedDB["IndexedDB helpers\nsource blobs, legacy/local assets"]
    ObjectUrls["Object URLs\nmedia previews"]
  end

  subgraph Providers["External providers"]
    OpenAI["OpenAI-compatible LLM"]
    Anthropic["Anthropic"]
    Google["Google"]
    ImageProvider["Image generation"]
    VideoProvider["Video generation"]
    TTS["TTS"]
    ASR["ASR/transcription"]
    PDF["PDF parsing"]
    WebSearch["Web search"]
    Stripe["Stripe"]
  end

  Browser --> NextApp
  Browser --> LocalStorage
  Browser --> SessionStorage
  Browser --> IndexedDB
  Browser --> ObjectUrls
  NextApp --> Api
  Api --> Prisma
  Prisma --> DB
  Api --> OpenAI
  Api --> Anthropic
  Api --> Google
  Api --> ImageProvider
  Api --> VideoProvider
  Api --> TTS
  Api --> ASR
  Api --> PDF
  Api --> WebSearch
  Api --> Stripe
```

