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
3. Generate 3-6 substantive speech segments; pair each with a relevant spotlight when possible.
4. When focusing semantic content, use the corresponding semantic block id from the input.
5. Start from the concrete object, problem, or state on the page, then give the thinking method.

Example shape:

[{"type":"action","name":"spotlight","params":{"elementId":"text_xxx"}},{"type":"text","content":"Narration text"}]
