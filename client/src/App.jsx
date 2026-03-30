import React, { useEffect, useMemo, useState } from 'react';
import { initializeDiscord } from './discord';
import { owners } from './data';

const STATUS_LABELS = {
  todo: 'Backlog',
  inprogress: 'In Progress',
  testing: 'Testing',
  done: 'Approval',
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
  const [currentUserName] = useState('User');
  const [currentChannelId, setCurrentChannelId] = useState('global');
  const [discordState, setDiscordState] = useState({
    enabled: false,
    message: 'Checking Discord Activity environment...',
  });

  useEffect(() => {
    initializeDiscord().then((state) => {
      setDiscordState(state);
      setCurrentChannelId(state?.channelId || 'global');
    });
  }, []);

  useEffect(() => {
    if (currentChannelId) {
      loadTasks(currentChannelId);
    }
  }, [currentChannelId]);

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
      is_approved: Boolean(card.is_approved),
      channel_id: card.channel_id || 'global',
      created_at: card.created_at || '',
    };
  }

  function formatTimestamp() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');

    let hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';

    hours = hours % 12;
    if (hours === 0) hours = 12;

    return `${year}-${month}-${day} ${hours}:${minutes} ${ampm}`;
  }

  function makeSystemComment(message) {
    return `[${formatTimestamp()}] ${currentUserName}: ${message}`;
  }

  function makeUserComment(message) {
    return `[${formatTimestamp()}] ${currentUserName}: ${message}`;
  }

  function getStatusLabel(status) {
    return STATUS_LABELS[status] || status;
  }

  function buildFieldChangeComments(originalTask, updatedTask) {
    const auditComments = [];

    if (originalTask.title !== updatedTask.title) {
      auditComments.push(
        makeSystemComment(`Title changed from "${originalTask.title}" to "${updatedTask.title}"`)
      );
    }

    if (originalTask.description !== updatedTask.description) {
      auditComments.push(makeSystemComment('Description was updated'));
    }

    if (originalTask.owner !== updatedTask.owner) {
      auditComments.push(
        makeSystemComment(`Owner changed from ${originalTask.owner} to ${updatedTask.owner}`)
      );
    }

    if (originalTask.priority !== updatedTask.priority) {
      auditComments.push(
        makeSystemComment(`Priority changed from ${originalTask.priority} to ${updatedTask.priority}`)
      );
    }

    if (originalTask.status !== updatedTask.status) {
      auditComments.push(
        makeSystemComment(
          `Column changed from ${getStatusLabel(originalTask.status)} to ${getStatusLabel(updatedTask.status)}`
        )
      );
    }

    if (!originalTask.is_approved && updatedTask.is_approved) {
      auditComments.push(makeSystemComment('Card approved'));
    }

    if (originalTask.is_approved && !updatedTask.is_approved) {
      auditComments.push(makeSystemComment('Approval removed'));
    }

    return auditComments;
  }

  async function loadTasks(channelId) {
    try {
      setLoading(true);
      setError('');
      const data = await apiFetch(`/api/cards?channel_id=${encodeURIComponent(channelId)}`);
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
    const originalTask = tasks.find((task) => task.id === updatedTask.id);
    if (!originalTask) return;

    try {
      setSaving(true);
      setError('');

      const originalComments = Array.isArray(originalTask.comments) ? originalTask.comments : [];
      const updatedComments = Array.isArray(updatedTask.comments) ? updatedTask.comments : [];

      const addedUserComments = updatedComments.slice(originalComments.length).map((comment) => {
        if (typeof comment === 'string' && comment.startsWith('[')) {
          return comment;
        }
        return makeUserComment(comment);
      });

      const finalComments = [
        ...originalComments,
        ...addedUserComments,
        ...buildFieldChangeComments(originalTask, updatedTask),
      ];

      const data = await apiFetch(`/api/cards/${updatedTask.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: updatedTask.title,
          description: updatedTask.description || '',
          status: updatedTask.status,
          owner: updatedTask.owner || 'Unassigned',
          priority: updatedTask.priority || 'Medium',
          comments: finalComments,
          is_approved: updatedTask.is_approved || false,
          channel_id: currentChannelId,
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

      await apiFetch(`/api/cards/${taskId}?channel_id=${encodeURIComponent(currentChannelId)}`, {
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
    if (!task || task.is_approved) return;

    const currentIndex = STATUS_ORDER.indexOf(task.status);
    const nextIndex = Math.min(
      STATUS_ORDER.length - 1,
      Math.max(0, currentIndex + direction)
    );

    if (nextIndex === currentIndex) return;

    const nextStatus = STATUS_ORDER[nextIndex];
    const finalComments = [
      ...(task.comments || []),
      makeSystemComment(`Column changed from ${getStatusLabel(task.status)} to ${getStatusLabel(nextStatus)}`),
    ];

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
          comments: finalComments,
          is_approved: false,
          channel_id: currentChannelId,
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

  async function approveTask(taskId) {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return;
    if (task.status !== 'done') return;
    if (task.is_approved) return;

    const finalComments = [
      ...(task.comments || []),
      makeSystemComment('Card approved'),
    ];

    try {
      setSaving(true);
      setError('');

      const data = await apiFetch(`/api/cards/${taskId}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: task.title,
          description: task.description || '',
          status: task.status,
          owner: task.owner || 'Unassigned',
          priority: task.priority || 'Medium',
          comments: finalComments,
          is_approved: true,
          channel_id: currentChannelId,
        }),
      });

      const savedTask = mapCardToTask(data.card);

      setTasks((current) =>
        current.map((item) => (item.id === savedTask.id ? savedTask : item))
      );
    } catch (err) {
      setError(err.message || 'Failed to approve card.');
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
          comments: [makeSystemComment('Card created')],
          is_approved: false,
          channel_id: currentChannelId,
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
          <p style={{ marginTop: '8px', fontSize: '12px', opacity: 0.8 }}>
            Channel: {currentChannelId}
          </p>
        </div>

        <div className="tip-panel">
          <h3>Current Scope</h3>
          <ul>
            <li>Cloudflare Pages frontend</li>
            <li>Pages Functions backend</li>
            <li>D1 card storage</li>
            <li>Approval workflow enabled</li>
            <li>Audit trail enabled</li>
            <li>Channel scoped board</li>
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
          {activeView === 'board' ? (
            <button className="primary-btn" onClick={createTask} disabled={saving}>
              {saving ? 'Working...' : '+ New Card'}
            </button>
          ) : null}
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
            onApproveTask={approveTask}
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

function BoardView({ groupedTasks, onOpenTask, onMoveTask, onApproveTask, onRequestDelete, saving }) {
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
                  onApproveTask={onApproveTask}
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

function TaskCard({ task, onOpenTask, onMoveTask, onApproveTask, onRequestDelete, saving }) {
  const isApprovalColumn = task.status === 'done';
  const isApproved = Boolean(task.is_approved);
  const isBacklog = task.status === 'todo';

  return (
    <article
      className="task-card"
      style={
        isApproved
          ? {
              background: '#132a1c',
              borderColor: '#2f6b45',
              boxShadow: '0 0 0 1px rgba(77, 163, 104, 0.15) inset',
            }
          : undefined
      }
    >
      <div className="task-card-top">
        <span
          className="priority-chip"
          style={
            isApproved
              ? {
                  background: '#1d4d2f',
                  color: '#d7f5df',
                  border: '1px solid #2f6b45',
                }
              : undefined
          }
        >
          {isApproved ? 'Approved' : task.priority}
        </span>
      </div>

      <h4 style={isApproved ? { color: '#f3fff6' } : undefined}>{task.title}</h4>
      <p style={isApproved ? { color: '#d7eede' } : undefined}>{task.description}</p>

      <div className="task-meta">
        <span>Owner: {task.owner}</span>
      </div>

      <div className="task-actions">
        {!isBacklog ? (
          <button
            onClick={() => onMoveTask(task.id, -1)}
            disabled={saving || isApproved}
          >
            Back
          </button>
        ) : (
          <div style={{ width: '64px' }} />
        )}

        <div className="task-actions-middle">
          <button onClick={() => onOpenTask(task)} disabled={saving}>
            Edit
          </button>
          <button
            className="delete-icon-btn"
            onClick={() => onRequestDelete(task)}
            title="Delete card"
            aria-label="Delete card"
            disabled={saving || isApproved}
          >
            🗑
          </button>
        </div>

        {isApprovalColumn ? (
          <button
            onClick={() => onApproveTask(task.id)}
            disabled={saving || isApproved}
          >
            {isApproved ? 'Approved' : 'Approve'}
          </button>
        ) : (
          <button
            onClick={() => onMoveTask(task.id, 1)}
            disabled={saving || isApproved}
          >
            Forward
          </button>
        )}
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
              disabled={saving || form.is_approved}
            />
          </label>

          <label>
            Description
            <textarea
              rows="4"
              value={form.description}
              onChange={(e) => updateField('description', e.target.value)}
              disabled={saving || form.is_approved}
            />
          </label>

          <div className="two-col">
            <label>
              Owner
              <select
                value={form.owner}
                onChange={(e) => updateField('owner', e.target.value)}
                disabled={saving || form.is_approved}
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
                disabled={saving || form.is_approved}
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
              disabled={saving || form.is_approved}
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
              <div
                style={{
                  maxHeight: '180px',
                  overflowY: 'auto',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '8px',
                  padding: '8px',
                  background: 'rgba(0,0,0,0.12)',
                }}
              >
                <ul style={{ margin: 0, paddingLeft: '18px' }}>
                  {(form.comments || []).map((comment, index) => (
                    <li key={index} style={{ marginBottom: '8px' }}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: '8px',
                          alignItems: 'flex-start',
                        }}
                      >
                        <span style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                          {comment}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeComment(index)}
                          disabled={saving || form.is_approved}
                        >
                          Remove
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="comment-entry">
              <input
                placeholder="Add a comment"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                disabled={saving || form.is_approved}
              />
              <button type="button" onClick={addComment} disabled={saving || form.is_approved}>
                Add
              </button>
            </div>
          </div>

          <div className="modal-actions">
            {!form.is_approved ? (
              <button type="button" onClick={handleDeleteClick} className="delete-btn" disabled={saving}>
                Delete Card
              </button>
            ) : (
              <div />
            )}
            <div className="action-group">
              <button type="button" onClick={onClose} className="secondary-btn" disabled={saving}>
                Cancel
              </button>
              <button type="submit" className="primary-btn" disabled={saving || form.is_approved}>
                {form.is_approved ? 'Approved' : saving ? 'Saving...' : 'Save Card'}
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