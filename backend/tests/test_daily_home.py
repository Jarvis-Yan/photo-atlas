from collections import Counter
from datetime import date, timedelta
import io

from PIL import Image

from app.home import select_daily
from app.media.processing import run_once as process
from test_workflows import stack, uploaded


def colored_png(red):
    out = io.BytesIO()
    Image.new('RGB', (80, 60), (red, 50, 120)).save(out, format='PNG')
    return out.getvalue()


def test_daily_selection_is_stable_balanced_and_rotates():
    rows = [
        {'id': f'{category}-{index}', 'category': category}
        for category in ('人像', '自然', '城市', '星空')
        for index in range(12)
    ]
    first = select_daily(rows, '2026-10-13', 12)
    repeated = select_daily(list(reversed(rows)), '2026-10-13', 12)
    tomorrow = select_daily(rows, '2026-10-14', 12)
    assert [row['id'] for row in first] == [row['id'] for row in repeated]
    assert Counter(row['category'] for row in first) == Counter({'人像': 3, '自然': 3, '城市': 3, '星空': 3})
    assert {row['id'] for row in first} != {row['id'] for row in tomorrow}


def test_home_endpoint_rotates_all_public_ready_photos_and_is_cacheable(stack):
    app, client, config = stack
    identifiers = []
    for number, category in enumerate(('人像', '自然', '城市', '星空'), 1):
        identifier, _ = uploaded(client, colored_png(number * 35))
        process(app.state.db, config)
        app.state.db.execute(
            "UPDATE photos SET title=?,category=?,published=1,featured=1,processing='ready' WHERE id=?",
            (category, category, identifier),
        )
        identifiers.append(identifier)
    ordinary, _ = uploaded(client, colored_png(210))
    process(app.state.db, config)
    app.state.db.execute(
        "UPDATE photos SET title='ordinary',category='自然',published=1,featured=0,processing='ready' WHERE id=?",
        (ordinary,),
    )

    identifiers.append(ordinary)
    for state in ('unpublished', 'processing', 'deleted'):
        identifier, _ = uploaded(client, colored_png({'unpublished': 11, 'processing': 12, 'deleted': 13}[state]))
        process(app.state.db, config)
        app.state.db.execute("UPDATE photos SET category='自然',published=?,processing=?,deleted=? WHERE id=?",
            (0 if state == 'unpublished' else 1, 'queued' if state == 'processing' else 'ready', '2026-10-17' if state == 'deleted' else None, identifier))

    response = client.get('/api/public/home')
    assert response.status_code == 200
    assert {photo['id'] for photo in response.json()['photos']} == set(identifiers)
    assert response.headers['cache-control'].startswith('public, max-age=300')
    assert response.headers['etag']
    assert client.get('/api/public/home', headers={'If-None-Match': response.headers['etag']}).status_code == 304




def test_ring_covers_full_imbalanced_pool_before_repeating():
    rows = [{'id': f'{category}-{i}', 'category': category}
            for category, count in zip(('人像', '自然', '城市', '星空'), (37, 93, 101, 12))
            for i in range(count)]
    seen = []
    last_day = {}
    for offset in range(90):
        day = (date(2026, 10, 17) + timedelta(days=offset)).isoformat()
        batch = select_daily(rows, day)
        assert len({row['id'] for row in batch}) == 12
        assert batch == select_daily(list(reversed(rows)), day)
        for row in batch:
            if row['id'] in last_day:
                assert offset - last_day[row['id']] >= 20
            last_day[row['id']] = offset
            seen.append(row['id'])
    assert len(set(seen[:243])) == 243


def test_small_empty_and_duplicate_pools():
    assert select_daily([], '2026-10-17') == []
    rows = [{'id': str(i), 'category': '星空'} for i in range(5)]
    assert len(select_daily(rows + rows, '2026-10-17')) == 5
    assert select_daily(rows, '2026-10-17', 0) == []
