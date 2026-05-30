# Page Inputs

Title: {{title}}
Scene Language: {{language}}
Description: {{description}}
Key Points:
{{keyPoints}}

{{teachingContext}}
{{workedExampleContext}}
{{courseContext}}
{{agents}}
{{userProfile}}

## Focus Targets / Elements

{{elements}}

## Output Task

Generate playback actions and narration for this page. Use the PagePlan and current semantic content to decide the narration; do not merely paraphrase the key points.

Requirements:

1. Output only a JSON array, with no explanatory text or markdown fence.
2. Every speech segment must be entirely in `{{language}}`; source-code names may remain as written.
3. Follow the Narration policy pacing. If no policy is provided, generate 6-10 substantive speech segments for teaching pages; complex code, proof, or derivation pages should move more slowly.
4. When a segment explains a specific visible region, set `focusTargetId` to the corresponding id from the input; omit it for transitions, overview, questions, summaries, or when the intended component is absent from Focus Targets / Elements.
5. Do not output separate spotlight or laser actions; output only speech segments, and code will compile focus effects from `focusTargetId`.
6. Start from the concrete object, problem, or state on the page, then give the thinking method; do not use detached lesson-plan phrasing about what "students should understand".

Example shape:

[{"type":"speech","focusTargetId":"text_xxx","content":"Narration text"},{"type":"speech","content":"Transition or summary narration with no focus needed"}]
