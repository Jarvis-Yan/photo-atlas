import copy
import json
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta

from app.daily_rotation import advance, legacy_daily, public_state
from app.db import Database
from app.home import persistent_daily


def rows(n=25):
    return [{'id': 'p%03d' % i, 'category': ('自然', '城市', '星空', '人像')[i % 4]} for i in range(n)]


def next_day(day):
    return (date.fromisoformat(day) + timedelta(days=1)).isoformat()


def test_upgrade_preserves_published_edition_and_today_is_frozen_on_upload():
    pool = rows(243)
    state, issued = advance(pool, None, '2026-10-17')
    assert state['edition'] == [p['id'] for p in legacy_daily(pool, '2026-10-17')]
    original = copy.deepcopy(state)
    more = pool + [{'id': 'new', 'category': '自然'}]
    result, issued = advance(more, state, '2026-10-17')
    assert state == original
    assert result['edition'] == state['edition'] and not issued
    assert result['pending'] == state['pending'] + ['new']


def test_new_photos_join_unfinished_cycle_without_replaying_seen_photos():
    pool = rows(25)
    state, _ = advance(pool, None, '2026-10-17')
    shown = list(state['edition'])
    pool += [{'id': 'new-%d' % i, 'category': '自然'} for i in range(8)]
    state, _ = advance(pool, state, '2026-10-18')
    shown += state['edition']
    state, _ = advance(pool, state, '2026-10-19')
    shown += state['edition']
    assert len(set(shown[:33])) == 33
    assert set(shown[:33]) == {p['id'] for p in pool}
    assert len(set(state['edition'])) == 12  # cycle boundary inside an edition


def test_rename_reclassification_reordering_and_restore_do_not_reset_progress():
    pool = rows(40)
    state, _ = advance(pool, None, '2026-10-17')
    seen = set(state['edition'])
    pending = list(state['pending'])
    edited = [dict(p, category='自然', title='new title') for p in reversed(pool)]
    result, _ = advance(edited, state, '2026-10-17')
    assert result == state
    removed = state['edition'][0]
    hidden = [p for p in pool if p['id'] != removed]
    result, _ = advance(hidden, state, '2026-10-18')
    result, _ = advance(pool, result, '2026-10-19')
    assert not (set(result['edition']) & seen)
    assert removed not in result['pending']
    assert pending[:12] == advance(edited, state, '2026-10-18')[0]['edition']


def test_missed_days_do_not_consume_new_arrivals_in_the_past():
    pool = rows(25)
    state, _ = advance(pool, None, '2026-10-17')
    pool += [{'id': 'new', 'category': '城市'}]
    result, issued = advance(pool, state, '2026-10-23')
    for day, edition in issued:
        if day < '2026-10-23':
            assert 'new' not in edition
    assert 'new' in result['pending'] or 'new' in result['edition']


def test_snapshot_projection_matches_primary_for_multiple_days():
    pool = rows(243)
    state, _ = advance(pool, None, '2026-10-17')
    snapshot = public_state(state, pool)
    actual = state
    for index in range(1, 45):
        day = (date(2026, 10, 17) + timedelta(days=index)).isoformat()
        actual, _ = advance(pool, actual, day)
        predicted, _ = advance(pool, snapshot, day)
        assert actual == predicted


def test_empty_tiny_and_withdrawn_pools_do_not_loop_or_leak_private_ids():
    state, _ = advance([], None, '2026-10-17')
    state, _ = advance(rows(3), state, '2026-10-17')
    assert len(state['edition']) == 3
    for _ in range(3):
        state, _ = advance(rows(3), state, next_day(state['day']))
        assert len(set(state['edition'])) == 3
    redacted = public_state(state, rows(1))
    assert set(redacted['seen']) == {'p000'}
    assert set(redacted['last_shown']) == {'p000'}
    assert redacted['edition'] == ['p000']
    empty, _ = advance([], state, next_day(state['day']))
    assert empty['edition'] == [] and empty['pending'] == []


def test_serialized_history_survives_restart_and_concurrent_requests(tmp_path):
    database = Database(tmp_path / 'daily.sqlite')
    database.migrate()
    with database.connect() as db:
        for p in rows(30):
            db.execute("INSERT INTO photos(id,slug,title,category,original_name,original_path,sha256,size,created,published,processing) VALUES(?,?,?,?,?,?,?,1,0,1,'ready')",
                       (p['id'], p['id'], p['id'], p['category'], 'test.jpg', 'unused', p['id']))
    with ThreadPoolExecutor(max_workers=8) as workers:
        results = list(workers.map(lambda _: [p['id'] for p in persistent_daily(database, '2026-10-17')], range(24)))
    assert all(result == results[0] for result in results)
    assert database.one('SELECT COUNT(*) AS n FROM daily_home_editions')['n'] == 1
    restarted = Database(database.path)
    first = persistent_daily(restarted, '2026-10-18')
    assert not ({p['id'] for p in first} & set(results[0]))
    before = restarted.one('SELECT payload FROM daily_home_state')['payload']
    assert [p['id'] for p in persistent_daily(restarted, '2026-10-17')] == results[0]
    assert restarted.one('SELECT payload FROM daily_home_state')['payload'] == before
    # Withdrawal applies even to a frozen edition; history remains private.
    withdrawn = first[0]['id']
    restarted.execute('UPDATE photos SET published=0 WHERE id=?', (withdrawn,))
    assert withdrawn not in {p['id'] for p in persistent_daily(restarted, '2026-10-18')}
    assert withdrawn in json.loads(before)['seen']


def test_migration_keeps_captured_edition_even_if_uploads_arrive_before_activation():
    from app.daily_rotation import initialize
    pool=rows(243)
    captured=[p['id'] for p in legacy_daily(pool,'2026-10-17')]
    state=initialize(pool+[{'id':'arrived-during-deploy','category':'自然'}],'2026-10-17',captured)
    assert state['edition']==captured
    assert 'arrived-during-deploy' in state['pending']
    assert len(state['pending'])==232
