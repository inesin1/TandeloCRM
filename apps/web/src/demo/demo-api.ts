import {
  HttpErrorResponse,
  HttpResponse,
  type HttpInterceptorFn,
  type HttpRequest,
} from '@angular/common/http';
import { of, throwError } from 'rxjs';
import {
  collections,
  demoAccessKey,
  demoStorageKey,
  demoUser,
  roles,
  seedDemo,
  type Collection,
  type DemoData,
  type DemoRow,
} from './demo-data';

function loadDemo(): DemoData {
  try {
    const saved = localStorage.getItem(demoStorageKey);
    if (saved) return JSON.parse(saved) as DemoData;
  } catch {
    // Fall back to sample records if storage is unavailable or corrupt.
  }
  return seedDemo();
}

let data = loadDemo();
const now = () => new Date().toISOString();
const find = (key: Collection, id: unknown) =>
  data[key].find((row) => row.id === id);
const nextId = (rows: DemoRow[]) =>
  Math.max(0, ...rows.map((row) => row.id)) + 1;
const page = (items: unknown[]) => ({ items, nextCursor: null });
const permissions = [
  ...collections.filter((key) => key !== 'statuses'),
  'custom-fields',
  'analytics',
  'roles',
].flatMap((key) => [`${key}:read`, `${key}:write`]);

function save() {
  try {
    localStorage.setItem(demoStorageKey, JSON.stringify(data));
  } catch {
    /* the demo still works in memory */
  }
}
export function resetDemo() {
  data = seedDemo();
  save();
  location.reload();
}

function decorate(key: Collection, row: DemoRow) {
  if (key === 'leads') {
    const contactIds = Array.isArray(row['contactIds'])
      ? row['contactIds']
      : [];
    return {
      ...row,
      status: find('statuses', row['statusId']),
      company: find('companies', row['companyId']) ?? null,
      owner: find('users', row['ownerId']) ?? null,
      contacts: data.contacts.filter((contact) =>
        contactIds.includes(contact.id),
      ),
    };
  }
  if (key === 'tasks')
    return { ...row, assignee: find('users', row['assigneeId']) ?? null };
  if (key === 'users') {
    const roleIds = row['roleIds'];
    const groupIds = row['groupIds'];
    return {
      ...row,
      roles: Array.isArray(roleIds)
        ? roles.filter((role) => roleIds.includes(role.id))
        : row['roles'],
      groups: Array.isArray(groupIds)
        ? data.groups.filter((group) => groupIds.includes(group.id))
        : row['groups'],
    };
  }
  return row;
}

function collection(
  req: HttpRequest<unknown>,
  key: Collection,
  id: number | null,
  rows: DemoRow[],
  defaults: Record<string, unknown> = {},
) {
  const existing = id === null ? undefined : rows.find((row) => row.id === id);
  if (id !== null && !existing) return fail(404, 'Record not found.');
  if (req.method === 'GET')
    return existing
      ? decorate(key, existing)
      : rows.map((row) => decorate(key, row));
  const payload = { ...(req.body as Record<string, unknown>) };
  delete payload['password'];
  if (req.method === 'POST') {
    const row = {
      createdAt: now(),
      updatedAt: now(),
      customFields: {},
      ...defaults,
      ...payload,
      id: nextId(data[key]),
    };
    data[key].push(row);
    save();
    return decorate(key, row);
  }
  if (req.method === 'PUT' && existing) {
    Object.assign(existing, payload, { id: existing.id, updatedAt: now() });
    save();
    return decorate(key, existing);
  }
  if (req.method === 'DELETE' && existing) {
    if (
      (key === 'statuses' || key === 'pipelines') &&
      data.leads.some(
        (lead) => lead[key === 'statuses' ? 'statusId' : 'pipelineId'] === id,
      )
    ) {
      return fail(409, 'This pipeline or stage still has leads.');
    }
    data[key] = data[key].filter((row) => row.id !== id);
    if (key === 'pipelines')
      data.statuses = data.statuses.filter((row) => row['pipelineId'] !== id);
    save();
    return { deleted: true };
  }
  return fail(501, 'This operation is unavailable in the demo.');
}

function analytics(report: string) {
  if (report === 'pipeline')
    return data.statuses.map((stage) => {
      const leads = data.leads.filter((lead) => lead['statusId'] === stage.id);
      return {
        pipelineId: stage['pipelineId'],
        pipelineName: find('pipelines', stage['pipelineId'])?.['name'],
        statusId: stage.id,
        statusName: stage['name'],
        statusColor: stage['color'],
        statusOutcome: stage['outcome'],
        leadCount: leads.length,
        totalPrice: leads.reduce((sum, lead) => sum + Number(lead['price']), 0),
      };
    });
  if (report === 'team')
    return [...data.users, { id: null, name: null }]
      .map((owner) => {
        const leads = data.leads.filter((lead) => lead['ownerId'] === owner.id);
        return {
          ownerId: owner.id,
          ownerName: owner['name'],
          leadCount: leads.length,
          totalPrice: leads.reduce(
            (sum, lead) => sum + Number(lead['price']),
            0,
          ),
        };
      })
      .filter((row) => row.leadCount);
  const upcoming = data.tasks.filter((task) => !task['isCompleted']);
  const overdue = upcoming.filter((task) => String(task['dueAt']) < now());
  const upcomingRows = (rows: DemoRow[]) =>
    rows.map((task) => ({
      ...task,
      leadName: find('leads', task['leadId'])?.['name'],
      assigneeName: find('users', task['assigneeId'])?.['name'],
    }));
  return {
    summary: {
      totalCount: data.tasks.length,
      completedCount: data.tasks.length - upcoming.length,
      openCount: upcoming.length,
      overdueCount: overdue.length,
      dueNextWeekCount: upcoming.length - overdue.length,
    },
    byAssignee: [],
    byType: [],
    overdueTasks: upcomingRows(overdue),
    upcomingTasks: upcomingRows(
      upcoming.filter((task) => !overdue.includes(task)),
    ),
  };
}

