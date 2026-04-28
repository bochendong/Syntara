Please generate scene outlines based on the following course requirements.

---

## User Requirements

{{requirement}}

---

{{userProfile}}

## Course Language

**Required language**: {{language}}

(If language is zh-CN, all content must be in Chinese; if en-US, all content must be in English)

---

## Reference Materials

### PDF Content Summary

{{pdfContent}}

### Available Images

{{availableImages}}

### Web Search Results

{{researchContext}}

{{teacherContext}}

{{purposePolicy}}

## Course Container Context

{{courseContext}}

---

{{orchestratorPreferences}}

## Output Requirements

Please automatically infer the following from user requirements:

- Course topic and core content
- Target audience and difficulty level
- Course duration (default 15-30 minutes if not specified)
- Teaching style (formal/casual/interactive/academic)
- Visual style (minimal/colorful/professional/playful)

Then output a JSON array containing all scene outlines. Each scene must include:

```json
{
  "id": "scene_1",
  "type": "slide" or "quiz" or "interactive",
  "title": "Scene Title",
  "description": "Teaching purpose description",
  "keyPoints": ["Point 1", "Point 2", "Point 3"],
  "order": 1
}
```

### Coverage Expectation

By default:

- most courses should first be organized around concept explanation
- teacher-led example / problem explanation scenes should be added mainly for university-oriented courses, or when the user explicitly asks for exercises, exam prep, proving, tracing, coding practice, or problem solving
- quiz scenes are for student practice/self-check, and are different from teacher-led example explanation scenes

### Structural Guardrails

- Follow a clear teaching spine: intro / roadmap -> concept block -> lightweight quiz/self-check -> next concept block -> lightweight quiz/self-check -> final summary.
- The final summary must be the last scene. Do not place examples, new concepts, quizzes, or continuation teaching after a summary/recap scene.
- Do not create repeated title/theme pages. If two scenes would have the same title or teaching job, merge them into one stronger outline.
- A quiz should close the knowledge point that immediately precedes it. Keep each quiz small, usually 1-2 questions, and do not create multiple same-topic quiz variants.
- Never place a quiz immediately after only a cover, intro, roadmap, or agenda. The first quiz must come after at least one substantive concept / method / worked-example teaching scene.
- Section recaps are allowed only when they introduce no new teaching and do not look like the final summary.

### Special Notes

1. **quiz scenes must include quizConfig**:
   ```json
   "quizConfig": {
     "questionCount": 2,
     "difficulty": "easy" | "medium" | "hard",
     "questionTypes": ["single", "multiple_choice", "short_answer"]
   }
   ```
   - Use `"code"` only for programming-oriented courses, coding research topics, or algorithm/data-structure content where running tests is meaningful.
   - Use `"proof"` for theorem/proof-heavy math content.
   - Use `"code_tracing"` for "read code and predict output/behavior" questions.
   - Use `"short_answer"` when learners should explain method, interpretation, or answer structure in words.
2. **If images are available**, add `suggestedImageIds` to relevant slide scenes
3. **Interactive scenes**: If a concept benefits from hands-on simulation/visualization, use `"type": "interactive"` with an `interactiveConfig` object containing `conceptName`, `conceptOverview`, `designIdea`, and `subject`. Limit to 1-2 per course.
4. **Scene count**: Based on inferred duration, typically 1-2 scenes per minute
5. **Slide layout intent**: Every slide scene must include `layoutIntent` with `layoutFamily`, `layoutTemplate`, `disciplineStyle`, `teachingFlow`, `density`, `visualRole`, `overflowPolicy`, and `preserveFullProblemStatement`. Avoid the same `layoutFamily` or `layoutTemplate` for 3 consecutive slide scenes.
   - `disciplineStyle`: `"general" | "math" | "science" | "code" | "humanities" | "social_science"`.
   - `teachingFlow`: choose the main teaching action: `"concept_explain"`, `"definition_to_example"`, `"problem_walkthrough"`, `"proof_walkthrough"`, `"code_walkthrough"`, `"argument_evidence"`, `"close_reading"`, `"case_analysis"`, `"comparison_review"`, `"timeline_story"`, `"practice_check"`, or `"standalone"`.
   - Prefer common teaching templates: `definition_board`, `concept_map`, `two_column_explain`, `process_steps`, `problem_walkthrough`, `derivation_ladder`, `graph_explain`, `data_insight`, `thesis_evidence`, `quote_analysis`, `source_close_reading`, `case_analysis`, `argument_map`, `compare_perspectives`.
