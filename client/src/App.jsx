import React, { useEffect, useMemo, useState } from 'react';
import { initializeDiscord } from './discord';
import { owners } from './data';

const STATUS_LABELS = {
  todo: 'Backlog',
  inprogress: 'In Progress',
  testing: 'Testing',
  done: 'Approved',
};

const STATUS_ORDER = ['todo', 'inprogress', 'testing', 'done'];

function App() {
  const [tasks, setTasks] = useState([]);
  const [activeView, setActiveView] = useState('board');
  const [selectedTask, setSelectedTask] = useState(null);
  const [deleteCandidate, setDeleteCandidate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [discordState, setDiscordState] = useState({
    enabled: false,
    message: 'Checking Discord Activity environment...',
  });

  useEffect(() => {
    initializeDiscord().then(setDiscordState);
  }, []);

  useEffect(() => {
    loadTasks();
  }, []);

  async function apiFetch(url, options = {}) {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      ...options,
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Request failed.');
    }

    return data;
  }

  function mapCardToTask(card) {
    return {
      id: card.id,
      title: card.title,
      description: card.description || '',
      status: card.status,
      owner: card.owner || 'Unassigned',
      priority: card.priority || 'Medium',
      comments: Array.isArray(card.comments) ? card.comments : [],
      created_at: card.created_at || '',
    };
  }

  async function loadTasks() {
    try {
      setLoading(true);
      setError('');
      const data = await apiFetch('/api/cards');
      setTasks((data.cards || []).map(mapCardToTask));
    } catch (err) {
      setError(err.message || 'Failed to load cards.');
    } finally {
      setLoading(false);
    }
  }

  const groupedTasks = useMemo(() => {
    return STATUS_ORDER.reduce((acc, status) => {
      acc[status] = tasks.filter((task) => task.status === status);
      return acc;
    }, {});
  }, [tasks]);

  function openTask(task) {
    setSelectedTask(task);
  }

  function closeTask() {
    setSelectedTask(null);
  }

  async function saveTask(updatedTask) {
    try {
      setSaving(true);
      setError('');

      const data = await apiFetch(`/api/cards/${updatedTask.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: updatedTask.title,
          description: updatedTask.description || '',
          status: updatedTask.status,
          owner: updatedTask.owner || 'Unassigned',
          priority: updatedTask.priority || 'Medium',
          comments: updatedTask.comments || [],
        }),
      });

      const savedTask = mapCardToTask(data.card);

      setTasks((current) =>
        current.map((task) => (task.id === savedTask.id ? savedTask : task))
      );
      setSelectedTask(null);
    } catch (err) {
      setError(err.message || 'Failed to save card.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteTask(taskId) {
    try {
      setSaving(true);
      setError('');

      await apiFetch(`/api/cards/${taskId}`, {
        method: 'DELETE',
      });

      setTasks((current) => current.filter((task) => task.id !== taskId));
      setSelectedTask((current) => (current && current.id === taskId ? null : current));
    } catch (err) {
      setError(err.message || 'Failed to delete card.');
    } finally {
      setSaving(false);
    }
  }

  function requestDelete(task) {
    setDeleteCandidate(task);
  }

  function cancelDelete() {
    setDeleteCandidate(null);
  }

  function confirmDelete() {
    if (!deleteCandidate) return;
    deleteTask(deleteCandidate.id);
    setDeleteCandidate(null);
  }

  async function moveTask(taskId, direction) {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return;

    const currentIndex = STATUS_ORDER.indexOf(task.status);
    const nextIndex = Math.min(
      STATUS_ORDER.length - 1,
      Math.max(0, currentIndex + direction)
    );

    if (nextIndex === currentIndex) return;

    const nextStatus = STATUS_ORDER[nextIndex];

    try {
      setSaving(true);
      setError('');

      const data = await apiFetch(`/api/cards/${taskId}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: task.title,
          description: task.description || '',
          status: nextStatus,
          owner: task.owner || 'Unassigned',
          priority: task.priority || 'Medium',
          comments: task.comments || [],
        }),
      });

      const savedTask = mapCardToTask(data.card);

      setTasks((current) =>
        current.map((item) => (item.id === savedTask.id ? savedTask : item))
      );
    } catch (err) {
      setError(err.message || 'Failed to move card.');
    } finally {
      setSaving(false);
    }
  }

  async function createTask() {
    try {
      setSaving(true);
      setError('');

      const data = await apiFetch('/api/cards', {
        method: 'POST',
        body: JSON.stringify({
          title: 'New Card',
          description: 'Describe the work here.',
          status: 'todo',
          owner: 'Unassigned',
          priority: 'Medium',
          comments: [],
        }),
      });

      const newTask = mapCardToTask(data.card);

      setTasks((current) => [newTask, ...current]);
      setSelectedTask(newTask);
      setActiveView('board');
    } catch (err) {
      setError(err.message || 'Failed to create card.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <img className="brand-icon" src="/kanban-icon.png" alt="Kanban Board icon" />
          <div>
            <h1>Kanban Board</h1>
            <p>Discord Activity starter</p>
          </div>
        </div>

        <nav className="nav">
          <button
            className={activeView === 'board' ? 'nav-btn active' : 'nav-btn'}
            onClick={() => setActiveView('board')}
          >
            Board
          </button>
          <button
            className={activeView === 'summary' ? 'nav-btn active' : 'nav-btn'}
            onClick={() => setActiveView('summary')}
          >
            Team Summary
          </button>
        </nav>

        <div className="discord-panel">
          <h3>Discord Status</h3>
          <p>{discordState.message}</p>
        </div>

        <div className="tip-panel">
          <h3>Current Scope</h3>
          <ul>
            <li>Cloudflare Pages frontend</li>
            <li>Pages Functions backend</li>
            <li>D1 card storage</li>
            <li>Full task fields enabled</li>
          </ul>
        </div>

        {error ? (
          <div className="discord-panel" style={{ borderColor: '#7f1d1d' }}>
            <h3>Error</h3>
            <p>{error}</p>
          </div>
        ) : null}
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <h2>Kanban Board</h2>
            <p>Track work items inside your Discord Activity.</p>
          </div>
          <button className="primary-btn" onClick={createTask} disabled={saving}>
            {saving ? 'Working...' : '+ New Card'}
          </button>
        </header>

        {loading ? (
          <section className="summary-page">
            <div className="standup-card">
              <h3>Loading</h3>
              <p>Loading cards from the backend...</p>
            </div>
          </section>
        ) : activeView === 'board' ? (
          <BoardView
            groupedTasks={groupedTasks}
            onOpenTask={openTask}
            onMoveTask={moveTask}
            onRequestDelete={requestDelete}
            saving={saving}
          />
        ) : (
          <SummaryView tasks={tasks} />
        )}
      </main>

      {selectedTask && (
        <TaskModal
          task={selectedTask}
          onClose={closeTask}
          onSave={saveTask}
          onRequestDelete={requestDelete}
          saving={saving}
        />
      )}

      {deleteCandidate && (
        <DeleteConfirmModal
          task={deleteCandidate}
          onCancel={cancelDelete}
          onConfirm={confirmDelete}
          saving={saving}
        />
      )}
    </div>
  );
}

function BoardView({ groupedTasks, onOpenTask, onMoveTask, onRequestDelete, saving }) {
  return (
    <section className="board-grid">
      {STATUS_ORDER.map((status) => {
        const tasks = groupedTasks[status] || [];

        return (
          <div key={status} className="column">
            <div className="column-header">
              <h3>{STATUS_LABELS[status]}</h3>
              <span>{tasks.length}</span>
            </div>

            <div className="card-stack">
              {tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onOpenTask={onOpenTask}
                  onMoveTask={onMoveTask}
                  onRequestDelete={onRequestDelete}
                  saving={saving}
                />
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function TaskCard({ task, onOpenTask, onMoveTask, onRequestDelete, saving }) {
  return (
    <article className="task-card">
      <div className="task-card-top">
        <span className="priority-chip">{task.priority}</span>
      </div>

      <h4>{task.title}</h4>
      <p>{task.description}</p>

      <div className="task-meta">
        <span>Owner: {task.owner}</span>
      </div>

      <div className="task-actions">
        <button onClick={() => onMoveTask(task.id, -1)} disabled={saving || task.status === 'todo'}>
          Back
        </button>

        <div className="task-actions-middle">
          <button onClick={() => onOpenTask(task)} disabled={saving}>
            Edit
          </button>
          <button
            className="delete-icon-btn"
            onClick={() => onRequestDelete(task)}
            title="Delete card"
            aria-label="Delete card"
            disabled={saving}
          >
            🗑
          </button>
        </div>

        <button onClick={() => onMoveTask(task.id, 1)} disabled={saving || task.status === 'done'}>
          Forward
        </button>
      </div>
    </article>
  );
}

function TaskModal({ task, onClose, onSave, onRequestDelete, saving }) {
  const [form, setForm] = useState(task);
  const [commentText, setCommentText] = useState('');

  useEffect(() => {
    setForm(task);
    setCommentText('');
  }, [task]);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function addComment() {
    const trimmed = commentText.trim();
    if (!trimmed) return;

    setForm((current) => ({
      ...current,
      comments: [...(current.comments || []), trimmed],
    }));
    setCommentText('');
  }

  function removeComment(indexToRemove) {
    setForm((current) => ({
      ...current,
      comments: (current.comments || []).filter((_, index) => index !== indexToRemove),
    }));
  }

  function submit(e) {
    e.preventDefault();
    onSave(form);
  }

  function handleDeleteClick() {
    onClose();
    onRequestDelete(form);
  }

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-header">
          <h3>Edit Card</h3>
          <button className="close-btn" onClick={onClose} disabled={saving}>
            ×
          </button>
        </div>

        <form className="modal-form" onSubmit={submit}>
          <label>
            Title
            <input
              value={form.title}
              onChange={(e) => updateField('title', e.target.value)}
            />
          </label>

          <label>
            Description
            <textarea
              rows="4"
              value={form.description}
              onChange={(e) => updateField('description', e.target.value)}
            />
          </label>

          <div className="two-col">
            <label>
              Owner
              <select
                value={form.owner}
                onChange={(e) => updateField('owner', e.target.value)}
              >
                {owners.map((owner) => (
                  <option key={owner} value={owner}>
                    {owner}
                  </option>
                ))}
                {!owners.includes('Unassigned') ? (
                  <option value="Unassigned">Unassigned</option>
                ) : null}
              </select>
            </label>

            <label>
              Column
              <select
                value={form.status}
                onChange={(e) => updateField('status', e.target.value)}
              >
                {STATUS_ORDER.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label>
            Priority
            <select
              value={form.priority}
              onChange={(e) => updateField('priority', e.target.value)}
            >
              <option>High</option>
              <option>Medium</option>
              <option>Low</option>
            </select>
          </label>

          <div className="comments-panel">
            <h4>Comments</h4>
            {(form.comments || []).length === 0 ? (
              <p className="empty-note">No comments yet.</p>
            ) : (
              <ul>
                {(form.comments || []).map((comment, index) => (
                  <li key={index}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' }}>
                      <span>{comment}</span>
                      <button type="button" onClick={() => removeComment(index)}>
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="comment-entry">
              <input
                placeholder="Add a comment"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
              />
              <button type="button" onClick={addComment}>
                Add
              </button>
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" onClick={handleDeleteClick} className="delete-btn" disabled={saving}>
              Delete Card
            </button>
            <div className="action-group">
              <button type="button" onClick={onClose} className="secondary-btn" disabled={saving}>
                Cancel
              </button>
              <button type="submit" className="primary-btn" disabled={saving}>
                {saving ? 'Saving...' : 'Save Card'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeleteConfirmModal({ task, onCancel, onConfirm, saving }) {
  return (
    <div className="modal-backdrop">
      <div className="modal confirm-modal">
        <div className="modal-header">
          <h3>Delete Card</h3>
          <button className="close-btn" onClick={onCancel} disabled={saving}>
            ×
          </button>
        </div>

        <div className="modal-form">
          <p>
            Are you sure you want to delete <strong>{task.title}</strong>?
          </p>

          <div className="modal-actions">
            <button type="button" onClick={onCancel} className="secondary-btn" disabled={saving}>
              Cancel
            </button>
            <button type="button" onClick={onConfirm} className="delete-btn" disabled={saving}>
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryView({ tasks }) {
  const done = tasks.filter((task) => task.status === 'done');
  const active = tasks.filter(
    (task) => task.status === 'inprogress' || task.status === 'testing'
  );
  const nextUp = tasks.filter((task) => task.status === 'todo');

  return (
    <section className="summary-page">
      <div className="group2-edge-banner">
        <img src="/group2-banner-wide-thin.png" alt="Group 2 Team Summary banner" />
      </div>

      <section className="standup-layout">
        <SummaryCard title="Completed" subtitle="What finished recently" items={done} />
        <SummaryCard title="Active Work" subtitle="What the team is doing now" items={active} />
        <SummaryCard title="Next Up" subtitle="What should be pulled in next" items={nextUp} />
      </section>
    </section>
  );
}

function SummaryCard({ title, subtitle, items }) {
  return (
    <div className="standup-card">
      <h3>{title}</h3>
      <p>{subtitle}</p>
      {items.length === 0 ? (
        <p className="empty-note">No cards in this section.</p>
      ) : (
        <ul className="standup-list">
          {items.map((task) => (
            <li key={task.id}>
              <strong>{task.title}</strong>
              <span>{task.owner}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default App;