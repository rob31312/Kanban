import React, { useEffect, useMemo, useRef, useState } from 'react';
import { initializeDiscord, subscribeToParticipantsUpdate } from './discord';

const STATUS_LABELS = {
  todo: 'Backlog',
  inprogress: 'In Progress',
  testing: 'Testing',
  done: 'Approval',
};

const STATUS_ORDER = ['todo', 'inprogress', 'testing', 'done'];
const APP_VERSION = 'Kanban v2.0.0-beta.1';

const PRIORITY_SORT_ORDER = {
  High: 0,
  Medium: 1,
  Low: 2,
};

const TERMINAL_SORT_ORDER = {
  approved: 1,
  rejected: 2,
};

function getPriorityRank(priority) {
  return PRIORITY_SORT_ORDER[priority] ?? 99;
}

function isApprovedTask(task) {
  return Boolean(task?.is_approved);
}

function isRejectedTask(task) {
  return Boolean(task?.is_rejected);
}

function isLockedTask(task) {
  return isApprovedTask(task) || isRejectedTask(task);
}

function getAgeRank(task) {
  if (task?.created_at) {
    const parsed = new Date(task.created_at).getTime();
    if (Number.isFinite(parsed)) return parsed;
  }

  const numericId = Number(task?.id);
  if (Number.isFinite(numericId)) return numericId;

  return Number.MAX_SAFE_INTEGER;
}

function sortTasksForColumn(tasks) {
  return [...tasks].sort((a, b) => {
    const aLocked = isLockedTask(a);
    const bLocked = isLockedTask(b);

    if (aLocked !== bLocked) {
      return Number(aLocked) - Number(bLocked);
    }

    if (!aLocked && !bLocked) {
      const priorityDiff = getPriorityRank(a.priority) - getPriorityRank(b.priority);
      if (priorityDiff !== 0) return priorityDiff;
    }

    if (aLocked && bLocked) {
      const aTerminal = isApprovedTask(a) ? 'approved' : 'rejected';
      const bTerminal = isApprovedTask(b) ? 'approved' : 'rejected';
      const terminalDiff = (TERMINAL_SORT_ORDER[aTerminal] ?? 99) - (TERMINAL_SORT_ORDER[bTerminal] ?? 99);
      if (terminalDiff !== 0) return terminalDiff;
    }

    return getAgeRank(a) - getAgeRank(b);
  });
}

