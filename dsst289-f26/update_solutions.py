# /// script
# requires-python = ">=3.10"
# dependencies = ["polars"]
# ///
"""Publish homework solutions stored in ans/ onto the homework pages.

Each homework has a matching file ans/hwNN.parquet holding a single column,
"html", with one row: the raw HTML of that homework's solution block (starting
at <h3>Solutions</h3>). An empty string means no solutions have been written.

Running the script first strips any existing solution block from every page in
hw/, then re-inserts the stored block for each homework whose class has passed.
A homework counts as passed from noon (America/New_York) on the date listed next
to it in index.html. Pages are rewritten only when their content changes.

    uv run update_solutions.py                # update every homework page
    uv run update_solutions.py --dry-run      # report what would change
    uv run update_solutions.py --now 2026-10-01T13:00
    uv run update_solutions.py --save hw09    # copy the solution block now in
                                              # hw/hw09.html into ans/hw09.parquet
"""

import argparse
import re
from datetime import date, datetime, time
from pathlib import Path
from zoneinfo import ZoneInfo

import polars as pl

ROOT = Path(__file__).resolve().parent
HW_DIR = ROOT / "hw"
ANS_DIR = ROOT / "ans"
INDEX_PATH = ROOT / "index.html"

TIMEZONE = ZoneInfo("America/New_York")
RELEASE_TIME = time(12, 0)

HEADER = "<h3>Solutions</h3>"
# The container div closes on its own line, two spaces in, just above <script>.
CLOSE_DIV = "\n  </div>"


def homework_dates():
    """Map each homework name (e.g. "hw09") to its class date from index.html."""
    dates = {}
    for row in re.findall(r"<tr>(.*?)</tr>", INDEX_PATH.read_text(), re.S):
        day = re.search(r"<b>(\d{4}-\d{2}-\d{2})</b>", row)
        if not day:
            continue
        for name in re.findall(r'href="hw/(hw\d+)\.html"', row):
            dates[name] = date.fromisoformat(day.group(1))
    return dates


def split_page(text):
    """Split a page into (before, solutions, after) around the solution block.

    ``solutions`` is the stripped block starting at the header, or "" when the
    page has none. ``before`` ends with the page's last non-blank content and
    ``after`` starts at the container div's closing line.
    """
    end = text.rindex(CLOSE_DIV)
    start = text.find(HEADER, 0, end)
    if start == -1:
        return text[:end].rstrip(), "", text[end:]
    return text[:start].rstrip(), text[start:end].strip(), text[end:]


def build_page(before, solutions, after):
    if solutions:
        return f"{before}\n\n    {solutions}\n{after}"
    return f"{before}{after}"


def ans_path(name):
    return ANS_DIR / f"{name}.parquet"


def read_solutions(name):
    path = ans_path(name)
    if not path.exists():
        return ""
    values = pl.read_parquet(path)["html"].to_list()
    return (values[0] or "").strip() if values else ""


def write_solutions(name, html):
    ANS_DIR.mkdir(exist_ok=True)
    pl.DataFrame({"html": [html]}).write_parquet(ans_path(name))


def save(name):
    """Store the solution block currently on hw/<name>.html in ans/."""
    _, solutions, _ = split_page((HW_DIR / f"{name}.html").read_text())
    write_solutions(name, solutions)
    status = f"{len(solutions)} characters" if solutions else "empty"
    print(f"saved {ans_path(name).relative_to(ROOT)} ({status})")


def update(now, dry_run):
    dates = homework_dates()
    for page in sorted(HW_DIR.glob("hw*.html")):
        name = page.stem
        text = page.read_text()
        before, _, after = split_page(text)

        due = dates.get(name)
        released = due is not None and now >= datetime.combine(due, RELEASE_TIME, TIMEZONE)
        solutions = read_solutions(name) if released else ""

        new_text = build_page(before, solutions, after)
        if solutions:
            state = "solutions shown"
        elif released:
            state = "released, no solutions stored"
        else:
            state = f"hidden until {due} {RELEASE_TIME:%H:%M}" if due else "no date in index.html"
        changed = new_text != text
        print(f"{name}: {state}{' (updated)' if changed else ''}")
        if changed and not dry_run:
            page.write_text(new_text)


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dry-run", action="store_true", help="report changes without writing")
    parser.add_argument("--now", help="pretend the current time is this ISO timestamp (local to the course)")
    parser.add_argument("--save", nargs="+", metavar="HW", help="store the solutions on these pages into ans/")
    args = parser.parse_args()

    if args.save:
        for name in args.save:
            save(name)
        return

    now = datetime.fromisoformat(args.now).replace(tzinfo=TIMEZONE) if args.now else datetime.now(TIMEZONE)
    update(now, args.dry_run)


if __name__ == "__main__":
    main()
