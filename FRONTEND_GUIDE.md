# Фронт: подключение к реальному API (пункты 8–14 плана)

Это твоя часть работы из `PUBLISH_PLAN.md`, Этап 3, раздел Frontend. Бэкенд уже готов — ниже написано, что именно он отдаёт.

Документ рассчитан на то, что кодовую базу ты знаешь, а вот три API Angular 22 (`httpResource`, Signal Forms, функциональные interceptor/guard) мог ещё не трогать. Поэтому сначала матчасть, потом пошаговая работа, в конце — грабли, которые я нашёл, читая твой код.

Все примеры API проверены на установленных версиях (Angular 22.1.4, PrimeNG 22.1.0): сигнатуры вычитаны из `node_modules/*/types/*.d.ts`, форма логина собрана в этом проекте и прогнана через компилятор Angular, а не написана по памяти.

> ⚠️ **Часть документа устарела.** Доменная модель переделывается: плоский `status`-строкой отменён, возвращаются `pipelineId`/`statusId`, а companies и contacts становятся полноценными таблицами со связями. Подробности — в `PUBLISH_PLAN.md`.
>
> **Актуально и делать можно прямо сейчас** (от модели не зависит): вся матчасть ниже, Шаги 8–11 (HttpClient, интерсептор, auth-фича, форма логина, роутинг, shell) и Шаг 14 (dev-прокси).
>
> **Не делай пока**: Шаги 12–13 — они описывают переезд на плоскую модель, которого не будет. Перепишу их, когда бэкенд нового домена будет готов.

---

## Что уже есть на бэкенде

| Что | Куда | Ответ |
|---|---|---|
| Логин | `POST /api/auth/login` `{ email, password }` | `{ accessToken: string }` |
| Лиды | `GET /api/leads?ownerId=&status=&search=` | массив лидов, требует `Authorization: Bearer` |
| Пользователи | `GET /api/users` | требует Bearer |
| Health | `GET /api/health` | `{ status: 'ok' }`, без авторизации |
| Swagger | `/api/docs` | |

Бэк слушает порт 3000, глобальный префикс `api`.

Лид приходит в плоском виде:

```ts
{
  id: number;
  name: string;
  status: 'new' | 'qualification' | 'proposal' | 'negotiation' | 'won' | 'lost';
  price: number;
  ownerId: number | null;
  companyName: string | null;
  contactName: string | null;
  source: string | null;
  createdAt: string;   // ISO-строка, НЕ Date
  updatedAt: string;
}
```

Разница с текущим моком: нет `statusId`/`pipelineId`/`createdBy`/`updatedBy`/`contacts[]`/`companies[]`, `responsibleUserId` стал `ownerId`, статус — плоская строка, а даты — строки.

---

## Матчасть

### 1. `httpResource` — реактивный GET

Это не замена `HttpClient`, а обёртка для **чтения** данных: ты описываешь URL функцией, Angular сам делает запрос и перезапрашивает, когда меняются сигналы внутри этой функции.

```ts
import { httpResource } from '@angular/common/http';

readonly leads = httpResource<Lead[]>(() => '/api/leads', { defaultValue: [] });
```

Что получаешь:

| Обращение | Что это |
|---|---|
| `leads.value()` | сигнал с данными |
| `leads.isLoading()` | грузится ли сейчас |
| `leads.error()` | `Error \| undefined` |
| `leads.status()` | `idle \| loading \| resolved \| error \| local` |
| `leads.reload()` | перезапросить руками |

Два момента, которые экономят время:

**`defaultValue` убирает `undefined` из типа.** Без него тип будет `Lead[] | undefined` и тебе придётся городить проверки в каждом `computed`. С `defaultValue: []` — `leads.value()` всегда массив.

**Если URL-функция вернула `undefined` — запрос не уйдёт.** Это штатный способ отложить запрос:

```ts
readonly leads = httpResource<Lead[]>(
  () => (this.authApi.isAuthenticated() ? '/api/leads' : undefined),
  { defaultValue: [] },
);
```

Без этого лиды дёрнутся на странице логина и словят 401. Проверь во вкладке Network, что на `/login` запроса нет.

Реактивность работает и на фильтры — если подставить сигнал в URL, запрос переедет на сервер сам:

```ts
readonly statusFilter = signal<string | null>(null);

readonly leads = httpResource<Lead[]>(() => {
  const status = this.statusFilter();
  return status ? `/api/leads?status=${status}` : '/api/leads';
}, { defaultValue: [] });
```