function App() {
  const [tasks, setTasks] = useState([]);
  const [activeView, setActiveView] = useState('board');
  const [selectedTask, setSelectedTask] = useState(null);
  const [deleteCandidate, setDeleteCandidate] = useState(null);
  const [approveCandidate, setApproveCandidate] = useState(null);
  const [rejectCandidate, setRejectCandidate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [currentUserName, setCurrentUserName] = useState('User');
  const [currentUserId, setCurrentUserId] = useState('');
  const [currentChannelId, setCurrentChannelId] = useState('global');
  const [boardMembers, setBoardMembers] = useState([]);
  const [resetRequested, setResetRequested] = useState(false);
  const [exportPackage, setExportPackage] = useState(null);
  const [pendingImportPackage, setPendingImportPackage] = useState(null);
  const [discordState, setDiscordState] = useState({
    enabled: false,
    message: 'Checking Discord Activity environment...',
  });

  const importInputRef = useRef(null);
  const noticeTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) {
        clearTimeout(noticeTimerRef.current);
      }
    };
  }, []);

  function showNotice(message) {
    if (noticeTimerRef.current) {
      clearTimeout(noticeTimerRef.current);
    }

    setNotice(message);

    noticeTimerRef.current = setTimeout(() => {
      setNotice('');
    }, 5000);
  }

  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};

    async function initDiscord() {
      const state = await initializeDiscord();

      if (cancelled) return;

      setDiscordState(state);
      setCurrentUserName(state?.displayName || 'User');
      setCurrentUserId(state?.currentUser?.id || '');

      const resolvedChannelId = state?.channelId || 'global';
      setCurrentChannelId(resolvedChannelId);

      const fallbackParticipants =
        Array.isArray(state?.participants) && state.participants.length > 0
          ? state.participants
          : state?.currentUser
            ? [
                {
                  id: String(state.currentUser.id),
                  username: state.currentUser.username || '',
                  global_name: state.currentUser.global_name || '',
                  avatar: state.currentUser.avatar || '',
                  display_name: state.displayName || 'User',
                },
              ]
            : [];

      if (fallbackParticipants.length > 0) {
        await syncBoardMembers(resolvedChannelId, fallbackParticipants);
      }

      unsubscribe = subscribeToParticipantsUpdate(async (participants) => {
        if (cancelled) return;

        const liveParticipants =
          Array.isArray(participants) && participants.length > 0
            ? participants
            : state?.currentUser
              ? [
                  {
                    id: String(state.currentUser.id),
                    username: state.currentUser.username || '',
                    global_name: state.currentUser.global_name || '',
                    avatar: state.currentUser.avatar || '',
                    display_name: state.displayName || 'User',
                  },
                ]
              : [];

        if (liveParticipants.length > 0) {
          await syncBoardMembers(resolvedChannelId, liveParticipants);
        }
      });
    }

    initDiscord();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (currentChannelId) {
      loadTasks(currentChannelId);
      loadBoardMembers(currentChannelId);
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

  async function loadBoardMembers(channelId) {
    try {
      const data = await apiFetch(`/api/board-members?channel_id=${encodeURIComponent(channelId)}`);
      setBoardMembers(Array.isArray(data.members) ? data.members : []);
    } catch (err) {
      console.warn('Failed to load board members:', err);
    }
  }

  async function syncBoardMembers(channelId, participants) {
    try {
      const data = await apiFetch('/api/board-members', {
        method: 'POST',
        body: JSON.stringify({
          channel_id: channelId,
          participants: Array.isArray(participants) ? participants : [],
        }),
      });

      setBoardMembers(Array.isArray(data.members) ? data.members : []);
    } catch (err) {
      console.warn('Failed to sync board members:', err);
    }
  }


function mapCardToTask(card) {
  const ownerName = card.owner_name || card.owner || 'Unassigned';

  return {
    id: card.id,
    title: card.title,
    description: card.description || '',
    status: card.status,
    owner: ownerName,
    owner_name: ownerName,
    owner_user_id: card.owner_user_id || '',
    created_by_name: card.created_by_name || '',
    created_by_user_id: card.created_by_user_id || '',
    priority: card.priority || 'Medium',
    comments: Array.isArray(card.comments) ? card.comments : [],
    is_approved: Boolean(card.is_approved),
    is_rejected: Boolean(card.is_rejected),
    rejection_reason: card.rejection_reason || '',
    rejected_at: card.rejected_at || '',
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
    return `[${formatTimestamp()}] [SYSTEM] ${currentUserName}: ${message}`;
  }

  function makeUserComment(message) {
    return `[${formatTimestamp()}] ${currentUserName}: ${message}`;
  }

  function getStatusLabel(status) {
    return STATUS_LABELS[status] || status;
  }


function buildFieldChangeComments(originalTask, updatedTask) {
  const auditComments = [];
  const originalOwner = originalTask.owner_name || originalTask.owner || 'Unassigned';
  const updatedOwner = updatedTask.owner_name || updatedTask.owner || 'Unassigned';

  if (originalTask.title !== updatedTask.title) {
    auditComments.push(
      makeSystemComment(`Title changed from "${originalTask.title}" to "${updatedTask.title}"`)
    );
  }

  if (originalTask.description !== updatedTask.description) {
    auditComments.push(makeSystemComment('Description was updated'));
  }

  if (originalOwner !== updatedOwner) {
    auditComments.push(
      makeSystemComment(`Owner changed from ${originalOwner} to ${updatedOwner}`)
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

  if (!originalTask.is_rejected && updatedTask.is_rejected) {
    auditComments.push(makeSystemComment('Card rejected'));
  }

  if (originalTask.is_rejected && !updatedTask.is_rejected) {
    auditComments.push(makeSystemComment('Rejection removed'));
  }

  if (
    updatedTask.is_rejected &&
    originalTask.rejection_reason !== updatedTask.rejection_reason &&
    updatedTask.rejection_reason
  ) {
    auditComments.push(makeSystemComment(`Rejection reason set: ${updatedTask.rejection_reason}`));
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
      acc[status] = sortTasksForColumn(tasks.filter((task) => task.status === status));
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
          owner: updatedTask.owner_name || 'Unassigned',
          owner_name: updatedTask.owner_name || 'Unassigned',
          owner_user_id: updatedTask.owner_user_id || '',
          priority: updatedTask.priority || 'Medium',
          comments: finalComments,
          is_approved: updatedTask.is_approved || false,
          is_rejected: updatedTask.is_rejected || false,
          rejection_reason: updatedTask.rejection_reason || '',
          rejected_at: updatedTask.rejected_at || null,
          channel_id: currentChannelId,
        }),
      });

      const savedTask = mapCardToTask(data.card);

      setTasks((current) =>
        current.map((task) => (task.id === savedTask.id ? savedTask : task))
      );
      setSelectedTask(null);
      showNotice('Card saved.');
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
      showNotice('Card deleted.');
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
  if (!task || isLockedTask(task)) return;

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
        owner: task.owner_name || 'Unassigned',
        owner_name: task.owner_name || 'Unassigned',
        owner_user_id: task.owner_user_id || '',
        priority: task.priority || 'Medium',
        comments: finalComments,
        is_approved: false,
        is_rejected: false,
        rejection_reason: '',
        rejected_at: null,
        channel_id: currentChannelId,
      }),
    });

    const savedTask = mapCardToTask(data.card);

    setTasks((current) =>
      current.map((item) => (item.id === savedTask.id ? savedTask : item))
    );
    showNotice(`Card moved to ${getStatusLabel(nextStatus)}.`);
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
          owner: task.owner_name || 'Unassigned',
          owner_name: task.owner_name || 'Unassigned',
          owner_user_id: task.owner_user_id || '',
          priority: task.priority || 'Medium',
          comments: finalComments,
          is_approved: true,
          is_rejected: false,
          rejection_reason: '',
          rejected_at: null,
          channel_id: currentChannelId,
        }),
      });

      const savedTask = mapCardToTask(data.card);

      setTasks((current) =>
        current.map((item) => (item.id === savedTask.id ? savedTask : item))
      );
      showNotice('Card approved.');
    } catch (err) {
      setError(err.message || 'Failed to approve card.');
    } finally {
      setSaving(false);
    }
  }

  function requestApprove(task) {
    setApproveCandidate(task);
  }

  function cancelApprove() {
    setApproveCandidate(null);
  }


