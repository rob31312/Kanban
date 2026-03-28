import { useEffect, useMemo, useState } from "react";

const COLUMN_ORDER = ["todo", "inprogress", "done"];

const COLUMN_TITLES = {
  todo: "To Do",
  inprogress: "In Progress",
  done: "Done",
};

const appStyle = {
  minHeight: "100vh",
  background: "#0f172a",
  color: "#e5e7eb",
  padding: "24px",
  fontFamily: "Arial, sans-serif",
  boxSizing: "border-box",
};

const pageWidthStyle = {
  maxWidth: "1200px",
  margin: "0 auto",
};

const titleStyle = {
  marginTop: 0,
  marginBottom: "8px",
  fontSize: "32px",
};

const subtitleStyle = {
  marginTop: 0,
  marginBottom: "24px",
  color: "#cbd5e1",
};

const panelStyle = {
  background: "#1e293b",
  border: "1px solid #334155",
  borderRadius: "12px",
  padding: "16px",
  marginBottom: "20px",
};

const formRowStyle = {
  display: "grid",
  gridTemplateColumns: "1.2fr 2fr 160px 120px",
  gap: "12px",
  alignItems: "center",
};

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "8px",
  border: "1px solid #475569",
  background: "#0f172a",
  color: "#e5e7eb",
  boxSizing: "border-box",
};

const buttonStyle = {
  padding: "10px 14px",
  borderRadius: "8px",
  border: "1px solid #64748b",
  background: "#334155",
  color: "#f8fafc",
  cursor: "pointer",
};

const primaryButtonStyle = {
  ...buttonStyle,
  background: "#2563eb",
  border: "1px solid #2563eb",
};

const dangerButtonStyle = {
  ...buttonStyle,
  background: "#991b1b",
  border: "1px solid #991b1b",
};

const columnsStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: "16px",
};

const columnStyle = {
  background: "#1e293b",
  border: "1px solid #334155",
  borderRadius: "12px",
  padding: "16px",
  minHeight: "420px",
};

const columnTitleStyle = {
  marginTop: 0,
  marginBottom: "12px",
  fontSize: "20px",
};

const cardStyle = {
  background: "#0f172a",
  border: "1px solid #475569",
  borderRadius: "10px",
  padding: "12px",
  marginBottom: "12px",
};

const cardTitleStyle = {
  marginTop: 0,
  marginBottom: "8px",
  fontSize: "18px",
};

const cardTextStyle = {
  marginTop: 0,
  marginBottom: "12px",
  color: "#cbd5e1",
  whiteSpace: "pre-wrap",
};

const metaStyle = {
  fontSize: "12px",
  color: "#94a3b8",
  marginBottom: "10px",
};

const buttonRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "8px",
};

const smallButtonStyle = {
  ...buttonStyle,
  padding: "8px 10px",
  fontSize: "13px",
};