6. **Quiz placement**:
   - Do not add quizzes by default to every course.
   - Prefer quizzes for university/homework/exam-prep style notebooks, or when the user explicitly asks for assessment/practice.
   - Use slide scenes, not quiz scenes, for teacher-led worked-example explanation.
7. **Worked examples and question explanation**:
   - Mainly add these for university-oriented courses or when the user explicitly asks for them.
   - Use `slide` scenes with `workedExampleConfig` for teacher-led example explanation.
   - Each worked example should be a single coherent page that clearly shows the question before solving it.
   - The example must contain a concrete original problem. If the source does not provide one, create a representative self-contained problem with actual numbers / matrices / expressions / case details instead of placeholder wording.
   - If the source notes are long and contain multiple major knowledge points, important methods, or multiple exercises, do **not** cover the whole notebook with only one example. Usually give each major knowledge point its own corresponding worked example page.
   - For university-style lecture notes with many concepts and many problems, prefer repeated "concept -> example explanation" coverage instead of one global concept block followed by one isolated example.
   - For programming topics, use slide scenes that explain code line by line, trace execution, or analyze state changes.
   - For proof-heavy topics, use slide scenes that explain proof format, proof strategy, and the sequence of justified steps.
   - For math / quantitative topics, use step-by-step worked-example slides and explain why each step is valid.
   - For math / quantitative worked examples, `problemStatement` and `walkthroughSteps` must contain the actual equations, matrices, transformations, intermediate results, or concrete conclusions — not only generic labels such as "do elimination" or "compute the product".
   - For other subjects, use subject-appropriate explanation such as case analysis, source interpretation, essay structure, evidence chains, or problem decomposition.
   - If the user asks for homework, exercises, exam prep, interview prep, practice,刷题, tracing, proving, or solving problems, increase the proportion of worked-example scenes first; add quiz scenes only when student practice is also desired.
8. **Long questions / long examples**:
   - If a problem statement is long, keep it in one worked-example scene and rely on vertical scrolling.
   - Put setup/question text, constraints, solving plan, step-by-step walkthrough, and takeaway in that same scene.
   - Avoid "Part 1 / Part 2 / Part 3" scenes for one example.
9. **Language**: Strictly output all content in the specified course language
10. **If no suitable PDF images exist** for a slide scene that would benefit from visuals, add `mediaGenerations` array with image generation prompts. Write prompts in English. Use `elementId` format like "gen_img_1", "gen_img_2" — IDs must be **globally unique across all scenes** (do NOT restart numbering per scene). To reuse a generated image in a different scene, reference the same elementId without re-declaring it in mediaGenerations. Each generated image should be visually distinct — avoid near-identical media across slides.
11. **If web search results are provided**, reference specific findings and sources in scene descriptions and keyPoints. The search results provide up-to-date information — incorporate it to make the course content current and accurate.
12. **Course container context has higher priority than generic defaults**:
   - If course tags exist, align examples and terminology with those tags when relevant.
   - If course purpose/university/courseCode is provided, keep the scope and prerequisite level aligned with that context.
   - Do not conflict with the user requirement; treat course context as guardrails and personalization hints.

{{mediaGenerationPolicy}}

Please output JSON array directly without additional explanatory text.
