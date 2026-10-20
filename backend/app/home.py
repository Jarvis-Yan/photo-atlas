"""Deterministic, date-scoped selection for the public home page."""
from datetime import datetime
from zoneinfo import ZoneInfo


BEIJING = ZoneInfo('Asia/Shanghai')
HOME_CATEGORIES = ('人像', '自然', '城市', '星空')


def beijing_day(now=None):
    """Return the public site's calendar day, independent of server timezone."""
    now = now or datetime.now(BEIJING)
    if now.tzinfo is None:
        now = now.replace(tzinfo=BEIJING)
    return now.astimezone(BEIJING).date().isoformat()


def select_daily(rows, day, limit=12):
    """Legacy deterministic selector, retained only for upgrade seeding."""
    from .daily_rotation import legacy_daily
    return legacy_daily(rows, day, limit)


def persistent_daily(database, day, limit=12):
    """Serialize concurrent readers, edition creation, and upload reconciliation."""
    import json
    from .daily_rotation import advance
    with database.connect() as db:
        db.execute('BEGIN IMMEDIATE')
        rows = [dict(row) for row in db.execute(
            "SELECT * FROM photos WHERE deleted IS NULL AND published=1 AND processing='ready'")]
        by_id = {row['id']: row for row in rows}
        record = db.execute('SELECT payload FROM daily_home_state WHERE id=1').fetchone()
        old = json.loads(record['payload']) if record else None
        if old and day < old['day']:
            edition = db.execute('SELECT photo_ids FROM daily_home_editions WHERE day=?', (day,)).fetchone()
            ids = json.loads(edition['photo_ids']) if edition else []
        else:
            state, editions = advance(rows, old, day, limit)
            if state != old:
                payload = json.dumps(state, ensure_ascii=False, separators=(',', ':'))
                db.execute('INSERT OR REPLACE INTO daily_home_state(id,payload) VALUES(1,?)', (payload,))
            for date, ids in editions:
                db.execute('INSERT OR REPLACE INTO daily_home_editions(day,photo_ids) VALUES(?,?)',
                           (date, json.dumps(ids)))
            ids = state['edition']
        return [by_id[i] for i in ids if i in by_id]
