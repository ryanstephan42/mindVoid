def create_thought(client, content="A thought", **overrides):
    payload = {"content": content, "title": "Title", **overrides}
    response = client.post("/thoughts/", json=payload)
    assert response.status_code == 200, response.text
    return response.json()


def test_thought_create_read_update_delete_happy_path(client):
    thought = create_thought(client, x_pos=1.5, y_pos=2.5)
    assert thought["content"] == "A thought"
    assert thought["title"] == "Title"

    response = client.get("/thoughts/")
    assert response.status_code == 200
    assert response.json() == [thought]

    response = client.put(f"/thoughts/{thought['id']}", json={"content": "Updated", "needs_action": True})
    assert response.status_code == 200
    updated = response.json()
    assert updated["content"] == "Updated"
    assert updated["needs_action"] is True

    response = client.delete(f"/thoughts/{thought['id']}")
    assert response.status_code == 200
    assert client.get("/thoughts/").json() == []


def test_missing_thought_update_and_delete_return_404(client):
    assert client.put("/thoughts/999", json={"content": "Updated"}).status_code == 404
    assert client.delete("/thoughts/999").status_code == 404


def test_deleting_thought_cascades_away_links(client):
    first = create_thought(client, "First")
    second = create_thought(client, "Second")
    link = client.post("/links/", json={"source_id": first["id"], "target_id": second["id"]})
    assert link.status_code == 200

    response = client.delete(f"/thoughts/{first['id']}")
    assert response.status_code == 200
    assert client.get("/links/").json() == []


def test_link_validation_and_deduplication(client):
    first = create_thought(client, "First")
    second = create_thought(client, "Second")

    self_link = client.post("/links/", json={"source_id": first["id"], "target_id": first["id"]})
    assert self_link.status_code == 400

    missing = client.post("/links/", json={"source_id": first["id"], "target_id": 999})
    assert missing.status_code == 404

    created = client.post("/links/", json={"source_id": first["id"], "target_id": second["id"]})
    assert created.status_code == 200
    duplicate_same = client.post("/links/", json={"source_id": first["id"], "target_id": second["id"]})
    duplicate_reverse = client.post("/links/", json={"source_id": second["id"], "target_id": first["id"]})
    assert duplicate_same.status_code == 200
    assert duplicate_reverse.status_code == 200
    assert duplicate_same.json()["id"] == created.json()["id"]
    assert duplicate_reverse.json()["id"] == created.json()["id"]
    assert len(client.get("/links/").json()) == 1


def test_drawing_create_read_update_delete_happy_path(client):
    payload = {
        "type": "rectangle",
        "x": 1,
        "y": 2,
        "width": 10,
        "height": 20,
        "points": "[1, 2, 3]",
        "text": "label",
        "color": "#abcdef",
    }
    response = client.post("/drawings/", json=payload)
    assert response.status_code == 200, response.text
    drawing = response.json()
    assert drawing["type"] == "rectangle"

    response = client.get("/drawings/")
    assert response.status_code == 200
    assert response.json() == [drawing]

    response = client.put(f"/drawings/{drawing['id']}", json={"type": "text", "text": "updated", "color": "#fff"})
    assert response.status_code == 200
    updated = response.json()
    assert updated["type"] == "text"
    assert updated["text"] == "updated"

    response = client.delete(f"/drawings/{drawing['id']}")
    assert response.status_code == 200
    assert client.get("/drawings/").json() == []


def test_drawing_rejects_invalid_type_and_malformed_points(client):
    invalid_type = client.post("/drawings/", json={"type": "oval"})
    assert invalid_type.status_code == 422

    invalid_points = client.post("/drawings/", json={"type": "freehand", "points": "not json"})
    assert invalid_points.status_code == 422


def test_content_validation_rejects_blank_and_over_length_content(client):
    blank = client.post("/thoughts/", json={"content": "   "})
    assert blank.status_code == 422

    over_length = client.post("/thoughts/", json={"content": "x" * 10001})
    assert over_length.status_code == 422


def test_created_at_serializes_with_utc_offset(client):
    thought = create_thought(client)
    assert thought["created_at"].endswith("+00:00") or thought["created_at"].endswith("Z")