Но тебе это **не нужно** в этом срезе: фильтрация уже сделана на клиенте в `computed`, и она работает. Бэковые фильтры существуют, но перетаскивать на них клиентскую логику сейчас — лишняя работа. Оставь фильтрацию как есть.

### 2. Signal Forms — для формы логина

В проекте нет ни `ReactiveFormsModule`, ни Signal Forms. Изначальный план предлагал `ngModel`, но твои же правила (`~/.claude/rules-project/angular.md`) говорят: для новых форм — Signal Forms, стабильны с v22. Форма логина — идеальный размер, чтобы их освоить.

Хорошая новость: PrimeNG v22 поддерживает Signal Forms первым классом — у каждого input-компонента в доках есть отдельная секция `signal-forms`. Никакого interop-колдовства не нужно, `[formField]` вешается прямо на инпут.

Код ниже я собрал в твоём проекте и прогнал через компилятор Angular — он компилируется на твоих версиях:

```ts
import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  form, FormField, required, email, minLength, submit,
} from '@angular/forms/signals';
import { InputTextModule } from 'primeng/inputtext';
import { InputPasswordModule } from 'primeng/inputpassword';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';

@Component({
  imports: [InputTextModule, InputPasswordModule, ButtonModule, MessageModule, FormField],
  template: `
    <form novalidate (submit)="onSubmit($event)" class="flex flex-col gap-4">
      <div class="flex flex-col gap-1">
        <input pInputText type="email" placeholder="Email"
               autocomplete="username" [formField]="loginForm.email" />
        @if (loginForm.email().touched() && loginForm.email().invalid()) {
          @for (error of loginForm.email().errors(); track error.kind) {
            <p-message severity="error" size="small" variant="simple">{{ error.message }}</p-message>
          }
        }
      </div>

      <div class="flex flex-col gap-1">
        <input pInputPassword placeholder="Пароль"
               autocomplete="current-password" [formField]="loginForm.password" />
        @if (loginForm.password().touched() && loginForm.password().invalid()) {
          @for (error of loginForm.password().errors(); track error.kind) {
            <p-message severity="error" size="small" variant="simple">{{ error.message }}</p-message>
          }
        }
      </div>

      @if (serverError()) {
        <p-message severity="error" size="small">{{ serverError() }}</p-message>
      }

      <button pButton type="submit" label="Войти"
              [loading]="loginForm().submitting()"></button>
    </form>
  `,
})
export class LoginPage {
  private readonly router = inject(Router);
  private readonly authApi = inject(AuthApi);

  protected readonly serverError = signal('');
  private readonly model = signal({ email: '', password: '' });

  protected readonly loginForm = form(this.model, (path) => {
    required(path.email, { message: 'Введите email' });
    email(path.email, { message: 'Некорректный email' });
    required(path.password, { message: 'Введите пароль' });
    minLength(path.password, 8, { message: 'Минимум 8 символов' });
  });

  protected onSubmit(event: Event) {
    event.preventDefault();
    this.serverError.set('');

    submit(this.loginForm, async () => {
      try {
        await this.authApi.login(this.model());
        this.router.navigateByUrl('/leads');
      } catch {
        this.serverError.set('Неверный email или пароль');
      }
    });
  }
}
```

Что тут специфично для PrimeNG:

- **`pInputText` и `pInputPassword` — директивы на нативном `<input>`**, а не компоненты-обёртки. Поэтому `[formField]` садится на тот же элемент без конфликтов. `pInputPassword` живёт в `primeng/inputpassword`; есть ещё легаси-компонент `p-password` из `primeng/password` — для новой формы бери первый.
- **Ошибки через `p-message`** с `variant="simple"` — это принятый в PrimeNG способ показать ошибку поля без рамки-контейнера.
- **`@for (... track error.kind)`** — у каждой ошибки валидации есть `kind` (`required`, `email`, `minLength`), он и служит ключом. Так выводятся все ошибки поля, а не только первая.
- **`[loading]="loginForm().submitting()"`** — `submitting()` есть у состояния формы из коробки, отдельный `isLoading`-сигнал заводить не нужно.
- Форма submit'ится через обычный `(submit)` с `preventDefault()` — так это показано в доках PrimeNG. Альтернатива — директива `FormRoot` (`<form [formRoot]="loginForm">`), она сама перехватывает событие; тоже работает, я проверял. Разница косметическая.

Разбор, потому что синтаксис непривычный:

