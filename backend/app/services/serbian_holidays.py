"""
Serbian national and religious holidays (non-working days).
"""
from datetime import date, timedelta


def _orthodox_easter(year: int) -> date:
    """Calculate Orthodox Easter (Julian calendar -> Gregorian)."""
    a = year % 4
    b = year % 7
    c = year % 19
    d = (19 * c + 15) % 30
    e = (2 * a + 4 * b - d + 34) % 7
    month = 3 + (d + e + 21) // 31
    day = ((d + e + 21) % 31) + 1
    julian = date(year, month, day)
    return julian + timedelta(days=13)


def get_serbian_holidays(year: int) -> list[dict]:
    """Return list of non-working holidays for given year."""
    easter = _orthodox_easter(year)
    good_friday = easter - timedelta(days=2)
    easter_monday = easter + timedelta(days=1)

    holidays = [
        {"date": date(year, 1, 1), "name": "New Year"},
        {"date": date(year, 1, 2), "name": "New Year (day 2)"},
        {"date": date(year, 1, 7), "name": "Orthodox Christmas"},
        {"date": date(year, 2, 15), "name": "Statehood Day"},
        {"date": date(year, 2, 16), "name": "Statehood Day (day 2)"},
        {"date": good_friday, "name": "Good Friday"},
        {"date": easter, "name": "Orthodox Easter"},
        {"date": easter_monday, "name": "Easter Monday"},
        {"date": date(year, 5, 1), "name": "Labour Day"},
        {"date": date(year, 5, 2), "name": "Labour Day (day 2)"},
        {"date": date(year, 11, 11), "name": "Armistice Day"},
    ]

    return holidays


def is_serbian_holiday(target_date: date) -> dict | None:
    """Return holiday info if given date is a holiday."""
    holidays = get_serbian_holidays(target_date.year)
    for h in holidays:
        if h["date"] == target_date:
            return h
    return None
