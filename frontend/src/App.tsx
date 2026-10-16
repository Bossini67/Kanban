import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";

type Status = "todo" | "doing" | "done";

type Card = {
  id: number;
  title: string;
  status: Status;
  created_at: string;
};

const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:8000").replace(
  /\/+$/,
  "",
);

const columns: { status: Status; title: string; subtitle: string }[] = [
  { status: "todo", title: "To do", subtitle: "Up next" },
  { status: "doing", title: "Doing", subtitle: "In progress" },
  { status: "done", title: "Done", subtitle: "Wrapped up" },
];

function isStatus(value: string): value is Status {
  return columns.some((column) => column.status === value);
}

async function readError(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => null);
  if (
    typeof body === "object" &&
    body !== null &&
    "detail" in body &&
    typeof body.detail === "string"
  ) {
    return body.detail;
  }
  return `Request failed (${response.status})`;
}

function App() {
  const [cards, setCards] = useState<Card[]>([]);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyCards, setBusyCards] = useState<number[]>([]);
  const [error, setError] = useState("");

  const loadCards = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API_URL}/cards`);
      if (!response.ok) {
        throw new Error(await readError(response));
      }
      const result: Card[] = await response.json();
      setCards(result);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not connect to the board. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCards();
  }, [loadCards]);

  async function addCard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle || saving) return;

    setSaving(true);
    setError("");
    try {
      const response = await fetch(`${API_URL}/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmedTitle }),
      });
      if (!response.ok) {
        throw new Error(await readError(response));
      }
      const created: Card = await response.json();
      setCards((current) => [...current, created]);
      setTitle("");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not add this task.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function moveCard(card: Card, status: Status) {
    if (card.status === status || busyCards.includes(card.id)) return;

    setBusyCards((current) => [...current, card.id]);
    setError("");
    try {
      const response = await fetch(`${API_URL}/cards/${card.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        throw new Error(await readError(response));
      }
      const updated: Card = await response.json();
      setCards((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not move this task.",
      );
    } finally {
      setBusyCards((current) => current.filter((id) => id !== card.id));
    }
  }

  async function deleteCard(card: Card) {
    if (busyCards.includes(card.id)) return;

    setBusyCards((current) => [...current, card.id]);
    setError("");
    try {
      const response = await fetch(`${API_URL}/cards/${card.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(await readError(response));
      }
      setCards((current) => current.filter((item) => item.id !== card.id));
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not delete this task.",
      );
    } finally {
      setBusyCards((current) => current.filter((id) => id !== card.id));
    }
  }

  const completedCount = cards.filter((card) => card.status === "done").length;

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Monday Board home">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </span>
          monday<span className="brand-light">board</span>
        </a>
        <span className="workspace-label">
          <span className="workspace-dot" />
          Personal workspace
        </span>
      </header>

      <section className="board-page">
        <div className="board-heading">
          <div>
            <p className="eyebrow">YOUR WORKSPACE / PROJECTS</p>
            <h1>My board</h1>
            <p className="board-caption">
              A little progress each day adds up to big results.
            </p>
          </div>
          <div className="progress-chip">
            <span className="progress-spark" aria-hidden="true">
              ✳
            </span>
            <span>
              <strong>{completedCount}</strong> {completedCount === 1 ? "task" : "tasks"}{" "}
              completed
            </span>
          </div>
        </div>

        <form className="add-task" onSubmit={addCard}>
          <span className="add-icon" aria-hidden="true">
            +
          </span>
          <input
            aria-label="New task title"
            placeholder="What needs to get done?"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={500}
          />
          <button
            className="add-button"
            type="submit"
            disabled={saving || !title.trim()}
          >
            {saving ? "Adding…" : "Add task"}
            <span aria-hidden="true">↵</span>
          </button>
        </form>

        {error && (
          <div className="error-banner" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => void loadCards()}>
              Retry
            </button>
          </div>
        )}

        <section className="columns" aria-label="Kanban board">
          {columns.map((column) => {
            const columnCards = cards.filter(
              (card) => card.status === column.status,
            );
            return (
              <section
                className={`board-column column-${column.status}`}
                key={column.status}
                aria-labelledby={`heading-${column.status}`}
              >
                <div className="column-heading">
                  <div className="column-title-wrap">
                    <span className="column-indicator" aria-hidden="true" />
                    <div>
                      <h2 id={`heading-${column.status}`}>{column.title}</h2>
                      <p>{column.subtitle}</p>
                    </div>
                  </div>
                  <span className="card-count">{columnCards.length}</span>
                </div>
                <div className="card-list">
                  {loading ? (
                    <div className="empty-state">Loading tasks…</div>
                  ) : columnCards.length === 0 ? (
                    <div className="empty-state">
                      <span aria-hidden="true">✳</span>
                      <p>Nothing here yet</p>
                    </div>
                  ) : (
                    columnCards.map((card) => (
                      <article className="task-card" key={card.id}>
                        <div className="task-card-top">
                          <span className="task-label">
                            {column.status === "done" ? "COMPLETE" : "TASK"}
                          </span>
                          <button
                            className="delete-button"
                            type="button"
                            aria-label={`Delete ${card.title}`}
                            title="Delete task"
                            disabled={busyCards.includes(card.id)}
                            onClick={() => void deleteCard(card)}
                          >
                            ×
                          </button>
                        </div>
                        <p className="task-title">{card.title}</p>
                        <div className="task-card-bottom">
                          <span className="task-date">
                            {new Date(card.created_at).toLocaleDateString(
                              undefined,
                              { month: "short", day: "numeric" },
                            )}
                          </span>
                          <label
                            className="visually-hidden"
                            htmlFor={`status-${card.id}`}
                          >
                            Move {card.title}
                          </label>
                          <select
                            id={`status-${card.id}`}
                            className="status-select"
                            value={card.status}
                            disabled={busyCards.includes(card.id)}
                            onChange={(event) => {
                              const value = event.target.value;
                              if (isStatus(value)) void moveCard(card, value);
                            }}
                          >
                            {columns.map((option) => (
                              <option key={option.status} value={option.status}>
                                {option.title}
                              </option>
                            ))}
                          </select>
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </section>
        <footer className="board-footer">
          <span>Make space for what matters.</span>
          <span>{cards.length} {cards.length === 1 ? "task" : "tasks"} on your board</span>
        </footer>
      </section>
    </main>
  );
}

export default App;
