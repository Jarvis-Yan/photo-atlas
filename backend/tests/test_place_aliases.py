from app.places import matches


def test_kamakura_country_and_simplified_aliases():
    for label in ["日本 镰仓", "日本镰仓", "镰仓", "日本 鎌倉市", "Kamakura, Japan"]:
        candidates = matches(label)
        assert len(candidates) == 1
        assert candidates[0]["country"] == "JP"
        assert candidates[0]["id"] == '1860672'
    for label in ["中国 镰仓", "这是镰仓风格的构图", "海南"]:
        assert not matches(label)