- `form(model, schemaFn)` оборачивает **твой** сигнал. Это не копия — форма пишет прямо в `model`, так что `this.model()` всегда актуальное значение.
- Схема — функция, получающая «дерево путей». `required(path.email)` не вызывает поле, а описывает правило для него.
- В шаблоне директива называется `FormField`, а биндинг — `[formField]`. Поле передаётся **невызванным**: `loginForm.email`, не `loginForm.email()`.
- А вот для чтения состояния поле **вызывается**: `loginForm.email().touched()`, `.invalid()`, `.errors()`. Двойные скобки — это нормально: первая достаёт состояние поля, вторая читает сигнал.
- `loginForm()` без имени поля — состояние всей формы, отсюда `loginForm().invalid()`.
- `minLength(path.password, 8)` держи синхронно с бэком: там `LoginDto` требует минимум 8 символов.

- `submit(form, action)` возвращает `Promise<boolean>` и сам держит `submitting()` на время выполнения `action`. Ошибку сервера он не проглатывает и не показывает — её ловишь сам, отсюда отдельный сигнал `serverError`.
- Валидаторы лежат в `@angular/forms/signals`, полный список: `required`, `email`, `min`, `max`, `minLength`, `maxLength`, `pattern`, `minDate`, `maxDate`, `validate`, `validateAsync`, `validateHttp`. У каждого есть опции `{ message, when }` — `when` позволяет включать правило условно, например только после `touched()`.
- `minLength(path.password, 8)` держи синхронно с бэком: там `LoginDto` требует минимум 8 символов.

### 3. Функциональные interceptor и guard

Оба — просто функции, классы не нужны.

```ts
export const authInterceptor: HttpInterceptorFn = (req, next) => { ... };
export const authGuard: CanActivateFn = () => { ... };
```

Внутри них работает `inject()`, потому что они вызываются в контексте инжектора. `constructor`-инъекции там нет и не будет.

### 4. `@Service()`

В v22 для синглтонов вместо `@Injectable({ providedIn: 'root' })` — короткий `@Service()`. Твой `LeadsApi` уже так написан, новые сервисы пиши так же. На бэкенде (NestJS) остаётся `@Injectable()` — это разные вещи, не путай.

---

## Пошагово

### Шаг 8. HttpClient + интерсептор

`apps/web/src/app/app.config.ts`, добавь в `providers`:

```ts
provideHttpClient(withInterceptors([authInterceptor])),
```

Без этого `httpResource` просто не с чем работать.

### Шаг 9. Фича auth

Новая папка `apps/web/src/features/auth/`, плоские файлы — как в `features/leads/`.

**`auth-api.ts`**

```ts
@Service()
export class AuthApi {
  private readonly http = inject(HttpClient);
  private readonly _token = signal(localStorage.getItem('auth:token'));

  readonly token = this._token.asReadonly();
  readonly isAuthenticated = computed(() => !!this._token());

  async login(credentials: { email: string; password: string }) {
    const res = await firstValueFrom(
      this.http.post<{ accessToken: string }>('/api/auth/login', credentials),
    );
    localStorage.setItem('auth:token', res.accessToken);
    this._token.set(res.accessToken);
  }

  logout() {
    localStorage.removeItem('auth:token');
    this._token.set(null);
  }
}
```

Приватный writable-сигнал + публичный readonly — чтобы токен нельзя было переписать снаружи. Начальное значение читается из `localStorage`, иначе перезагрузка страницы будет разлогинивать.

**`auth.interceptor.ts`**

```ts
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authApi = inject(AuthApi);
  const router = inject(Router);
  const token = authApi.token();

  const authorized = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(authorized).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401) {
        authApi.logout();
        router.navigateByUrl('/login');
      }
      return throwError(() => error);
    }),
  );
};
```

`req` иммутабелен — только `clone()`. Рефреш-токенов нет сознательно (см. план): протух JWT — идёшь логиниться заново.

**`auth.guard.ts`**

```ts
export const authGuard: CanActivateFn = () => {
  const authApi = inject(AuthApi);
  const router = inject(Router);
  return authApi.isAuthenticated() ? true : router.createUrlTree(['/login']);
};
```

Возврат `UrlTree` вместо `false` — так редирект отрабатывает атомарно, без мигания пустой страницы.

**`login-page.ts`** — компонент из раздела про Signal Forms выше.

### Шаг 10. Роутинг

Тут есть нюанс, которого план не учёл: в `app.routes.ts` все семь маршрутов лежат **плоско**, общего родителя нет. Чтобы не вешать `canActivate` семь раз, заверни их в pathless-роут:

