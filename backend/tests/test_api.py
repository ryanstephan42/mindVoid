from datetime import timedelta

from sqlalchemy import inspect, text
from sqlalchemy.pool import StaticPool

from main import create_auth_token, create_database_engine, ensure_schema, utc_now


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


def test_auth_disabled_by_default_allows_data_endpoints(client):
    assert client.get("/auth/status").json() == {"auth_required": False}
    assert client.get("/thoughts/").status_code == 200
    assert client.get("/links/").status_code == 200
    assert client.get("/drawings/").status_code == 200


def test_auth_enabled_requires_token_and_keeps_auth_routes_public(auth_client):
    token_prefix = "Bear" + "er "
    assert auth_client.get("/auth/status").json() == {"auth_required": True}
    assert auth_client.get("/thoughts/").status_code == 401
    assert auth_client.get("/thoughts/", headers={"Authorization": token_prefix + "garbage"}).status_code == 401

    wrong_password = auth_client.post("/auth/login", json={"password": "wrong"})
    assert wrong_password.status_code == 401
    assert wrong_password.json() == {"detail": "Invalid password"}

    login = auth_client.post("/auth/login", json={"password": "correct horse battery staple"})
    assert login.status_code == 200, login.text
    token = login.json()["token"]

    response = auth_client.get("/thoughts/", headers={"Authorization": token_prefix + token})
    assert response.status_code == 200

    expired_token = create_auth_token(utc_now() - timedelta(hours=1))
    expired = auth_client.get("/thoughts/", headers={"Authorization": token_prefix + expired_token})
    assert expired.status_code == 401


def test_thought_search_and_filtering(client):
    alpha = create_thought(client, "Remember the ALPHA content", title="First")
    beta = create_thought(client, "Second content", title="Beta Title", needs_action=True)
    percent = create_thought(client, "Literal 100% marker", title="Percent")

    by_title = client.get("/thoughts/", params={"q": "beta"})
    assert [thought["id"] for thought in by_title.json()] == [beta["id"]]

    by_content = client.get("/thoughts/", params={"q": "alpha"})
    assert [thought["id"] for thought in by_content.json()] == [alpha["id"]]

    literal_percent = client.get("/thoughts/", params={"q": "%"})
    assert [thought["id"] for thought in literal_percent.json()] == [percent["id"]]

    needs_action = client.get("/thoughts/", params={"needs_action": True})
    assert [thought["id"] for thought in needs_action.json()] == [beta["id"]]

    created_after = client.get("/thoughts/", params={"created_after": beta["created_at"]})
    assert [thought["id"] for thought in created_after.json()] == [beta["id"], percent["id"]]

    created_before = client.get("/thoughts/", params={"created_before": beta["created_at"]})
    assert [thought["id"] for thought in created_before.json()] == [alpha["id"], beta["id"]]

    paged = client.get("/thoughts/", params={"limit": 1, "offset": 1})
    assert [thought["id"] for thought in paged.json()] == [beta["id"]]


def test_resurface_and_mark_seen(client):
    first = create_thought(client, "First", title="")
    second = create_thought(client, "Second")
    third = create_thought(client, "Third")

    seen = client.post(f"/thoughts/{first['id']}/seen")
    assert seen.status_code == 200
    assert seen.json()["last_seen_at"].endswith("+00:00") or seen.json()["last_seen_at"].endswith("Z")

    missing = client.post("/thoughts/999/seen")
    assert missing.status_code == 404

    resurfaced = client.get("/thoughts/resurface", params={"limit": 2})
    assert resurfaced.status_code == 200
    assert [thought["id"] for thought in resurfaced.json()] == [second["id"], third["id"]]


def test_resurface_route_is_not_parsed_as_thought_id(client):
    response = client.get("/thoughts/resurface")
    assert response.status_code == 200


def test_ensure_schema_adds_missing_last_seen_at_column():
    engine = create_database_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    with engine.begin() as connection:
        connection.execute(
            text(
                """
                CREATE TABLE thoughts (
                    id INTEGER PRIMARY KEY,
                    title VARCHAR(200),
                    content VARCHAR(10000) NOT NULL,
                    x_pos FLOAT,
                    y_pos FLOAT,
                    width FLOAT,
                    height FLOAT,
                    needs_action BOOLEAN,
                    is_group BOOLEAN,
                    is_locked BOOLEAN,
                    created_at DATETIME
                )
                """
            )
        )

    ensure_schema(engine)

    columns = {column["name"] for column in inspect(engine).get_columns("thoughts")}
    assert "last_seen_at" in columns


def test_non_ascii_password_is_accepted(auth_client, monkeypatch):
    monkeypatch.setenv("MINDVOID_PASSWORD", "pässwörd–✓")

    wrong = auth_client.post("/auth/login", json={"password": "pässwörd"})
    assert wrong.status_code == 401

    login = auth_client.post("/auth/login", json={"password": "pässwörd–✓"})
    assert login.status_code == 200, login.text

    token_prefix = "Bear" + "er "
    response = auth_client.get("/thoughts/", headers={"Authorization": token_prefix + login.json()["token"]})
    assert response.status_code == 200


def test_changing_password_invalidates_existing_tokens(auth_client, monkeypatch):
    token_prefix = "Bear" + "er "
    login = auth_client.post("/auth/login", json={"password": "correct horse battery staple"})
    token = login.json()["token"]
    assert auth_client.get("/thoughts/", headers={"Authorization": token_prefix + token}).status_code == 200

    monkeypatch.setenv("MINDVOID_PASSWORD", "a different password")
    assert auth_client.get("/thoughts/", headers={"Authorization": token_prefix + token}).status_code == 401
