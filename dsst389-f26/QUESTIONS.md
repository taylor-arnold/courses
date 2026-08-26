# Generating Poll Questions

This file tells an agent how to write multiple-choice poll questions and append
them to `poll/questions.json`. These are the live in-class questions the
instructor selects from the poll dropdown; each one tests understanding of a
specific idea from the course notes. Questions are organized by **homework**: the
code on each question is its homework number, and each homework has an assigned
reading (a chapter and a range of sections). The prompt may name a homework
explicitly, or ask for "the sample questions," in which case you pick the next
homework automatically (see "Generating the sample questions" below).

## Inputs and resources

- **The question file**, `poll/questions.json`. This is a JSON array of question
  objects. Read the whole file first: you need the existing entries to match
  their format and to continue the per-homework numbering (see "Numbering"
  below). Preserve the file's existing indentation (two spaces).

- **The course notes.** The readings are the source of truth for every concept,
  method name, and piece of terminology a question tests. They are local `.qmd`
  files in `~/gh/fds2`, one per chapter. DSST389 covers the second half of the
  book, chapters 11 through 17:

  | Chapter | File |
  |---------|------|
  | 11 | `~/gh/fds2/11_spatial_data.qmd` |
  | 12 | `~/gh/fds2/12_apis.qmd` |
  | 13 | `~/gh/fds2/13_temporal_data.qmd` |
  | 14 | `~/gh/fds2/14_text_annotations.qmd` |
  | 15 | `~/gh/fds2/15_text_vectors.qmd` |
  | 16 | `~/gh/fds2/16_network_data.qmd` |
  | 17 | `~/gh/fds2/17_image_data.qmd` |

  Read the relevant chapter (or the specific sections the prompt names) in full
  before writing. Base each question on something actually stated in the notes;
  do not invent conventions or method names from memory. This course uses a
  specific Polars/plotnine dialect (see "Code conventions" below).

- **The homework readings.** Each homework is assigned one chapter and a specific
  range of sections. Draw questions only from the sections that homework covers,
  not the whole chapter. The authoritative source is the schedule table in
  `index.html` (the "Reading" and "Homework" columns); the mapping below is a
  snapshot of it. If a homework here disagrees with `index.html`, trust
  `index.html` and update this table.

  | Homework | Chapter file | Sections |
  |----------|--------------|----------|
  | 31 | `11_spatial_data.qmd` | 11.1–11.5 |
  | 32 | `11_spatial_data.qmd` | 11.6–11.8 |
  | 33 | `11_spatial_data.qmd` | 11.9–11.10 |
  | 34 | `11_spatial_data.qmd` | 11.11–11.15 |
  | 35 | `12_apis.qmd` | 12.1–12.9 |
  | 36 | `12_apis.qmd` | 12.10–12.17 |
  | 37 | `13_temporal_data.qmd` | 13.1–13.6 |
  | 38 | `13_temporal_data.qmd` | 13.7–13.12 |
  | 39 | `14_text_annotations.qmd` | 14.1–14.4 |
  | 40 | `14_text_annotations.qmd` | 14.5–14.10 |
  | 41 | `15_text_vectors.qmd` | 15.1–15.3 |
  | 42 | `15_text_vectors.qmd` | 15.4–15.5 |
  | 43 | `15_text_vectors.qmd` | 15.6–15.7 |
  | 44 | *(project workshop — no reading)* | — |
  | 45 | `16_network_data.qmd` | 16.1–16.5 |
  | 46 | `16_network_data.qmd` | 16.6–16.10 |
  | 47 | `17_image_data.qmd` | 17.1–17.6 |
  | 48 | `17_image_data.qmd` | 17.7–17.9 |
  | 49 | *(project workshop — no reading)* | — |

  Homeworks 44 and 49 are project workshops with no reading; they get no poll
  questions. Skip them.

- **The `ta-humanizer` skill.** Run the prose you write — question stems and
  option text — through it before finalizing (see "Humanize the prose").

## What to produce

Append the new question objects to the **end** of the JSON array in
`poll/questions.json`, keeping it valid JSON. Do not modify or reorder the
existing entries. Each question object has this shape:

```json
{
  "id": "q33-12",
  "question": "Q33.12: What does c.name.str.len_chars() return for each row?",
  "options": [
    { "letter": "A", "text": "The number of characters in the string." },
    { "letter": "B", "text": "The string converted to uppercase." },
    { "letter": "C", "text": "The number of words in the string." },
    { "letter": "D", "text": "A syntax error, because len must be a function call." }
  ],
  "correct": "A"
}
```

Field by field:

- **`question`** — the prompt shown to students. It **must** start with the
  question code: the letter `Q`, the two-digit zero-padded **homework number**, a
  period, and the two-digit zero-padded question number, then `: ` and the
  question text. So question 12 for homework 33 starts with `Q33.12: `; question 4
  for homework 41 starts with `Q41.04: `. The code is what lets the instructor
  find questions in order from the dropdown. The leading number is the homework
  number, **not** the chapter number. Homeworks and chapters do not line up in
  this course: homework 31 already reads chapter 11, and several homeworks share a
  chapter (homeworks 31–34 all read chapter 11, homeworks 41–43 all read chapter
  15, and so on). Always use the homework number in the code, and consult the
  mapping in "Homework readings" to know which sections to read.
- **`options`** — **exactly four** options, lettered `A`, `B`, `C`, `D` in that
  order. Each is an object with a `letter` and a `text`.
- **`correct`** — the `letter` of the single correct option (`"A"`, `"B"`,
  `"C"`, or `"D"`). Every question has exactly one correct answer.
- **`id`** — a short unique slug. Use the lowercased code with a hyphen:
  `Q33.12` → `"q33-12"`. Confirm the id does not already appear in the file.