const exampleConversation = {
  id: 1,
  title: 'Pipeline check-in',
  createdAt: now(),
  updatedAt: now(),
};
function copilot(req: HttpRequest<unknown>, path: string) {
  if (req.method !== 'GET')
    return fail(501, 'Copilot uses a sample conversation in this demo.');
  if (path === 'status')
    return {
      enabled: true,
      capabilities: { conversations: true, messaging: false },
    };
  if (path === 'conversations') return page([exampleConversation]);
  if (path === 'conversations/1/messages')
    return page([
      {
        id: 1,
        role: 'user',
        text: 'What should I follow up on today?',
        createdAt: now(),
        sources: [],
      },
      {
        id: 2,
        role: 'assistant',
        text: 'Send the Northstar welcome pack and follow up with Fieldwork about wholesale volumes. The Atlas warehouse pilot is already at Proposal, so it is worth confirming the decision date with Sofia.',
        createdAt: now(),
        sources: [
          {
            sourceId: 'lead:1',
            kind: 'lead',
            id: 1,
            label: 'Northstar onboarding',
          },
        ],
      },
    ]);
  if (path === 'settings')
    return {
      enabled: false,
      source: 'environment',
      apiFormat: 'responses',
      baseUrl: '',
      model: '',
      apiKeySet: false,
    };
  return fail(404, 'Record not found.');
}

function fail(status: number, message: string): never {
  throw new HttpErrorResponse({ status, error: { message } });
}

function respond(req: HttpRequest<unknown>, url: URL): unknown {
  const [, , route, record, subroute, subrecord] = url.pathname.split('/');
  const id = record ? Number(record) : null;
  switch (route) {
    case 'auth':
      if (record === 'login') return { accessToken: demoAccessKey };
      return { user: demoUser, permissions };
    case 'workspace-settings':
      if (req.method === 'PUT') {
        data.currency = (req.body as { currency: string }).currency;
        save();
      }
      return { currency: data.currency };
    case 'analytics':
      return analytics(record);
    case 'roles':
      return roles;
    case 'custom-fields':
      return [];
    case 'copilot':
      return copilot(req, url.pathname.slice('/api/copilot/'.length));
    case 'pipelines':
      if (subroute === 'statuses')
        return collection(
          req,
          'statuses',
          subrecord ? Number(subrecord) : null,
          data.statuses.filter((stage) => stage['pipelineId'] === id),
          { pipelineId: id, outcome: 'open' },
        );
      break;
    case 'leads':
    case 'companies':
    case 'contacts': {
      const notesKey = `${route}/${id}`;
      const notes = data.notes[notesKey] ?? [];
      if (subroute === 'activity') return notes;
      if (subroute === 'notes' && req.method === 'POST') {
        const note = {
          id: nextId(notes),
          kind: 'note',
          ...(req.body as { body: string }),
          author: demoUser,
          createdAt: now(),
        };
        data.notes[notesKey] = [note, ...notes];
        save();
        return note;
      }
      if (subroute === 'leads') {
        return data.leads
          .filter((lead) =>
            route === 'companies'
              ? lead['companyId'] === id
              : Array.isArray(lead['contactIds']) &&
                lead['contactIds'].includes(id),
          )
          .map((lead) => decorate('leads', lead));
      }
      break;
    }
    case 'tasks': {
      const leadId = url.searchParams.get('leadId') ?? req.params.get('leadId');
      return collection(
        req,
        'tasks',
        id,
        leadId
          ? data.tasks.filter((task) => task['leadId'] === Number(leadId))
          : data.tasks,
        { isCompleted: false },
      );
    }
  }
  const key = collections.find((item) => item === route);
  if (key) return collection(req, key, id, data[key], { isActive: true });
  return fail(404, 'Demo endpoint not found.');
}

export const demoApi: HttpInterceptorFn = (req, next) => {
  const url = new URL(req.url, location.href);
  if (!url.pathname.startsWith('/api/')) return next(req);
  try {
    return of(
      new HttpResponse({
        body: respond(req, url),
        status: req.method === 'POST' ? 201 : 200,
      }),
    );
  } catch (error) {
    return throwError(() => error);
  }
};
