"""Pure rotation planner shared by the primary and read-only Python 3.6 mirror.

State is global publication history, never per-visitor tracking. The primary
commits it atomically; a mirror projects from its last committed snapshot.
"""
import copy
import hashlib
from collections import defaultdict
from datetime import datetime, timedelta

CATEGORIES = ('人像', '自然', '城市', '星空')


def rank(seed, value):
    return hashlib.sha256(('pixelcore-daily-v1\0' + seed + '\0' + value).encode()).digest()


def mixed_order(rows):
    groups = defaultdict(list)
    for row in {p['id']: p for p in rows if p.get('category') in CATEGORIES}.values():
        groups[row['category']].append(row)
    slots = []
    for category, group in groups.items():
        group.sort(key=lambda row: rank('rotation-v2', row['id']))
        for index, row in enumerate(group):
            slots.append(((index + .5) / len(group), rank('rotation-v2', category), row))
    return [slot[2] for slot in sorted(slots, key=lambda slot: (slot[0], slot[1]))]


def legacy_daily(rows, day, limit=12):
    """Migration seed only: preserve the already published edition on upgrade."""
    ordered = mixed_order(rows)
    if not ordered or limit <= 0:
        return []
    offset = (datetime.strptime(day, '%Y-%m-%d') - datetime(2026, 10, 17)).days * limit % len(ordered)
    return [ordered[(offset + i) % len(ordered)] for i in range(min(limit, len(ordered)))]


def initialize(rows, day, edition=None):
    """Start the ledger, optionally preserving an explicitly captured live edition."""
    ordered = [p['id'] for p in mixed_order(rows)]
    selected = [p['id'] for p in legacy_daily(rows, day)] if edition is None else edition
    ids = list(dict.fromkeys(i for i in selected if i in set(ordered)))
    return {'version': 1, 'day': day, 'cycle': 1, 'edition': ids,
            'pending': [i for i in ordered if i not in ids],
            'seen': {i: 1 for i in ids}, 'last_shown': {i: day for i in ids}}


def advance(rows, stored, day, limit=12):
    """Return a new state and newly issued (day, ids) editions without mutation.

    New arrivals append to the unfinished cycle. Today's edition is frozen.
    Missed days advance only previously known photos: arrivals are never marked
    as shown before the day on which the primary first observes them.
    """
    if limit <= 0:
        raise ValueError('Daily limit must be positive')
    datetime.strptime(day, '%Y-%m-%d')
    by_id = {p['id']: p for p in rows if p.get('category') in CATEGORIES}
    active = set(by_id)
    if stored is None:
        state = initialize(rows, day, [p['id'] for p in legacy_daily(rows, day, limit)])
        return state, [(day, list(state['edition']))]
    state = copy.deepcopy(stored)
    if state.get('version') != 1:
        raise ValueError('Unknown daily rotation version')
    if day < state['day']:
        raise ValueError('Cannot move rotation backwards')
    known = set(state['pending']) | set(state['seen'])
    issued = []

    def reconcile(available):
        pending = [i for i in state['pending'] if i in available and state['seen'].get(i, 0) < state['cycle']]
        queued = set(pending)
        newcomers = [by_id[i] for i in available if i not in queued and state['seen'].get(i, 0) < state['cycle']]
        state['pending'] = pending + [p['id'] for p in mixed_order(newcomers)]

    def issue(edition_day, available):
        reconcile(available)
        selected = []
        while len(selected) < min(limit, len(available)):
            if not state['pending']:
                state['cycle'] += 1
                # Oldest appearances lead the next cycle. Never duplicate a
                # photograph inside an edition that straddles two cycles.
                state['pending'] = sorted(available, key=lambda i: (state['last_shown'].get(i, ''), rank('cycle-' + str(state['cycle']), i)))
            index = next((n for n, i in enumerate(state['pending']) if i not in selected), None)
            if index is None:
                break
            identifier = state['pending'].pop(index)
            selected.append(identifier)
            state['seen'][identifier] = state['cycle']
            state['last_shown'][identifier] = edition_day
        state['day'], state['edition'] = edition_day, selected
        issued.append((edition_day, list(selected)))

    cursor = datetime.strptime(state['day'], '%Y-%m-%d') + timedelta(days=1)
    while cursor.strftime('%Y-%m-%d') <= day:
        current = cursor.strftime('%Y-%m-%d')
        issue(current, active if current == day else active & known)
        cursor += timedelta(days=1)
    # Same-day uploads join the pending queue without replacing today's photos.
    reconcile(active)
    if not state['edition'] and active:
        issue(day, active)
    return state, issued


def public_state(state, rows):
    """A mirror receives public identifiers only, never withdrawn-photo history."""
    state = copy.deepcopy(state)
    allowed = {p['id'] for p in rows}
    for key in ('pending', 'edition'):
        state[key] = [i for i in state[key] if i in allowed]
    for key in ('seen', 'last_shown'):
        state[key] = {i: value for i, value in state[key].items() if i in allowed}
    return state
