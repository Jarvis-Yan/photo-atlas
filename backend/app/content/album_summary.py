"""Public album metadata comes from its eligible members, not its cover date."""
import json
import re


def summarize(members):
    years=set();places=[]
    for member in members:
        captured=member.get('captured') or {}
        geo=member.get('geo') or {}
        if isinstance(captured,str):captured=json.loads(captured)
        if isinstance(geo,str):geo=json.loads(geo)
        match=re.match(r'^(\d{4})(?:-|$)',str(captured.get('value','')))
        if match and 1800<=int(match[1])<=2200:years.add(int(match[1]))
        label=geo.get('label')
        if label and label not in places:places.append(label)
    return {'years':sorted(years),'places':places}