async function confirmApprove() {
  if (!approveCandidate) return;
  await approveTask(approveCandidate.id);
  setApproveCandidate(null);
}

function requestReject(task) {
  setRejectCandidate(task);
}

function cancelReject() {
  setRejectCandidate(null);
}

async function rejectTask(taskId, reason) {
  const task = tasks.find((item) => item.id === taskId);
  if (!task) return;
  if (task.status !== 'todo') return;
  if (isLockedTask(task)) return;

  const trimmedReason = String(reason || '').trim();
  const finalComments = [
    ...(task.comments || []),
    makeSystemComment(trimmedReason ? `Card rejected: ${trimmedReason}` : 'Card rejected'),
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
        owner: task.owner_name || 'Unassigned',
        owner_name: task.owner_name || 'Unassigned',
        owner_user_id: task.owner_user_id || '',
        priority: task.priority || 'Medium',
        comments: finalComments,
        is_approved: false,
        is_rejected: true,
        rejection_reason: trimmedReason,
        rejected_at: new Date().toISOString(),
        channel_id: currentChannelId,
      }),
    });

    const savedTask = mapCardToTask(data.card);
    setTasks((current) =>
      current.map((item) => (item.id === savedTask.id ? savedTask : item))
    );
    showNotice('Card rejected.');
  } catch (err) {
    setError(err.message || 'Failed to reject card.');
  } finally {
    setSaving(false);
  }
}

async function confirmReject(reason) {
  if (!rejectCandidate) return;
  await rejectTask(rejectCandidate.id, reason);
  setRejectCandidate(null);
}

async function reopenTask(taskId) {
  const task = tasks.find((item) => item.id === taskId);
  if (!task || !task.is_rejected) return;

  const finalComments = [
    ...(task.comments || []),
    makeSystemComment('Card reopened'),
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
        owner: task.owner_name || 'Unassigned',
        owner_name: task.owner_name || 'Unassigned',
        owner_user_id: task.owner_user_id || '',
        priority: task.priority || 'Medium',
        comments: finalComments,
        is_approved: false,
        is_rejected: false,
        rejection_reason: '',
        rejected_at: null,
        channel_id: currentChannelId,
      }),
    });

    const savedTask = mapCardToTask(data.card);
    setTasks((current) =>
      current.map((item) => (item.id === savedTask.id ? savedTask : item))
    );
    showNotice('Card reopened.');
  } catch (err) {
    setError(err.message || 'Failed to reopen card.');
  } finally {
    setSaving(false);
  }
}

