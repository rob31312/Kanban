export const owners = ['Andrew', 'Marcelina', 'Luis', 'Robert', 'Unassigned'];

export const initialTasks = [
  {
    id: 1,
    title: 'Set up Discord application',
    description: 'Create the application in the Discord Developer Portal and enable Activities.',
    owner: 'Andrew',
    status: 'Backlog',
    priority: 'High',
    comments: ['Need client ID and redirect settings.'],
  },
  {
    id: 2,
    title: 'Build board layout',
    description: 'Create the initial Kanban board with four columns.',
    owner: 'Marcelina',
    status: 'In Progress',
    priority: 'High',
    comments: ['UI skeleton is started.'],
  },
  {
    id: 3,
    title: 'Test modal editing',
    description: 'Verify that card fields save correctly from the modal.',
    owner: 'Luis',
    status: 'Testing',
    priority: 'Medium',
    comments: ['Check empty state handling.'],
  },
  {
    id: 4,
    title: 'Create project README',
    description: 'Document setup, scripts, and local run steps.',
    owner: 'Robert',
    status: 'Approved',
    priority: 'Low',
    comments: ['Initial version complete.'],
  },
];