function App() {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newStatus, setNewStatus] = useState("todo");

  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editStatus, setEditStatus] = useState("todo");

  async function apiFetch(url, options = {}) {
    const response = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      ...options,
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Request failed.");
    }

    return data;
  }

  async function loadCards() {
    try {
      setLoading(true);
      setError("");

      const data = await apiFetch("/api/cards");
      setCards(data.cards || []);
    } catch (err) {
      setError(err.message || "Failed to load cards.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCards();
  }, []);

  const cardsByColumn = useMemo(() => {
    return {
      todo: cards.filter((card) => card.status === "todo"),
      inprogress: cards.filter((card) => card.status === "inprogress"),
      done: cards.filter((card) => card.status === "done"),
    };
  }, [cards]);

  async function handleCreateCard(event) {
    event.preventDefault();

    if (!newTitle.trim()) {
      setError("Please enter a title.");
      return;
    }

    try {
      setSaving(true);
      setError("");

      const data = await apiFetch("/api/cards", {
        method: "POST",
        body: JSON.stringify({
          title: newTitle,
          description: newDescription,
          status: newStatus,
        }),
      });

      setCards((prev) => [...prev, data.card]);
      setNewTitle("");
      setNewDescription("");
      setNewStatus("todo");
    } catch (err) {
      setError(err.message || "Failed to create card.");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(card) {
    setEditingId(card.id);
    setEditTitle(card.title);
    setEditDescription(card.description || "");
    setEditStatus(card.status);
    setError("");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditTitle("");
    setEditDescription("");
    setEditStatus("todo");
  }

  async function handleSaveEdit(id) {
    if (!editTitle.trim()) {
      setError("Please enter a title.");
      return;
    }

    try {
      setSaving(true);
      setError("");

      const data = await apiFetch(`/api/cards/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          title: editTitle,
          description: editDescription,
          status: editStatus,
        }),
      });

      setCards((prev) =>
        prev.map((card) => (card.id === id ? data.card : card))
      );

      cancelEdit();
    } catch (err) {
      setError(err.message || "Failed to update card.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    const confirmed = window.confirm("Delete this card?");
    if (!confirmed) return;

    try {
      setSaving(true);
      setError("");

      await apiFetch(`/api/cards/${id}`, {
        method: "DELETE",
      });

      setCards((prev) => prev.filter((card) => card.id !== id));
    } catch (err) {
      setError(err.message || "Failed to delete card.");
    } finally {
      setSaving(false);
    }
  }

  async function moveCard(card, direction) {
    const currentIndex = COLUMN_ORDER.indexOf(card.status);
    const newIndex = currentIndex + direction;

    if (newIndex < 0 || newIndex >= COLUMN_ORDER.length) {
      return;
    }

    const newStatus = COLUMN_ORDER[newIndex];

    try {
      setSaving(true);
      setError("");

      const data = await apiFetch(`/api/cards/${card.id}`, {
        method: "PUT",
        body: JSON.stringify({
          title: card.title,
          description: card.description || "",
          status: newStatus,
        }),
      });

      setCards((prev) =>
        prev.map((item) => (item.id === card.id ? data.card : item))
      );
    } catch (err) {
      setError(err.message || "Failed to move card.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={appStyle}>
      <div style={pageWidthStyle}>
        <h1 style={titleStyle}>Kanban Board</h1>
        <p style={subtitleStyle}>
          Cloudflare Pages, Functions, and D1 backend connected.
        </p>

        <div style={panelStyle}>
          <h2 style={{ marginTop: 0 }}>Add Card</h2>

          <form onSubmit={handleCreateCard} style={formRowStyle}>
            <input
              style={inputStyle}
              type="text"
              placeholder="Card title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
            />

            <input
              style={inputStyle}
              type="text"
              placeholder="Description"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
            />

            <select
              style={inputStyle}
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
            >
              <option value="todo">To Do</option>
              <option value="inprogress">In Progress</option>
              <option value="done">Done</option>
            </select>

            <button type="submit" style={primaryButtonStyle} disabled={saving}>
              {saving ? "Saving..." : "Add Card"}
            </button>
          </form>
        </div>

        {error ? (
          <div
            style={{
              ...panelStyle,
              background: "#451a1a",
              border: "1px solid #7f1d1d",
            }}
          >
            <strong>Error:</strong> {error}
          </div>
        ) : null}

        {loading ? (
          <div style={panelStyle}>Loading cards...</div>
        ) : (
          <div style={columnsStyle}>
            {COLUMN_ORDER.map((status) => (
              <div key={status} style={columnStyle}>
                <h2 style={columnTitleStyle}>{COLUMN_TITLES[status]}</h2>

                {cardsByColumn[status].length === 0 ? (
                  <p style={{ color: "#94a3b8" }}>No cards yet.</p>
                ) : null}

                {cardsByColumn[status].map((card) => {
                  const isEditing = editingId === card.id;

                  return (
                    <div key={card.id} style={cardStyle}>
                      {isEditing ? (
                        <>
                          <input
                            style={{ ...inputStyle, marginBottom: "8px" }}
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                          />

                          <textarea
                            style={{
                              ...inputStyle,
                              marginBottom: "8px",
                              minHeight: "80px",
                              resize: "vertical",
                            }}
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                          />

                          <select
                            style={{ ...inputStyle, marginBottom: "10px" }}
                            value={editStatus}
                            onChange={(e) => setEditStatus(e.target.value)}
                          >
                            <option value="todo">To Do</option>
                            <option value="inprogress">In Progress</option>
                            <option value="done">Done</option>
                          </select>

                          <div style={buttonRowStyle}>
                            <button
                              style={primaryButtonStyle}
                              onClick={() => handleSaveEdit(card.id)}
                              disabled={saving}
                            >
                              Save
                            </button>
                            <button
                              style={smallButtonStyle}
                              onClick={cancelEdit}
                              disabled={saving}
                            >
                              Cancel
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <h3 style={cardTitleStyle}>{card.title}</h3>
                          <p style={cardTextStyle}>
                            {card.description || "No description"}
                          </p>
                          <div style={metaStyle}>
                            Card #{card.id}
                            {card.created_at ? ` • ${card.created_at}` : ""}
                          </div>

                          <div style={buttonRowStyle}>
                            <button
                              style={smallButtonStyle}
                              onClick={() => moveCard(card, -1)}
                              disabled={saving || status === "todo"}
                            >
                              Move Left
                            </button>

                            <button
                              style={smallButtonStyle}
                              onClick={() => moveCard(card, 1)}
                              disabled={saving || status === "done"}
                            >
                              Move Right
                            </button>

                            <button
                              style={smallButtonStyle}
                              onClick={() => startEdit(card)}
                              disabled={saving}
                            >
                              Edit
                            </button>

                            <button
                              style={dangerButtonStyle}
                              onClick={() => handleDelete(card.id)}
                              disabled={saving}
                            >
                              Delete
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;