function resetCurrentBoard() {    setResetRequested(true);
  }

  function cancelResetBoard() {
    setResetRequested(false);
  }

  async function confirmResetBoard() {
    try {
      setSaving(true);
      setError('');

      await apiFetch('/api/cards/reset', {
        method: 'POST',
        body: JSON.stringify({
          channel_id: currentChannelId,
        }),
      });

      setTasks([]);
      setSelectedTask(null);
      setDeleteCandidate(null);
      setApproveCandidate(null);
      setRejectCandidate(null);
      setResetRequested(false);
      showNotice('Board reset complete.');
    } catch (err) {
      setError(err.message || 'Failed to reset board.');
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
          owner: currentUserName || 'Unassigned',
          owner_name: currentUserName || 'Unassigned',
          owner_user_id: currentUserId || '',
          priority: 'Medium',
          comments: [makeSystemComment('Card created')],
          is_approved: false,
          is_rejected: false,
          rejection_reason: '',
          rejected_at: null,
          channel_id: currentChannelId,
        }),
      });

      const newTask = mapCardToTask(data.card);

      setTasks((current) => [newTask, ...current]);
      setSelectedTask(newTask);
      setActiveView('board');
      showNotice('Card created.');
    } catch (err) {
      setError(err.message || 'Failed to create card.');
    } finally {
      setSaving(false);
    }
  }

  async function exportBoard() {
    try {
      setSaving(true);
      setError('');

      const data = await apiFetch(
        `/api/cards/export?channel_id=${encodeURIComponent(currentChannelId)}`
      );

      const safeChannel = String(currentChannelId || 'global').replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `kanban-board-${safeChannel}.json`;

      setExportPackage({
        filename,
        text: JSON.stringify(data, null, 2),
      });

      showNotice('Board export prepared. Manually copy the JSON from the modal and save it as a .json file.');
    } catch (err) {
      setError(err.message || 'Failed to export board.');
    } finally {
      setSaving(false);
    }
  }

  function triggerImportPicker() {
    if (saving) return;
    importInputRef.current?.click();
  }

  async function handleImportFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) return;

    try {
      setSaving(true);
      setError('');

      const rawText = await file.text();
      const parsed = JSON.parse(rawText);
      const importedCards = Array.isArray(parsed?.cards) ? parsed.cards : null;

      if (!importedCards) {
        throw new Error('Import file is missing a cards array.');
      }

      setPendingImportPackage({
        filename: file.name || 'import.json',
        cards: importedCards,
      });

      showNotice(`Import file loaded: ${file.name || 'import.json'}. Confirm to replace the current board.`);
    } catch (err) {
      setError(err.message || 'Failed to read import file.');
    } finally {
      setSaving(false);
    }
  }

  function cancelImportBoard() {
    setPendingImportPackage(null);
  }

  async function confirmImportBoard() {
    if (!pendingImportPackage) return;

    try {
      setSaving(true);
      setError('');

      const data = await apiFetch('/api/cards/import', {
        method: 'POST',
        body: JSON.stringify({
          channel_id: currentChannelId,
          replace: true,
          cards: pendingImportPackage.cards,
        }),
      });

      setTasks((data.cards || []).map(mapCardToTask));
      setSelectedTask(null);
      setDeleteCandidate(null);
      setApproveCandidate(null);
      setRejectCandidate(null);
      setResetRequested(false);
      setPendingImportPackage(null);
      setActiveView('board');
      showNotice(`Imported ${data.imported_count || pendingImportPackage.cards.length} cards.`);
    } catch (err) {
      setError(err.message || 'Failed to import board.');
    } finally {
      setSaving(false);
    }
  }

  function closeExportModal() {
    setExportPackage(null);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <img className="brand-icon" src="/kanban-icon.png" alt="Kanban Board icon" />
          <div>
            <h1>Kanban Activity</h1>
            <p>{APP_VERSION}</p>
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
          <p style={{ marginTop: '8px', fontSize: '12px', opacity: 0.8 }}>
            User Auth: {discordState.authStatus || 'unknown'}
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
            <li>Dynamic board members</li>
          </ul>
        </div>

        {notice ? (
          <div className="discord-panel" style={{ borderColor: '#1d4ed8' }}>
            <h3>Notice</h3>
            <p>{notice}</p>
          </div>
        ) : null}

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
            <h2>Kanban Activity</h2>
            <p>Track work items inside your Discord Activity.</p>
            <p style={{ marginTop: '6px', fontSize: '12px', opacity: 0.75 }}>
              {APP_VERSION}
            </p>
          </div>

          {activeView === 'board' ? (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                className="secondary-btn"
                onClick={() => loadTasks(currentChannelId)}
                disabled={saving || loading}
              >
                {loading ? 'Refreshing...' : 'Refresh Board'}
              </button>
              <button className="primary-btn" onClick={createTask} disabled={saving}>
                {saving ? 'Working...' : '+ New Card'}
              </button>
            </div>
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
            onRequestApprove={requestApprove}
            onRequestReject={requestReject}
            onReopenTask={reopenTask}
            onRequestDelete={requestDelete}
            saving={saving}
          />
        ) : (
          <SummaryView
            tasks={tasks}
            onResetBoard={resetCurrentBoard}
            onExportBoard={exportBoard}
            onImportBoard={triggerImportPicker}
            onImportFileChange={handleImportFileChange}
            importInputRef={importInputRef}
            saving={saving}
          />
        )}
      </main>

      {selectedTask && (
        <TaskModal
          task={selectedTask}
          boardMembers={boardMembers}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          onClose={closeTask}
          onSave={saveTask}
          onRequestDelete={requestDelete}
          onReopenTask={reopenTask}
          saving={saving}
        />
      )}

      {approveCandidate && (
        <ApproveConfirmModal
          task={approveCandidate}
          onCancel={cancelApprove}
          onConfirm={confirmApprove}
          saving={saving}
        />
      )}

      {rejectCandidate && (
        <RejectConfirmModal
          task={rejectCandidate}
          onCancel={cancelReject}
          onConfirm={confirmReject}
          saving={saving}
        />
      )}

      {resetRequested && (
        <ResetBoardConfirmModal
          onCancel={cancelResetBoard}
          onConfirm={confirmResetBoard}
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

      {exportPackage && (
        <ExportBoardModal
          exportPackage={exportPackage}
          onClose={closeExportModal}
        />
      )}

      {pendingImportPackage && (
        <ImportBoardConfirmModal
          filename={pendingImportPackage.filename}
          cardCount={pendingImportPackage.cards.length}
          onCancel={cancelImportBoard}
          onConfirm={confirmImportBoard}
          saving={saving}
        />
      )}
    </div>
  );
}


function BoardView({
  groupedTasks,
  onOpenTask,
  onMoveTask,
  onRequestApprove,
  onRequestReject,
  onReopenTask,
  onRequestDelete,
  saving,
}) {
  return (
    <section className="board-stage">
      <div className="board-grid">
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
                    onRequestApprove={onRequestApprove}
                    onRequestReject={onRequestReject}
                    onReopenTask={onReopenTask}
                    onRequestDelete={onRequestDelete}
                    saving={saving}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}


function TaskCard({
  task,
  onOpenTask,
  onMoveTask,
  onRequestApprove,
  onRequestReject,
  onReopenTask,
  onRequestDelete,
  saving,
}) {
  const isApprovalColumn = task.status === 'done';
  const isApproved = Boolean(task.is_approved);
  const isRejected = Boolean(task.is_rejected);
  const isLocked = isApproved || isRejected;
  const isBacklog = task.status === 'todo';

  const cardStyle = isApproved
    ? {
        background: '#132a1c',
        borderColor: '#2f6b45',
        boxShadow: '0 0 0 1px rgba(77, 163, 104, 0.15) inset',
      }
    : isRejected
      ? {
          background: '#2a1b1b',
          borderColor: '#7b3f3f',
          boxShadow: '0 0 0 1px rgba(170, 92, 92, 0.15) inset',
        }
      : undefined;

  const chipStyle = isApproved
    ? {
        background: '#1d4d2f',
        color: '#d7f5df',
        border: '1px solid #2f6b45',
      }
    : isRejected
      ? {
          background: '#5a2b2b',
          color: '#ffe4e4',
          border: '1px solid #7b3f3f',
        }
      : undefined;

  const titleStyle = isApproved
    ? { color: '#f3fff6' }
    : isRejected
      ? { color: '#fff2f2' }
      : {};

  const textStyle = isApproved
    ? { color: '#d7eede' }
    : isRejected
      ? { color: '#f0d9d9' }
      : {};

  return (
    <article className="task-card" style={cardStyle}>
      <div className="task-card-top" style={{ marginBottom: '10px' }}>
        <span className="priority-chip" style={chipStyle}>
          {isApproved ? 'Approved' : isRejected ? 'Rejected' : task.priority}
        </span>
      </div>

      <h4
        style={{
          ...titleStyle,
          marginTop: 0,
          marginBottom: '8px',
          overflowWrap: 'anywhere',
          wordBreak: 'break-word',
          whiteSpace: 'pre-wrap',
        }}
      >
        {task.title}
      </h4>

      <p
        style={{
          ...textStyle,
          overflowWrap: 'anywhere',
          wordBreak: 'break-word',
          whiteSpace: 'pre-wrap',
        }}
      >
        {task.description}
      </p>

      <div className="task-meta">
        <span>Owner: {task.owner_name || task.owner || 'Unassigned'}</span>
      </div>

      {isRejected && task.rejection_reason ? (
        <div className="task-meta" style={{ marginTop: '6px' }}>
          <span>Reason: {task.rejection_reason}</span>
        </div>
      ) : null}

      <div className="task-actions">
        {isBacklog ? (
          isRejected ? (
            <button onClick={() => onReopenTask(task.id)} disabled={saving}>Reopen</button>
          ) : (
            <button onClick={() => onRequestReject(task)} disabled={saving || isLocked}>Reject</button>
          )
        ) : (
          <button onClick={() => onMoveTask(task.id, -1)} disabled={saving || isLocked}>Back</button>
        )}

        <div className="task-actions-middle">
          <button onClick={() => onOpenTask(task)} disabled={saving}>Edit</button>
          <button
            className="delete-icon-btn"
            onClick={() => onRequestDelete(task)}
            title="Delete card"
            aria-label="Delete card"
            disabled={saving || isLocked}
          >
            🗑
          </button>
        </div>

        {isApprovalColumn ? (
          <button
            onClick={() => onRequestApprove(task)}
            disabled={saving || isLocked}
          >
            {isApproved ? 'Approved' : 'Approve'}
          </button>
        ) : (
          <button
            onClick={() => onMoveTask(task.id, 1)}
            disabled={saving || isLocked}
          >
            Forward
          </button>
        )}
      </div>
    </article>
  );
}


function TaskModal({
  task,
  boardMembers,
  currentUserId,
  currentUserName,
  onClose,
  onSave,
  onRequestDelete,
  onReopenTask,
  saving,
}) {
  const [form, setForm] = useState(task);
  const [commentText, setCommentText] = useState('');
  const [showSystemComments, setShowSystemComments] = useState(false);

  useEffect(() => {
    setForm(task);
    setCommentText('');
    setShowSystemComments(false);
  }, [task]);

  const isApproved = Boolean(form.is_approved);
  const isRejected = Boolean(form.is_rejected);
  const isLocked = isApproved || isRejected;

  const memberOptions = useMemo(() => {
    const base = [...(boardMembers || [])].sort((a, b) => {
      if (a.is_current_participant !== b.is_current_participant) {
        return Number(b.is_current_participant) - Number(a.is_current_participant);
      }
      return (a.display_name || '').localeCompare(b.display_name || '');
    });

    const hasCurrentUser =
      currentUserId &&
      base.some((member) => member.discord_user_id === currentUserId);

    if (!hasCurrentUser && currentUserId) {
      base.unshift({
        discord_user_id: currentUserId,
        display_name: currentUserName || 'User',
        is_current_participant: true,
      });
    }

    return base;
  }, [boardMembers, currentUserId, currentUserName]);

  const selectValue = useMemo(() => {
    if (form.owner_user_id) return form.owner_user_id;

    if (form.owner_name && form.owner_name !== 'Unassigned') {
      return `legacy:${form.owner_name}`;
    }

    return '';
  }, [form.owner_user_id, form.owner_name]);

  const visibleComments = useMemo(() => {
    return (form.comments || [])
      .map((comment, index) => ({ comment, index }))
      .filter(({ comment }) => showSystemComments || !isSystemComment(comment));
  }, [form.comments, showSystemComments]);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function assignToMe() {
    const ownerName = currentUserName || 'User';

    setForm((current) => ({
      ...current,
      owner: ownerName,
      owner_name: ownerName,
      owner_user_id: currentUserId || '',
    }));
  }

  function unassign() {
    setForm((current) => ({
      ...current,
      owner: 'Unassigned',
      owner_name: 'Unassigned',
      owner_user_id: '',
    }));
  }

  function handleOwnerChange(value) {
    if (!value) {
      unassign();
      return;
    }

    if (value.startsWith('legacy:')) {
      const legacyName = value.replace('legacy:', '');
      setForm((current) => ({
        ...current,
        owner: legacyName,
        owner_name: legacyName,
        owner_user_id: '',
      }));
      return;
    }

    const selectedMember = memberOptions.find(
      (member) => member.discord_user_id === value
    );

    if (!selectedMember) {
      unassign();
      return;
    }

    setForm((current) => ({
      ...current,
      owner: selectedMember.display_name,
      owner_name: selectedMember.display_name,
      owner_user_id: selectedMember.discord_user_id,
    }));
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

  function handleReopenClick() {
    onClose();
    onReopenTask(form.id);
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
          {isRejected ? (
            <div className="discord-panel" style={{ borderColor: '#7b3f3f', marginBottom: '8px' }}>
              <h3 style={{ marginTop: 0 }}>Rejected</h3>
              <p>{form.rejection_reason || 'No rejection reason was provided.'}</p>
            </div>
          ) : null}

          {isApproved ? (
            <div className="discord-panel" style={{ borderColor: '#2f6b45', marginBottom: '8px' }}>
              <h3 style={{ marginTop: 0 }}>Approved</h3>
              <p>This card is locked because it has already been approved.</p>
            </div>
          ) : null}

          <label>
            Title
            <input
              value={form.title}
              onChange={(e) => updateField('title', e.target.value)}
              disabled={saving || isLocked}
              maxLength={120}
            />
          </label>

          <label>
            Description
            <textarea
              rows="4"
              value={form.description}
              onChange={(e) => updateField('description', e.target.value)}
              disabled={saving || isLocked}
              maxLength={2000}
            />
          </label>

          <div className="two-col">
            <label>
              Owner
              <select
                value={selectValue}
                onChange={(e) => handleOwnerChange(e.target.value)}
                disabled={saving || isLocked}
              >
                <option value="">Unassigned</option>

                {!form.owner_user_id &&
                form.owner_name &&
                form.owner_name !== 'Unassigned' ? (
                  <option value={`legacy:${form.owner_name}`}>
                    {form.owner_name} • legacy
                  </option>
                ) : null}

                {memberOptions.map((member) => (
                  <option key={member.discord_user_id} value={member.discord_user_id}>
                    {member.display_name}
                    {member.is_current_participant ? ' • active now' : ''}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Column
              <select
                value={form.status}
                onChange={(e) => updateField('status', e.target.value)}
                disabled={saving || isLocked}
              >
                {STATUS_ORDER.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div style={{ display: 'flex', gap: '8px', marginTop: '-8px', marginBottom: '8px' }}>
            <button
              type="button"
              className="secondary-btn"
              onClick={assignToMe}
              disabled={saving || isLocked || !currentUserId}
            >
              Assign to me
            </button>
            <button
              type="button"
              className="secondary-btn"
              onClick={unassign}
              disabled={saving || isLocked}
            >
              Unassign
            </button>
          </div>

          <label>
            Priority
            <select
              value={form.priority}
              onChange={(e) => updateField('priority', e.target.value)}
              disabled={saving || isLocked}
            >
              <option>High</option>
              <option>Medium</option>
              <option>Low</option>
            </select>
          </label>

          <div className="comments-panel">
            <h4>Comments</h4>
            <p className="empty-note" style={{ marginBottom: '10px' }}>
              Created by: {form.created_by_name || 'Unknown'}
            </p>

            <label className="comments-filter">
              <input
                type="checkbox"
                checked={showSystemComments}
                onChange={(e) => setShowSystemComments(e.target.checked)}
              />
              <span>Show system comments</span>
            </label>

            {visibleComments.length === 0 ? (
              <p className="empty-note">No visible comments.</p>
            ) : (
              <div className="comments-list-shell">
                <ul style={{ margin: 0, paddingLeft: '18px' }}>
                  {visibleComments.map(({ comment, index }) => (
                    <li key={`${index}-${comment}`} style={{ marginBottom: '8px' }}>
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
                          disabled={saving || isLocked}
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
                disabled={saving || isLocked}
                maxLength={1000}
              />
              <button type="button" onClick={addComment} disabled={saving || isLocked}>
                Add
              </button>
            </div>
          </div>

          <div className="modal-actions">
            {!isLocked ? (
              <button type="button" onClick={handleDeleteClick} className="delete-btn" disabled={saving}>
                Delete Card
              </button>
            ) : isRejected ? (
              <button type="button" onClick={handleReopenClick} className="secondary-btn" disabled={saving}>
                Reopen Card
              </button>
            ) : (
              <div />
            )}
            <div className="action-group">
              <button type="button" onClick={onClose} className="secondary-btn" disabled={saving}>
                Close
              </button>
              <button type="submit" className="primary-btn" disabled={saving || isLocked}>
                {saving ? 'Saving...' : 'Save Card'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function isSystemComment(comment) {
  const text = String(comment || '');

  if (text.includes('[SYSTEM]')) {
    return true;
  }

  return [
    'Card created',
    'Title changed from "',
    'Description was updated',
    'Owner changed from ',
    'Priority changed from ',
    'Column changed from ',
    'Card approved',
    'Approval removed',
    'Card rejected',
    'Rejection removed',
    'Rejection reason set:',
    'Card reopened',
  ].some((phrase) => text.includes(phrase));
}

function ApproveConfirmModal({ task, onCancel, onConfirm, saving }) {
  return (
    <div className="modal-backdrop">
      <div className="modal confirm-modal">
        <div className="modal-header">
          <h3>Approve Card</h3>
          <button className="close-btn" onClick={onCancel} disabled={saving}>
            ×
          </button>
        </div>

        <div className="modal-form">
          <p>
            Are you sure you want to approve <strong>{task.title}</strong>?
          </p>

          <div className="modal-actions">
            <button type="button" onClick={onCancel} className="secondary-btn" disabled={saving}>
              Cancel
            </button>
            <button type="button" onClick={onConfirm} className="primary-btn" disabled={saving}>
              {saving ? 'Working...' : 'Approve'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


function RejectConfirmModal({ task, onCancel, onConfirm, saving }) {
  const [reason, setReason] = useState('');

  useEffect(() => {
    setReason(task?.rejection_reason || '');
  }, [task]);

  return (
    <div className="modal-backdrop">
      <div className="modal confirm-modal">
        <div className="modal-header">
          <h3>Reject Card</h3>
          <button className="close-btn" onClick={onCancel} disabled={saving}>
            ×
          </button>
        </div>

        <div className="modal-form">
          <p>
            Are you sure you want to reject <strong>{task.title}</strong>?
          </p>

          <label>
            Rejection reason
            <textarea
              rows="4"
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, 500))}
              disabled={saving}
              maxLength={500}
              placeholder="Explain why this idea is not being pursued."
            />
          </label>

          <div className="modal-actions">
            <button type="button" onClick={onCancel} className="secondary-btn" disabled={saving}>
              Cancel
            </button>
            <button type="button" onClick={() => onConfirm(reason)} className="delete-btn" disabled={saving}>
              {saving ? 'Working...' : 'Reject'}
            </button>
          </div>
        </div>
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

function SummaryView({
  tasks,
  onResetBoard,
  onExportBoard,
  onImportBoard,
  onImportFileChange,
  importInputRef,
  saving,
}) {
  const done = sortTasksForColumn(tasks.filter((task) => task.status === 'done'));
  const active = sortTasksForColumn(
    tasks.filter(
      (task) => !task.is_approved && !task.is_rejected && (task.status === 'inprogress' || task.status === 'testing')
    )
  );
  const nextUp = sortTasksForColumn(tasks.filter((task) => task.status === 'todo'));

  return (
    <section className="summary-page">
      <div
        className="group2-edge-banner"
        style={{
          height: '200px',
          overflow: 'hidden',
          borderRadius: '12px',
          marginBottom: '16px',
        }}
      >
        <img
          src="/kanban-banner-wide-thin.png"
          alt="Kanban Activity summary banner"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
          }}
        />
      </div>

      <div className="summary-toolbar">
        <div>
          <h3 style={{ margin: 0 }}>Team Summary</h3>
          <p style={{ margin: '6px 0 0 0', opacity: 0.8 }}>{APP_VERSION}</p>
        </div>

        <div className="summary-toolbar-actions">
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            onChange={onImportFileChange}
            style={{ display: 'none' }}
          />
          <button
            type="button"
            className="secondary-btn"
            onClick={onExportBoard}
            disabled={saving}
          >
            {saving ? 'Working...' : 'Export Board'}
          </button>
          <button
            type="button"
            className="secondary-btn"
            onClick={onImportBoard}
            disabled={saving}
          >
            {saving ? 'Working...' : 'Import Board'}
          </button>
          <button
            type="button"
            className="delete-btn"
            onClick={onResetBoard}
            disabled={saving}
          >
            {saving ? 'Working...' : 'Reset Current Board'}
          </button>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '16px',
          width: '100%',
        }}
      >
        <SummaryCard
          title="Completed"
          subtitle="What finished recently"
          items={done}
        />
        <SummaryCard
          title="Active Work"
          subtitle="What the team is doing now"
          items={active}
        />
        <SummaryCard
          title="Next Up"
          subtitle="What should be pulled in next"
          items={nextUp}
        />
      </div>
    </section>
  );
}

function ResetBoardConfirmModal({ onCancel, onConfirm, saving }) {
  return (
    <div className="modal-backdrop">
      <div className="modal confirm-modal">
        <div className="modal-header">
          <h3>Reset Current Board</h3>
          <button className="close-btn" onClick={onCancel} disabled={saving}>
            ×
          </button>
        </div>

        <div className="modal-form">
          <p>
            Are you sure you want to delete all cards in the current channel?
          </p>

          <div className="modal-actions">
            <button type="button" onClick={onCancel} className="secondary-btn" disabled={saving}>
              Cancel
            </button>
            <button type="button" onClick={onConfirm} className="delete-btn" disabled={saving}>
              {saving ? 'Working...' : 'Reset Board'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ExportBoardModal({ exportPackage, onClose }) {
  const textAreaRef = useRef(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      textAreaRef.current?.focus();
      textAreaRef.current?.select();
    }, 0);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ width: 'min(900px, 100%)' }}>
        <div className="modal-header">
          <h3>Export Board</h3>
          <button className="close-btn" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-form">
          <p>
            Export file ready: <strong>{exportPackage.filename}</strong>
          </p>

          <p className="empty-note" style={{ marginTop: '-4px' }}>
            Discord blocks automatic export in this environment. Copy the selected JSON from the box
            below and save it as a <strong>.json</strong> file.
          </p>

          <textarea
            ref={textAreaRef}
            value={exportPackage.text}
            readOnly
            rows={16}
            style={{
              width: '100%',
              resize: 'vertical',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            }}
          />

          <div className="modal-actions">
            <div />
            <div className="action-group">
              <button type="button" onClick={onClose} className="primary-btn">
                Done
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ImportBoardConfirmModal({ filename, cardCount, onCancel, onConfirm, saving }) {
  return (
    <div className="modal-backdrop">
      <div className="modal confirm-modal">
        <div className="modal-header">
          <h3>Import Board</h3>
          <button className="close-btn" onClick={onCancel} disabled={saving}>
            ×
          </button>
        </div>

        <div className="modal-form">
          <p>
            Import file: <strong>{filename}</strong>
          </p>
          <p>
            Cards found: <strong>{cardCount}</strong>
          </p>
          <p>
            This will replace all cards on the current board.
          </p>

          <div className="modal-actions">
            <button type="button" onClick={onCancel} className="secondary-btn" disabled={saving}>
              Cancel
            </button>
            <button type="button" onClick={onConfirm} className="primary-btn" disabled={saving}>
              {saving ? 'Importing...' : 'Import Board'}
            </button>
          </div>
        </div>
      </div>
    </div>
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
              <span>{task.owner_name || task.owner || 'Unassigned'}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default App;