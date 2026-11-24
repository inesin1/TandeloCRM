import type {
  Group,
  Role,
  User,
} from '../features/settings/tabs/users-tab/users-api';

export interface DemoRow {
  id: number;
  [key: string]: unknown;
}
export const collections = [
  'pipelines',
  'statuses',
  'leads',
  'companies',
  'contacts',
  'tasks',
  'users',
  'groups',
] as const;
export type Collection = (typeof collections)[number];
export type DemoData = Record<Collection, DemoRow[]> & {
  currency: string;
  notes: Record<string, DemoRow[]>;
};

export const demoStorageKey = 'tandelo:demo:v1';
export const demoAccessKey = 'tandelo:demo:access';
export const roles: Role[] = [
  { id: 1, name: 'Admin' },
  { id: 2, name: 'Member' },
];
export const team: Group = { id: 1, name: 'Sales' };
export const demoUser = {
  id: 1,
  name: 'Maya Chen',
  email: 'maya@example.test',
};

function daysFromNow(days: number) {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

export function seedDemo(): DemoData {
  const date = { createdAt: daysFromNow(-3), updatedAt: daysFromNow(-1) };
  const companies = [
    'Northstar Studio',
    'Fieldwork Coffee',
    'Paperplane',
    'Juniper Design',
    'Atlas Supply',
    'Alpine Labs',
  ].map((name, i) => ({
    id: i + 1,
    name,
    industry: ['Design', 'Retail', 'Software'][i % 3],
    address: null,
    email: `hello@${name.toLowerCase().replaceAll(' ', '')}.example.test`,
    phone: null,
    ownerId: (i % 3) + 1,
    customFields: {},
    ...date,
  }));
  const contacts = [
    'Olivia Reed',
    'Nico Park',
    'Amelia Hayes',
    'Noah Miller',
    'Sofia Patel',
    'Liam Ford',
  ].map((name, i) => ({
    id: i + 1,
    name,
    companyId: i + 1,
    position: i % 2 ? 'Founder' : 'Operations lead',
    email: `${name.toLowerCase().replaceAll(' ', '.')}@example.test`,
    phone: null,
    ownerId: (i % 3) + 1,
    customFields: {},
    ...date,
  }));
  const pipelines = [
    { id: 1, name: 'Sales', sortOrder: 0 },
    { id: 2, name: 'Renewals', sortOrder: 10 },
  ];
  const statuses = pipelines.flatMap(({ id }) =>
    ['New', 'Qualified', 'Proposal', 'Won', 'Lost'].map((name, i) => ({
      id: (id - 1) * 5 + i + 1,
      name,
      pipelineId: id,
      sortOrder: i * 10,
      color: ['#3174d3', '#087e75', '#7e60bb', '#278657', '#79878a'][i],
      outcome: ['open', 'open', 'open', 'won', 'lost'][i],
    })),
  );
  const leads = [
    ['Northstar onboarding', 1, 6400],
    ['Fieldwork wholesale', 1, 2750],
    ['Paperplane annual plan', 2, 12800],
    ['Juniper team rollout', 2, 9200],
    ['Atlas warehouse pilot', 3, 18400],
    ['Alpine design system', 3, 14750],
    ['Northstar spring expansion', 4, 8300],
    ['Fieldwork store launch', 4, 4900],
    ['Paperplane trial extension', 5, 1600],
    ['Juniper annual renewal', 6, 7200],
    ['Atlas service renewal', 7, 5100],
  ].map(([name, statusId, price], i) => ({
    id: i + 1,
    name,
    statusId,
    price,
    source: 'Referral',
    pipelineId: Number(statusId) > 5 ? 2 : 1,
    companyId: (i % 6) + 1,
    contactIds: [(i % 6) + 1],
    ownerId: (i % 3) + 1,
    customFields: {},
    ...date,
  }));
  const tasks = [
    'Send welcome pack',
    'Confirm order volumes',
    'Schedule scope call',
    'Review rollout plan',
    'Share updated proposal',
    'Book design review',
  ].map((text, i) => ({
    id: i + 1,
    leadId: i + 1,
    text,
    type: ['email', 'call', 'meeting', 'document'][i % 4],
    assigneeId: (i % 3) + 1,
    dueAt: daysFromNow(i - 1),
    isCompleted: i === 3,
    ...date,
  }));
  const users: User[] = [
    demoUser,
    { id: 2, name: 'Elliot Brooks', email: 'elliot@example.test' },
    { id: 3, name: 'Leila Haddad', email: 'leila@example.test' },
  ].map((user) => ({
    ...user,
    isActive: true,
    roles: [roles[user.id === 1 ? 0 : 1]],
    groups: [team],
  }));
  return {
    currency: 'USD',
    pipelines,
    statuses,
    leads,
    companies,
    contacts,
    tasks,
    users: users.map((user) => ({ ...user })),
    groups: [{ ...team }],
    notes: {
      'leads/1': [
        {
          id: 1,
          kind: 'note',
          body: 'Kickoff confirmed. Send the welcome pack before the next call.',
          author: demoUser,
          createdAt: date.createdAt,
        },
      ],
    },
  };
}
