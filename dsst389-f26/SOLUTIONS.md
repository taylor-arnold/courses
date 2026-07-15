# Generating Homework Solutions

This file tells an agent how to write a solution guide for a single DSST289
homework and append it to the bottom of that homework's page. Work on **one
homework at a time**: the prompt will name a homework (for example "hw09" or
`hw/hw09.html`), and you produce the solutions for that homework only.

## Inputs and resources

- **The homework itself.** The homeworks live in `hw/hw01.html` through
  `hw/hw21.html`. Each is a plain HTML page with a `<div class="container">`
  holding an `<h1>Homework NN</h1>`, a back link, one or more intro `<p>`
  paragraphs, and an `<ol>` of numbered questions. Read the whole page so you
  understand any datasets or scenarios described in the intro.

- **The course notes.** The readings are the source of truth for method names,
  conventions, and terminology. They are local `.qmd` files in `~/gh/fds2`
  (`01_intro.qmd`, `02_organize.qmd`, `03_types.qmd`, …). The homework pages
  and the index link to `https://taylor-arnold.github.io/fds2/...`; ignore the
  URLs and read the matching local `.qmd` instead (e.g.
  `04_graphics.html` → `~/gh/fds2/04_graphics.qmd`). To find which chapter a
  homework covers, look up the homework in this course's `index.html`, which
  pairs each homework with its reading. Always confirm method names, argument
  names, and style against the notes rather than relying on memory — this
  course uses a specific Polars/plotnine dialect (see below).

- **The exam study guides** in `exam/exam01.html`, `exam/exam02.html`, and
  `exam/exam03.html`. These already contain worked solutions. **Match their
  format exactly** — they are the template for how a solution block should
  look. Read one before you start.

- **The `ta-humanizer` skill.** Run every piece of prose you write through it
  before finalizing (see "Humanize the prose" below).

## What to produce

Append a single solutions section to the **bottom** of the homework page,
inside the existing `<div class="container">`, just before its closing `</div>`
(which sits above the `<script>` tag). Do **not** scatter answers next to each
question; group them all together at the end, the way the exam guides put the
practice answers after the question list.

Structure the block like the exam guides:

```html
    <h3>Solutions</h3>
    <p>1. Restate the question briefly (a short paraphrase, not a copy).</p>
<pre>
(
    dataset
    .method(...)
)</pre>

    <p>2. Next question...</p>
<pre>
...answer...</pre>
```

Notes on the format:

- Number the answers to match the `<ol>` in the question list (1, 2, 3, …).
- Put a one-line restatement of the task in a `<p>`, then the answer in a
  `<pre>` block, exactly as `exam01.html` does.
- Code goes in `<pre>` blocks. Prose answers (for conceptual or open-ended
  questions) also go in `<pre>` blocks when they are the whole answer, matching
  the style of question 11 in `exam01.html`; short framing sentences can sit in
  a `<p>`. Use your judgment, but keep it consistent with the exam guides.
- Remember to HTML-escape inside `<pre>`: `&amp;` for `&`, `&lt;`/`&gt;` for
  `<`/`>`, `&quot;` where needed. The exam guides do this (e.g.
  `(c.mpa == "R") &amp; (c.runtime > 120)`).
- Do not touch anything else on the page (head, back link, question list).

## Code conventions

Follow the exact dialect used in the notes and exam guides. **Do not run any
code** — you are writing a reference solution, not executing it.

- Assume the standard setup is already loaded:

  ```python
  import polars as pl
  from plotnine import ggplot, aes
  from polars import col as c
  import funs
  ```

- Use **Polars**, never pandas. Reference columns with the `c.` prefix
  (`c.calories`, `c.food_group`).
- Method-chain style: wrap the whole pipeline in parentheses on their own
  lines, start with the DataFrame, and put each method on its own line indented
  four spaces:

  ```
  (
      food
      .filter(c.calories > 100)
      .sort(c.calories, descending=True)
      .head(n=5)
  )
  ```

- For plots, use the notes' plotnine style, which pipes into `ggplot` and adds
  geometries as chained methods (not `ggplot(...) + geom_point()`):

  ```
  (
      students
      .pipe(ggplot, aes(c.study_hours, c.gpa))
      .geom_point(aes(color=c.major))
  )
  ```

  Fixed aesthetics go outside `aes()` but inside the `geom_*` call
  (`.geom_point(color="#F5276C")`); variable aesthetics go inside `aes()`.
- Prefer the smallest correct chain. The exam guides note most tasks need at
  most three methods; keep solutions tight and idiomatic rather than clever.
- Use the datasets and column names given in that homework's own intro
  paragraph. Many homeworks invent a scenario (e.g. `students`, `semesters`,
  `majors`) — use those names as written.

## Handling different kinds of questions

Not every question has one fixed code answer. Decide which case applies and
label it plainly:

- **Single correct answer (code):** give the code block, following the
  conventions above. Optionally add one sentence of explanation if the point of
  the question is subtle.

- **A few valid answers:** say so briefly ("Several answers work here; one good
  one is…"), then give the single best answer you can, with a short note on why
  it is a good choice. Do not dump every possibility.

- **Open-ended, no fixed answer** (personal examples, "draw a mock-up",
  "describe in your own words", design/reflection prompts — common in the more
  conceptual homeworks): say explicitly that there is no single correct answer.
  Then give concrete advice on what a strong response needs to include and the
  things a student should double-check they actually did. Where it helps,
  sketch an illustrative example answer and mark it as one possible example, not
  the answer.

When a question mixes a conceptual part and a code part, answer both parts in
order within that numbered item.

## Humanize the prose

Any prose you write (restatements, explanations, advice for open-ended
questions) should read as if a person wrote it. Before finalizing the block,
run your prose through the **`ta-humanizer`** skill and apply its fixes. Keep
sentences plain and direct, matching the voice of the notes and exam guides.
Code blocks are exempt — humanize only the natural-language text.

## Checklist before finishing

- [ ] Read the full homework page and its matching reading in `~/gh/fds2`.
- [ ] Every numbered question is answered, in order.
- [ ] Code matches the Polars/plotnine dialect in the notes; method and
      argument names verified against the `.qmd`, not guessed.
- [ ] Open-ended and multi-answer questions are labeled as such and handled per
      the rules above.
- [ ] All answers are grouped in one section under `<h3>Solutions</h3>` at the
      bottom of the container div, formatted like the exam guides.
- [ ] Special characters inside `<pre>` are HTML-escaped.
- [ ] Prose has been run through `ta-humanizer`.
- [ ] No code was executed; nothing else on the page was changed.