```ts
export const appRoutes: Route[] = [
  {
    path: 'login',
    title: 'Login',
    loadComponent: () =>
      import('../features/auth/login-page').then((m) => m.LoginPage),
  },
  {
    path: '',
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'desktop' },
      // сюда переезжают desktop, leads, contacts, companies, tasks, analytics, settings — без изменений
    ],
  },
];
```

`/login` обязательно **выше** и вне защищённой ветки, иначе guard уведёт тебя в бесконечный редирект на самого себя.

### Шаг 11. Shell

`app.html` сейчас безусловно рисует сайдбар-лэйаут. Оберни его:

```html
@if (authApi.isAuthenticated()) {
  <p-sidebar-layout class="h-dvh overflow-x-clip">
    ...существующая разметка...
  </p-sidebar-layout>
} @else {
  <router-outlet />
}
```

В `app.ts` добавь `protected readonly authApi = inject(AuthApi);`.

Заодно в футере сайдбара захардкожен `John Doe` (`app.html`, строки 56–63) — повесь туда кнопку logout, а имя можешь оставить заглушкой: пользовательский профиль в этот срез не входит.

### Шаг 12. Переписать `leads-api.ts`

Основная работа. Что делаешь:

1. `Lead` приводишь к форме из таблицы в начале документа. **`createdAt`/`updatedAt` — `string`**, не `Date`.
2. `statusId`/`pipelineId`/`createdBy`/`updatedBy`/`contacts`/`companies` — удаляешь. `contacts` и `companies` нигде не рендерятся, это мёртвые поля.
3. Массив `leads` заменяешь на `httpResource` (с гейтом по `isAuthenticated`, см. матчасть).
4. `pipelines` уходят. Вместо них — плоский список статусов, цвета переносишь из старых `Status`:

```ts
export interface Status {
  key: string;
  name: string;
  color: string;
}

export const LEAD_STATUSES: Status[] = [
  { key: 'new',           name: 'New',           color: '#3b82f6' },
  { key: 'qualification', name: 'Qualification', color: '#6366f1' },
  { key: 'proposal',      name: 'Proposal',      color: '#f59e0b' },
  { key: 'negotiation',   name: 'Negotiation',   color: '#10b981' },
  { key: 'won',           name: 'Won',           color: '#22c55e' },
  { key: 'lost',          name: 'Lost',          color: '#ef4444' },
];
```

Ключи обязаны совпадать с `LEAD_STATUSES` из `apps/api/src/app/modules/leads/lead.entity.ts` — сверь глазами.

5. `tasks` **оставляешь моком** — модуля задач на бэке нет, это сознательное упрощение из плана.
6. `users` — можешь подключить к `GET /api/users` таким же `httpResource`, можешь оставить моком. Необязательно.

### Шаг 13. Поправить потребителей

`leads-page.ts`:

| Было | Стало |
|---|---|
| `this.leadsApi.leads.filter(...)` | `this.leadsApi.leads.value().filter(...)` |
| `lead.pipelineId === selectedPipeline().id` | фильтр по pipeline уходит целиком |
| `lead.responsibleUserId` | `lead.ownerId` |
| `lead.statusId !== status` | `lead.status !== status` |
| `pipeline.statuses.toSorted(...)` в `columns` | `LEAD_STATUSES.map(...)` |
| `lead.statusId === status.id` | `lead.status === status.key` |
| `company?.name ?? contact?.name` в `toRow` | `lead.companyName ?? lead.contactName ?? 'No client'` |
| `statuses.find((s) => s.id === lead.statusId)` | `LEAD_STATUSES.find((s) => s.key === lead.status)` |

`statusFilter` меняет тип с `signal<number | null>` на `signal<string | null>`.

`selectedPipeline` и селект пайплайнов удаляй — с плоским статусом переключателю нечего переключать. Это правка и в `leads-page.ts`, и в `leads-page.html`. Оставлять мёртвый декоративный селект в портфолио-проекте хуже, чем его отсутствие.

Шаблоны `board-column` и `leads-table` трогать не нужно — они получают уже готовые view-model'и.

### Шаг 14. Dev-прокси

`apps/web/proxy.conf.json`:

```json
{ "/api": { "target": "http://localhost:3000", "secure": false } }
```

И в `apps/web/project.json` → `serve.options.proxyConfig: "apps/web/proxy.conf.json"`.

Это то, что делает относительный путь `/api/leads` рабочим без CORS и без `environments/`.