## Generating the sample questions

When the prompt says "generate the sample questions" (or similar) without naming
a homework, produce the standard batch of **five** questions for the **next
homework that has no questions yet**:

1. Read `poll/questions.json` and find the highest homework number that already
   has questions. The next homework is the target. Skip any homework with no
   reading (44 and 49) — go to the following one.
2. Look up that homework in the "Homework readings" table to get its chapter file
   and section range, and read those sections in full.
3. Write five questions on that reading, graded by difficulty:
   - **four moderate** — apply an idea, read a short piece of code, or tell two
     similar things apart. These are the workhorse questions; a student who did
     the reading can answer them with a little thought.
   - **one more challenging** — the hardest of the set. It should be a genuine
     step up (combine two ideas, reason about why an approach works), but still
     fair and answerable from the reading, not a trick question.

   Favor **concepts over code**: test what a method *does*, why an approach
   works, or how two ideas differ, rather than exact syntax. A little code in a
   stem or option is fine, but lead with understanding, not recall of syntax.
4. Follow every other rule in this file: consecutive numbering from `01`, the
   `QNN.MM` code and matching `id`, four options A–D with one defensible answer
   (make it option `A`, with `"correct": "A"`), plausible distractors, and a
   pass through `ta-humanizer`.

If the prompt instead names a specific homework, or asks for a different count or
difficulty mix, follow the prompt; this section is only the default.

## Numbering

Question numbers run **per homework** and never repeat within a homework. The
leading two-digit number in the code is the homework number, not the chapter
number (see the `question` field above). Before adding questions for a homework,
scan `questions.json` for existing `QNN.` codes with that homework number and
continue from the highest one. If homework 33 already has `Q33.01` through
`Q33.11`, your first new homework-33 question is `Q33.12`. If a homework has no
questions yet, start at `01`.

When the prompt asks for several questions for one homework, number them
consecutively. When it spans multiple homeworks, number each homework's
questions independently against that homework's existing codes.

Note: some older entries may predate this scheme and lack a `QNN.MM` prefix or a
`correct` field. Leave them as they are; just don't collide with any codes they
do use.

## Writing good questions

Each question tests one idea from the notes. Aim for the level of the existing
questions: they probe genuine understanding (what an expression *is*, what a
method *returns*, why an approach works), not trivia or memorized syntax.

- **One clearly correct answer.** The correct option must be defensible straight
  from the reading. The other three are distractors.
- **Plausible distractors.** Good wrong answers reflect real misconceptions a
  student might hold — confusing a lazy expression with an eager value, mixing up
  two similar methods, assuming pandas-style bracket indexing, expecting a filter
  to return a scalar. Avoid throwaway options no one would pick.
- **Put the correct answer first.** For new entries, just make option `A` the
  correct one and set `"correct": "A"`. Don't spend effort shuffling the answer
  across letters — a later step scrambles the option order for us.
- **Self-contained stems.** A student reading the question live should have
  everything they need. If a question refers to code, put the code inline in the
  stem (e.g. `c.hdi > 0.9`) rather than assuming an external snippet.
- **Match the notes' vocabulary.** Use the same terms the chapter uses
  (DataFrame, expression, method chain, aesthetic, geometry, etc.).
- **Keep options parallel and comparable** in length and grammar so the answer
  isn't given away by one option being oddly long or oddly phrased.

## Code conventions

When a question includes code — in the stem or in an option — follow the exact
dialect used in the notes. **Do not run any code**; you are writing reference
questions, not executing them.

- Assume the standard setup is already loaded:

  ```python
  import polars as pl
  from plotnine import ggplot, aes
  from polars import col as c
  import funs
  ```

- Use **Polars**, never pandas. Reference columns with the `c.` prefix
  (`c.calories`, `c.food_group`).
- Method-chain style: the pipeline is wrapped in parentheses, starts with the
  DataFrame, and puts each method on its own line.
- For plots, use the notes' plotnine style, which starts the plot with the
  `.ggplot(aes(...))` method and adds geometries as chained methods
  (`.geom_point(...)`), not `ggplot(...) + geom_point()`.
- Use the datasets and column names as they appear in the chapter you are
  drawing from.

Because option and question text live inside JSON strings, escape as JSON
requires: use `\"` for a literal double quote, and `\\` for a backslash. Keep
each option on one line.

## Humanize the prose

The question stems and option text should read as if a person wrote them. Before
finalizing, run the natural-language text through the **`ta-humanizer`** skill
and apply its fixes. Keep it plain and direct, matching the voice of the notes
and the existing questions. Code fragments are exempt — humanize only the prose.

## Checklist before finishing

- [ ] Identified the target homework (named in the prompt, or the next homework
      with no questions yet for "the sample questions") and read its assigned
      sections in `~/gh/fds2` in full, per the "Homework readings" table.
- [ ] Read `questions.json` and continued per-homework numbering from the highest
      existing `QNN.MM` code for that homework.
- [ ] Produced the number of questions the prompt asked for (five for the sample
      set: four moderate, one more challenging), favoring concepts over code.
- [ ] Every question starts with its `QNN.MM: ` code and has a matching `id`.
- [ ] Every question has exactly four options lettered A–D and one `correct`
      letter.
- [ ] Correct answers are defensible from the notes and distractors are
      plausible; the correct option is `A` with `"correct": "A"` on every new
      entry.
- [ ] Any code follows the Polars/plotnine dialect and is verified against the
      `.qmd`, not guessed.
- [ ] The file is still valid JSON, existing entries untouched, indentation
      preserved.
- [ ] Prose has been run through `ta-humanizer`.
- [ ] No code was executed.
