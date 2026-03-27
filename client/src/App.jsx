import React, { useEffect, useMemo, useState } from 'react';
import { initializeDiscord } from './discord';
import { initialTasks, owners } from './data';

const STATUSES = ['Backlog', 'In Progress', 'Testing', 'Approved'];

function App() {
  const [tasks, setTasks] = useState(initialTasks);
  const [activeView, setActiveView] = useState('board');
  const [selectedTask, setSelectedTask] = useState(null);
  const [discordState, setDiscordState] = useState({
    enabled: false,
    message: 'Checking Discord Activity environment...',
  });

  useEffect(() => {
    initializeDiscord().then(setDiscordState);
  }, []);

  const groupedTasks = useMemo(() => {
    return STATUSES.reduce((acc, status) => {
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

  function saveTask(updatedTask) {
    setTasks((current) =>
      current.map((task) => (task.id === updatedTask.id ? updatedTask : task))
    );
    setSelectedTask(updatedTask);
  }

  function deleteTask(taskId) {
    setTasks((current) => current.filter((task) => task.id !== taskId));
    setSelectedTask((current) => (current && current.id === taskId ? null : current));
  }

  function moveTask(taskId, direction) {
    setTasks((current) =>
      current.map((task) => {
        if (task.id !== taskId) return task;
        const currentIndex = STATUSES.indexOf(task.status);
        const nextIndex = Math.min(
          STATUSES.length - 1,
          Math.max(0, currentIndex + direction)
        );
        return { ...task, status: STATUSES[nextIndex] };
      })
    );
  }

  function createTask() {
    const nextId = tasks.length ? Math.max(...tasks.map((task) => task.id)) + 1 : 1;
    const newTask = {
      id: nextId,
      title: 'New Card',
      description: 'Describe the work here.',
      owner: 'Unassigned',
      status: 'Backlog',
      priority: 'Medium',
      comments: [],
    };
    setTasks((current) => [newTask, ...current]);
    setSelectedTask(newTask);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <img className="brand-icon" src="/kanban-icon.png" alt="Kanban Board icon" />
          <div>
            <h1>Kanban Board</h1>
            <p>Discord Activity</p>
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
          <h3>Starter Scope</h3>
          <ul>
            <li>Build the board first</li>
            <li>Use modal editing</li>
            <li>Use buttons for column changes</li>
            <li>Add integrations later</li>
          </ul>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <h2>Kanban Board</h2>
            <p>Track work items inside your Discord Activity.</p>
          </div>
          <button className="primary-btn" onClick={createTask}>
            + New Card
          </button>
        </header>

        {activeView === 'board' ? (
          <BoardView
            groupedTasks={groupedTasks}
            onOpenTask={openTask}
            onMoveTask={moveTask}
            onDeleteTask={deleteTask}
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
          onDelete={deleteTask}
          owners={owners}
        />
      )}
    </div>
  );
}

function BoardView({ groupedTasks, onOpenTask, onMoveTask, onDeleteTask }) {
  return (
    <section className="board-grid">
      {Object.entries(groupedTasks).map(([status, tasks]) => (
        <div key={status} className="column">
          <div className="column-header">
            <h3>{status}</h3>
            <span>{tasks.length}</span>
          </div>

          <div className="card-stack">
            {tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onOpenTask={onOpenTask}
                onMoveTask={onMoveTask}
                onDeleteTask={onDeleteTask}
              />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

function TaskCard({ task, onOpenTask, onMoveTask, onDeleteTask }) {
  function confirmDelete() {
    const confirmed = window.confirm(`Delete "${task.title}"?`);
    if (confirmed) {
      onDeleteTask(task.id);
    }
  }

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
        <button onClick={() => onMoveTask(task.id, -1)}>Back</button>

        <div className="task-actions-middle">
          <button onClick={() => onOpenTask(task)}>Edit</button>
          <button
            className="delete-icon-btn"
            onClick={confirmDelete}
            title="Delete card"
            aria-label="Delete card"
          >
            🗑
          </button>
        </div>

        <button onClick={() => onMoveTask(task.id, 1)}>Forward</button>
      </div>
    </article>
  );
}

function TaskModal({ task, onClose, onSave, onDelete, owners }) {
  const [form, setForm] = useState(task);
  const [commentText, setCommentText] = useState('');

  useEffect(() => {
    setForm(task);
  }, [task]);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function addComment() {
    if (!commentText.trim()) return;
    setForm((current) => ({
      ...current,
      comments: [...current.comments, commentText.trim()],
    }));
    setCommentText('');
  }

  function submit(e) {
    e.preventDefault();
    onSave(form);
    onClose();
  }

  function handleDelete() {
  const confirmed = window.confirm(`Delete "${form.title}"?`);
  if (confirmed) {
    onDelete(form.id);
    onClose();
  }
}

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-header">
          <h3>Edit Card</h3>
          <button className="close-btn" onClick={onClose}>
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
              </select>
            </label>

            <label>
              Column
              <select
                value={form.status}
                onChange={(e) => updateField('status', e.target.value)}
              >
                {STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
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
            {form.comments.length === 0 ? (
              <p className="empty-note">No comments yet.</p>
            ) : (
              <ul>
                {form.comments.map((comment, index) => (
                  <li key={index}>{comment}</li>
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
            <button type="button" onClick={handleDelete} className="delete-btn">
              Delete Card
            </button>
            <div className="action-group">
              <button type="button" onClick={onClose} className="secondary-btn">
                Cancel
              </button>
              <button type="submit" className="primary-btn">
                Save Card
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function SummaryView({ tasks }) {
  const done = tasks.filter((task) => task.status === 'Approved');
  const active = tasks.filter(
    (task) => task.status === 'In Progress' || task.status === 'Testing'
  );
  const nextUp = tasks.filter((task) => task.status === 'Backlog');

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