---

## Грабли

Нашёл, читая твой код. Каждая стоит потерянных минут, если встретить вслепую.

**1. `LeadRow extends Lead` не скомпилируется.** В `leads-table.ts`:

```ts
export interface LeadRow extends Lead {
  status: Status | undefined;   // а в Lead теперь status: string
}
```

TypeScript не даст сузить `string` до `Status | undefined` в наследнике — будет ошибка «incorrectly extends». Чинится так:

```ts
export interface LeadRow extends Omit<Lead, 'status'> {
  status: Status | undefined;
}
```

**2. Даты стали строками.** `Lead.createdAt` объявлен как `Date`, но из HTTP придёт ISO-строка. `DatePipe` в шаблоне это переварит, а вот любой `.getTime()` или `.toLocaleDateString()` по такому полю упадёт в рантайме, причём тип будет врать, что всё хорошо. Объяви `string` и не заводи `Date` без явного `new Date(...)`.

Метод `nextTask()` остаётся на моках, где `dueAt` — настоящий `Date`, там `.getTime()` законен. Не перепутай источники.

**3. Лиды дёрнутся на странице логина**, если не поставить гейт `isAuthenticated()` в URL-функцию. Симптом: 401 в консоли сразу после открытия `/login`.

**4. `stats()` и `tabs()` считают по `pipelineLeads()`.** Когда убираешь пайплайны, эти `computed` должны считать по `this.leadsApi.leads.value()`. Не забудь — иначе метрики молча покажут ноль.

**5. `currentUserId = 1` захардкожен** в `leads-page.ts` (строка 39) — от него зависит вкладка «Mine». Реальный id пользователя сейчас взять неоткуда: бэк отдаёт только `accessToken`, эндпоинта «текущий пользователь» нет. Варианты: оставить заглушку, распарсить `sub` из JWT, или убрать вкладку. Для среза достаточно заглушки — но знай, что она есть.

**6. Пустое состояние.** С моками список никогда не был пустым, теперь будет: до логина, при ошибке сети, на незасиженной базе. `leads.isLoading()` и `leads.error()` уже есть — покажи хотя бы спиннер и текст ошибки, иначе канбан выглядит сломанным.

---

## Проверка

**Сначала почини `.env`.** В твоём локальном `.env` есть только `DATABASE_URL` и `JWT_SECRET`, а `pnpm db:seed-admin` требует ещё `ADMIN_EMAIL` и `ADMIN_PASSWORD` — без них он падает, админ не создаётся, и залогиниться тебе будет нечем. В `.env.example` они задокументированы, просто не перенесены. Добавь:

```
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=<минимум 8 символов>
ADMIN_NAME=Admin
```

Пароль короче 8 символов не пройдёт валидацию `LoginDto` на бэке.

Поднять всё:

```bash
docker compose up -d
pnpm db:migrate
pnpm db:seed
pnpm db:seed-admin
pnpm db:seed-leads
pnpm nx run api:serve     # в отдельном терминале
pnpm nx run web:serve
```

Миграция, `db:seed` и `db:seed-leads` уже прогнаны по твоей локальной базе — 8 лидов в таблице лежат. Но `ownerId` у всех `null`, потому что на момент сида админа не существовало. После `db:seed-admin` перезалей лиды, если хочешь непустого владельца: `docker compose exec postgres psql -U postgres -d tandelo -c 'TRUNCATE leads;'` и снова `pnpm db:seed-leads`.

Чек-лист (первые три пункта я уже проверил — отмечены):

- [x] `curl http://localhost:3000/api/health` → `{"status":"ok"}`
- [x] `/api/leads` без токена и с мусорным токеном → 401
- [x] Swagger `/api/docs` показывает `leads` с bearer-lock и фильтрами `ownerId`/`status`/`search`
- [ ] `GET /api/leads` с валидным токеном отдаёт 8 лидов — **не проверено**, нужен админ из `db:seed-admin`
- [ ] `/leads` без токена перекидывает на `/login`
- [ ] логин с кривым паролем показывает ошибку, не белый экран
- [ ] после логина — редирект на `/leads`, канбан с данными из сида
- [ ] в Network виден `GET /api/leads` с заголовком `Authorization: Bearer`
- [ ] на `/login` запроса к `/api/leads` **нет**
- [ ] перезагрузка страницы не разлогинивает
- [ ] logout возвращает на `/login`
- [ ] `pnpm nx run-many -t lint test build` — зелёное
