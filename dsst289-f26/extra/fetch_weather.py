# /// script
# requires-python = ">=3.11"
# dependencies = ["polars", "requests"]
# ///
"""Build the hourly weather table for the DSST289 project collection window.

Pulls routine hourly observations for Richmond International Airport (KRIC)
from the Iowa Environmental Mesonet ASOS archive, which is free and needs no
API key, and reduces them to exactly one row per hour of the window.

Run this once, after the collection window closes:

    uv run extra/fetch_weather.py --start 2026-11-02 --end 2026-11-15

It writes weather.csv, which joins to a student's hours table on date + hour.
Every hour of the window is present, so an inner join against a complete hours
table preserves the row count. Hours with no usable observation are null.
"""

import argparse
from datetime import date, timedelta

import polars as pl
from polars import col as c
import requests

STATION = "RIC"
ENDPOINT = "https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py"

# The raw ASOS field names, and what we call them in the finished table.
FIELDS = {
    "tmpf": "temp",
    "dwpf": "dewp",
    "relh": "humid",
    "sknt": "wind_speed",
    "p01i": "precip",
    "vsby": "visib",
}


def fetch(start: date, end: date) -> pl.DataFrame:
    params = [
        ("station", STATION),
        ("tz", "America/New_York"),
        ("format", "onlycomma"),
        ("missing", "empty"),
        ("trace", "0.0001"),
        ("latlon", "no"),
        ("elev", "no"),
        ("direct", "no"),
        ("report_type", "3"),  # routine hourly observations only
        ("year1", start.year), ("month1", start.month), ("day1", start.day),
        ("year2", end.year), ("month2", end.month), ("day2", end.day + 1),
    ]
    params += [("data", f) for f in FIELDS]

    response = requests.get(ENDPOINT, params=params, timeout=120)
    response.raise_for_status()
    return pl.read_csv(response.content, try_parse_dates=False)


def build(raw: pl.DataFrame, start: date, end: date) -> pl.DataFrame:
    # One row per (date, hour), averaging any duplicate observations. The ASOS
    # feed occasionally reports twice in an hour when the weather is changing.
    hourly = (
        raw
        .with_columns(
            c.valid.str.to_datetime("%Y-%m-%d %H:%M")
        )
        .with_columns(
            date = c.valid.dt.date(),
            hour = c.valid.dt.hour(),
        )
        .with_columns(
            [c(f).cast(pl.Float64, strict=False).alias(name) for f, name in FIELDS.items()]
        )
        .group_by(c.date, c.hour)
        .agg([c(name).mean() for name in FIELDS.values()])
    )

    # The spine: every hour of the window, whether or not it was observed.
    n_days = (end - start).days + 1
    spine = pl.DataFrame({
        "date": [start + timedelta(days=d) for d in range(n_days) for _ in range(24)],
        "hour": [h for _ in range(n_days) for h in range(24)],
    })

    return (
        spine
        .join(hourly, on=[c.date, c.hour], how="left")
        .with_columns(
            [c(name).round(1) for name in FIELDS.values()]
        )
        .sort(c.date, c.hour)
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--start", type=date.fromisoformat, required=True)
    parser.add_argument("--end", type=date.fromisoformat, required=True)
    parser.add_argument("--out", default="weather.csv")
    args = parser.parse_args()

    weather = build(fetch(args.start, args.end), args.start, args.end)
    weather.write_csv(args.out)

    n_missing = weather.select(c.temp.is_null().sum()).item()
    print(f"wrote {args.out}: {len(weather)} rows, {n_missing} hours with no temperature")


if __name__ == "__main__":
    main()
