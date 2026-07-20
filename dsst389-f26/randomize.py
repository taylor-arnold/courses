#!/usr/bin/env python3
"""Deterministically permute the answer options in poll/questions.json.

New questions are written with the correct answer as option A (see QUESTIONS.md).
This script shuffles the four options of every question, re-letters them A-D in
their new order, and updates each question's "correct" field to point at wherever
the right answer landed. Questions marked "resort": false (such as the ordered
opinion scales at the top of the file) are left untouched.

Each question's ordering is derived from a hash of its "id" plus a global seed,
so the shuffle is stable: re-running the script leaves every ordering unchanged,
and reordering or inserting questions in the file does not disturb the options of
any other question. Bump SEED to reshuffle everything at once.

Run it from anywhere:

    uv run randomize.py            # shuffle in place with the built-in seed
    uv run randomize.py --seed 7   # shuffle with a different seed
    uv run randomize.py --dry-run  # print the result, don't write
"""

import argparse
import hashlib
import json
from pathlib import Path

QUESTIONS_PATH = Path(__file__).resolve().parent / "poll" / "questions.json"
LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"]

# Change this to reshuffle every question at once while keeping runs reproducible.
SEED = 1


def option_order(options, key):
    """Return options in a deterministic order keyed by the given hash string.

    Each option is scored with a SHA-256 digest of ``key`` plus the option's own
    text, then sorted by that score. The result depends only on ``key`` and the
    set of option texts, so it is stable across runs and independent of the
    options' incoming order.
    """

    def score(option):
        material = f"{key}\x00{option.get('text', '')}".encode("utf-8")
        return hashlib.sha256(material).hexdigest()

    return sorted(options, key=score)


def permute_question(question, seed):
    """Shuffle one question's options in place and fix its letters/correct.

    Questions carrying "resort": false (e.g. the ordered opinion scales at the
    top of the file) keep their options in the authored order.
    """
    if question.get("resort") is False:
        return

    options = question.get("options")
    if not options:
        return

    # Remember which option object is the correct one before we move things
    # around; track the object itself so duplicate answer text can't confuse us.
    correct_letter = question.get("correct")
    correct_option = None
    if correct_letter is not None:
        for option in options:
            if option.get("letter") == correct_letter:
                correct_option = option
                break

    # Derive the ordering from the question's identity so it stays fixed even if
    # the question moves within the file. Fall back to the text when there's no id.
    key = f"{seed}\x00{question.get('id') or question.get('question', '')}"
    question["options"] = options = option_order(options, key)

    for index, option in enumerate(options):
        option["letter"] = LETTERS[index]

    if correct_option is not None:
        question["correct"] = correct_option["letter"]


def dump_inline(obj):
    """Render a small object on one line: { "letter": "A", "text": "..." }."""
    inner = ", ".join(
        f"{json.dumps(key)}: {json.dumps(value, ensure_ascii=False)}"
        for key, value in obj.items()
    )
    return "{ " + inner + " }"


def dump_question(question):
    """Render one question object, matching the file's existing layout."""
    lines = ["  {"]
    keys = list(question.keys())
    for i, key in enumerate(keys):
        trailing = "," if i < len(keys) - 1 else ""
        if key == "options":
            lines.append('    "options": [')
            options = question[key]
            for j, option in enumerate(options):
                option_comma = "," if j < len(options) - 1 else ""
                lines.append("      " + dump_inline(option) + option_comma)
            lines.append("    ]" + trailing)
        else:
            value = json.dumps(question[key], ensure_ascii=False)
            lines.append(f"    {json.dumps(key)}: {value}" + trailing)
    lines.append("  }")
    return "\n".join(lines)


def dump_all(data):
    """Serialize the whole array, preserving the two-space, inline-option style."""
    return "[\n" + ",\n".join(dump_question(q) for q in data) + "\n]\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--seed",
        type=int,
        default=SEED,
        help=f"seed mixed into every question's hash (default: {SEED})",
    )
    parser.add_argument(
        "--path",
        type=Path,
        default=QUESTIONS_PATH,
        help=f"path to questions.json (default: {QUESTIONS_PATH})",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="print the shuffled JSON instead of writing it back",
    )
    args = parser.parse_args()

    data = json.loads(args.path.read_text())
    for question in data:
        permute_question(question, args.seed)

    output = dump_all(data)
    if args.dry_run:
        print(output, end="")
    else:
        args.path.write_text(output)
        print(f"Shuffled {len(data)} question(s) in {args.path}")


if __name__ == "__main__":
    main()
