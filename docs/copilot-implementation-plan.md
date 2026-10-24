# План реализации CRM Copilot в Tandelo

Дата: 24 октября 2026. Статус: реализация завершена; итоговая приёмка частично ограничена недоступной средой и ошибкой Angular production build.

Пользователь подтвердил: Copilot — встроенный AI-помощник CRM. Требуется реализовать максимально полный практический набор возможностей на существующей архитектуре. Этот документ — техническое задание для модели-исполнителя. Выполняй фазы последовательно; в конце каждой фазы обновляй чеклист и записывай результаты проверок. Закончив фазу, остановись, если пользователь не поручил непрерывное выполнение всего плана.

## 1. Результат для пользователя

Copilot должен уметь:

1. Вести диалог на языке пользователя, сохранять личные чаты и продолжать их после перезагрузки.
2. Находить лиды, компании, контакты и задачи по доступным пользователю данным. Показывать ссылки на найденные записи.
3. Объяснять состояние конкретного лида: основные поля, связанные записи, заметки, задачи; предлагать следующие шаги с указанием оснований.
4. Готовить сводку рабочего дня, список просроченных задач и обзор воронки по фактическим данным.
5. Создавать черновики писем и сообщений по контексту CRM. Копирование доступно; отправки почты пока нет.
6. Предлагать создание и изменение лидов, компаний, контактов, задач и добавление заметок. Показывать точные изменения до выполнения. Изменять данные только после отдельного подтверждения конкретного предложения.
7. Работать на отдельной странице `/copilot` и в панели поверх текущего экрана. Получать контекст сохранённой карточки без отправки несохранённых полей формы.
8. Показывать загрузку, прогресс инструментов, отмену запроса, понятные ошибки и восстановление после обрыва соединения.
9. Уважать текущие права пользователя, ограничивать объём запросов и не раскрывать секреты.

Обязательные границы текущей реализации: один провайдер LLM; нет удаления CRM-записей через AI, массовых изменений, автономных фоновых действий, управления пользователями/правами, отправки писем, внешнего веб-поиска, загрузки файлов, голосового режима, vector DB, embeddings и отдельной системы автоматизаций. На запрос таких действий Copilot честно объясняет ограничение. Не изображать несуществующую интеграцию.

## 2. Проверенные факты о репозитории

Все пути ниже относительно **`/Users/artemnesin/Projects/opencrm/opencrm`**. Родительская папка не является корнем git/workspace.

| Что | Где и что учитывать |
| --- | --- |
| Инструкции | `AGENTS.md`; правила пользователя из текущего задания также обязательны |
| Стек | Angular 22, PrimeNG, NestJS 11, Drizzle, PostgreSQL, Vitest, Playwright, Nx |
| Copilot | Реализации и отдельной спецификации не обнаружено. README относит AI assistance к будущей работе |
| API wiring | `apps/api/src/app/app.module.ts` |
| Env | `apps/api/src/app/env.schema.ts`, `.env.example`; env разбирается Zod |
| HTTP | `apps/api/src/main.ts`: prefix `/api`, JWT через guards, глобальный ValidationPipe со строгим whitelist |
| DB | `apps/api/src/app/modules/database/database.module.ts`, токен `DATABASE_CONNECTION`, тип `Database` |
| Схема | `apps/api/src/app/modules/**/*.entity.ts`; генерация миграций через `apps/api/drizzle.config.ts` |
| Миграции | `apps/api/drizzle/`; существующие миграции не изменять |
| Права | `modules/access-control/permissions.service.ts`, `permissions.catalog.ts`, `permissions.guard.ts`, пути относительно `apps/api/src/app/` |
| Важная особенность | Guards защищают HTTP. Прямой вызов CRM-сервиса из Copilot сам по себе права не проверяет |
| Семантика guard | `RequirePermissions(a, b)` сейчас означает **достаточно любого** из перечисленных прав. Для Copilot проверять обязательные права через `every`, не полагаться на этот декоратор для AND |
| Текущая модель доступа | Права на ресурсы read/write; полноценного tenant/workspace isolation и ограничения записей по владельцу в прочитанном коде нет. Не выдумывать такие гарантии |
| Лиды | `modules/leads/leads.service.ts`: CRUD, `findActivity`, `addNote`; создание/обновление уже транзакционные, есть история изменений |
| Лиды: связи | Результаты чтения включают компанию, контакты, владельца. Для Copilot связанные данные дополнительно фильтровать по их правам |
| Компании/контакты | `modules/companies`, `modules/contacts`; использовать существующие CRUD/notes, предварительно проверить сигнатуры |
| Задачи | `modules/tasks`; обязательны `leadId`, `type`, `text`, `dueAt`. Типы: `call`, `email`, `meeting`, `document` |
| Воронки | `modules/pipelines`; статус должен принадлежать указанной воронке, это также защищено FK в БД |
| Custom fields | `modules/custom-fields`; сохранять существующую валидацию, не подменять её AI-схемой |
| Аналитика | `modules/analytics/analytics.service.ts`: pipeline, team, tasks. `AnalyticsModule` пока не экспортирует сервис |
| Frontend shell | `apps/web/src/app/app.ts`, `app.html`, `app.routes.ts` |
| Auth frontend | `apps/web/src/features/auth/auth-api.ts`: token, session, permissions, `hasPermission`; существующий interceptor |
| Контекст карточки | `features/leads/lead-detail-page`, `features/records/record-detail-page`, пути относительно `apps/web/src/` |
| Тесты | Соседние `*.spec.ts`; API e2e в `apps/api-e2e`, browser e2e в `apps/web-e2e` |

При подготовке плана git был чистым. `pnpm nx show project api --json` завершился **до запуска Nx** ошибкой `ERR_PNPM_VERIFY_DEPS_BEFORE_RUN`: локальный pnpm сообщает, что `node_modules` расходится с lockfile и поле `pnpm.overrides` из package.json больше не читается. Blocker устранён в фазе 0 для согласованных пользователем Node 26 и pnpm 12: pnpm-настройки перенесены в `pnpm-workspace.yaml`, frozen install прошёл без изменения lockfile.

## 3. Зафиксированные технические решения

### 3.1 Архитектура

```text
Copilot page / panel → CopilotApi → JWT-protected CopilotController
  → CopilotService: история, бюджет, цикл LLM
  → CopilotToolsService: allowlist, валидация, проверка прав, безопасные проекции
      → существующие CRM services для чтения и подтверждённой записи
  → CopilotActionsService: предложения, подтверждение, транзакция, аудит
  → CopilotProvider: один серверный адаптер OpenAI Responses API
  → PostgreSQL: conversations, messages, runs, actions
```

Без LangChain, Agents SDK, очереди, Redis и отдельного микросервиса. Адаптер провайдера — один injectable-класс с методом генерации и подменой через Nest provider в тестах. Не строить систему плагинов/провайдеров. Для HTTP достаточно уже установленного axios. Секрет и имя модели задаются только серверным env; frontend и LLM не выбирают URL провайдера.

Базовый вариант — OpenAI Responses API с function calling. Модель явно задаётся через `COPILOT_MODEL`, без выдуманного «последнего» имени. Поддержку выбранной моделью tools проверять отдельным ручным smoke test. Отправлять `store: false`; историю хранит Tandelo. Это не обещание полного отсутствия хранения у провайдера: его собственная политика обработки данных остаётся отдельным условием эксплуатации. См. [официальное руководство Responses](https://developers.openai.com/api/docs/guides/migrate-to-responses).

Function calling: строгие JSON-схемы, `additionalProperties: false`, nullable-поля для необязательных значений, затем независимая серверная валидация. Выключить parallel tool calls. Сохранять необходимые response items внутри текущего цикла и связывать результаты через `call_id`; не пересобирать протокол по памяти. См. [официальное руководство function calling](https://developers.openai.com/api/docs/guides/function-calling).

### 3.2 Начальные лимиты

Зафиксировать константами рядом с Copilot, без UI управления лимитами:

- 8 000 символов пользовательского сообщения; 1–120 символов заголовка чата.
- Один активный run на чат, максимум два активных run на пользователя, 20 новых run за 10 минут на пользователя. Проверки работают между экземплярами API через БД, не только через in-memory Map.
- До 6 запросов к LLM и до 12 вызовов инструментов на run. Общий timeout 90 секунд; отдельный запрос к провайдеру — не более оставшегося бюджета и 30 секунд.
- До 20 результатов поиска за страницу; до 3 страниц одной выборки за run. SQL LIMIT применяется в БД. Полные списки не загружать с последующим `.slice()`.
- До 20 последних сообщений в контексте и до 60 000 символов сериализованного контекста, включая результаты tools. Обрезку явно обозначать; не называть ограниченную выборку полной статистикой.
- Предложение действия действительно 15 минут. Одна карточка подтверждения — одно изменение одной CRM-записи.
- До 4 000 output tokens на запрос к модели; писать usage, если он возвращён провайдером. Денежную стоимость без таблицы актуальных тарифов не вычислять.

Общий timeout и лимит шагов — обязательны даже при ошибочных/повторяющихся ответах модели. После исчерпания бюджета run завершается понятной ошибкой/частичным ответом без скрытого продолжения.

### 3.3 Проверки доступа и доверия

1. `actorId` получать только из JWT. Проверять владельца каждого conversation/run/action на сервере. Для чужих id возвращать 404.
2. Доступ к Copilot получает активный авторизованный пользователь; отдельное новое право `copilot:*` в первой версии не вводить. Возможности определяются правами CRM. История всегда личная, Admin не получает автоматический доступ к чужим чатам.
3. При каждом tool call заново получать актуальные права и проверять **все** необходимые ключи. Проверять и при подготовке предложения, и при подтверждении.
4. В LLM передавать только allowlist полей. Запрещены passwordHash, JWT, env, API keys, полные user entities. Для справочника сотрудников достаточно id/name и `users:read`.
5. Для связанных сущностей проверять отдельное read-право либо исключать поля. Например, без `contacts:read` не передавать контакты из `LeadsService.findOne`. Для операции с указанным contactId требовать `contacts:read`; аналоги для компаний, владельцев, исполнителей, воронок и custom fields.
6. Имя, заметка, пользовательский текст, tool arguments и ответ модели — недоверенные данные. Текст CRM не меняет system instructions. Не давать tools с произвольным SQL, URL, кодом или именем вызываемого сервиса.
7. Ответы рендерить Angular interpolation, без `[innerHTML]` и bypassSecurityTrustHtml. Ссылки строит клиент по разрешённому типу сущности и числовому id.
8. История может содержать сведения, права на которые позже отозвали. Каждому ответу/набору tool results сохранять union использованных permission keys. При чтении истории, подготовке нового контекста и повторном возврате результата скрывать весь соответствующий ответ и его sources/actions, если прав больше нет; показывать заглушку. Не отправлять старое содержимое модели. Пользовательские сообщения оставлять личными данными автора.
9. Проверять текущие права также перед финальной выдачей ответа: права могут измениться за время запроса к LLM. На frontend при logout очищать Copilot state и отменять загрузки.

## 4. Данные и API: сначала контракт, потом реализация

### 4.1 Таблицы

Создать `apps/api/src/app/modules/copilot/copilot.entity.ts`. Имена колонок и timestamp-конвенции сверять с проектом.

| Таблица | Обязательные данные и ограничения |
| --- | --- |
| `copilot_conversations` | id identity, userId FK, title, createdAt, updatedAt; индекс `(userId, updatedAt, id)` |
| `copilot_messages` | id, conversationId FK cascade, runId nullable, role user/assistant, text, sources jsonb, requiredPermissions jsonb, createdAt; индекс `(conversationId, id)`, unique `(runId, role)` для одной user/assistant message на run |
| `copilot_runs` | UUID id, conversationId FK cascade, userId FK, clientRequestId UUID, requestHash, context jsonb nullable `{kind,id}`, timezone, status running/completed/failed/cancelled, deadlineAt, finishedAt, errorCode, usage jsonb, createdAt; unique `(conversationId, clientRequestId)`, partial unique running run per conversation; индексы для лимитов |
| `copilot_actions` | UUID id, conversationId FK cascade, runId FK cascade, userId FK, callId, toolName, validatedPayload jsonb, beforeSnapshot jsonb nullable, requiredPermissions jsonb, status proposed/executed/rejected/expired/conflict, expiresAt, result jsonb nullable, createdAt, executedAt; unique `(runId, callId)` |

`sources` — только `{sourceId, kind, recordId?, label, report?}` из серверного реестра. kind: lead/company/contact/task/analytics. Для task вести к `/leads/:leadId` или `/tasks`, так как отдельного `/tasks/:id` сейчас нет. report допускает только pipeline/team/tasks.

Не хранить chain of thought, ключи, полные ответы HTTP провайдера и бесконтрольные дампы tool results. Сохранять только пользовательский transcript, необходимые предложения/результаты, permission metadata и usage. Сырой протокол LLM нужен в памяти текущего run, не в публичном API.

`requestHash` считать сервером по нормализованным text/context/timezone; при повторе clientRequestId сравнивать весь запрос. Run и user message создавать одной транзакцией. `messages.runId` связывать с runs без циклической обязательной ссылки из runs в messages. Для сохранённых сообщений контекст получать из исходного run, не из текущего маршрута клиента.

Удаление чата удаляет связанные сообщения/runs/actions каскадно, **не откатывает** уже выполненные CRM-изменения. В UI это объяснить. Ограничение хранения: пока пользователь не удалит чат; указать в README. Отдельный юридический audit log не обещать.

### 4.2 HTTP contract

Все маршруты под `/api/copilot`, с JWT и owner-check. Использовать DTO, Swagger и существующий ValidationPipe. IDs и JSON-поля валидировать явно.

| Метод/маршрут | Вход | Результат |
| --- | --- | --- |
| GET `/status` | — | `{enabled, capabilities}` без секретов; disabled работает без настроенного ключа |
| GET `/conversations` | cursor?, limit 1..20 | `{items, nextCursor}` личных чатов |
| POST `/conversations` | `{title?}` | conversation |
| PATCH `/conversations/:id` | `{title}` | conversation |
| DELETE `/conversations/:id` | — | `{deleted:true}`; при активном run вернуть 409 до отмены |
| GET `/conversations/:id/messages` | beforeId?, limit 1..50 | `{items, nextCursor}` в определённом порядке; redaction по правам |
| POST `/conversations/:id/messages` | `{clientRequestId, text, context?: {kind,id}, timezone}` | `{runId,status}` с HTTP 202; повтор requestId возвращает тот же run, новый текст с тем же id → 409 |
| GET `/runs/:runId` | — | `{status, messages, actions, errorCode?, usage?}`; только безопасные данные этого run |
| POST `/runs/:runId/cancel` | — | текущий status; идемпотентно |
| POST `/actions/:id/confirm` | **пустой body** | сохранённый result/status; payload берётся исключительно из БД |
| POST `/actions/:id/reject` | **пустой body** | status; повтор идемпотентен |

С первого рабочего варианта использовать async run и polling раз в секунду. Так долгий LLM-запрос не привязан к одному HTTP-ответу, результат можно восстановить после reload. Не добавлять очередь: запускать ограниченный runner внутри API с обязательным `.catch`, finally и deadline. При рестарте отмечать незавершённые просроченные run как failed; проверять deadline в чтении/старте. В multi-instance режиме не помечать живые run другого инстанса failed до deadline. CRM-записи runner самостоятельно не меняет.

HTTP 400 — ввод; 401 — сессия; 403 — недостаточно прав; 404 — нет/чужой ресурс; 409 — конфликт или активный run; 429 — лимит; 503 — Copilot выключен. Ошибки провайдера внутри принятого run отображать через стабильные errorCode, без сырого текста/headers upstream.

### 4.3 Инструменты модели

Определить allowlist в `copilot-tools.ts`: schema, описание, permissions, read/proposal. Включать в запрос только доступные инструменты, но при вызове повторять проверку прав. Не принимать от клиента role/system/tool messages.

| Инструмент | Назначение | Минимальные права |
| --- | --- | --- |
| `search_records` | kind lead/company/contact, search, ownerId?, cursor?, limit | read выбранного ресурса; вывод компактный |
| `get_record` | kind/id; поля и разрешённые связи | read выбранного ресурса; связи по своим правам |
| `get_record_activity` | заметки/история выбранной записи, ограниченная выдача | read соответствующего ресурса |
| `list_tasks` | leadId?, assigneeId?, completion?, dueFrom?, dueTo?, cursor?, limit | tasks:read; без leads:read не возвращать имя/поля лида |
| `get_analytics` | report pipeline/team/tasks, days 7/30/90/all для team | analytics:read; возвращать разрешённые этим правом существующие отчёты, без дополнительных CRM dumps |
| `get_reference_data` | pipelines/statuses, users, custom-field definitions; ограниченные поля | соответствующие pipelines:read / users:read / custom-fields:read |
| `propose_create_record` | kind lead/company/contact, input | write и read ресурса + права ссылок |
| `propose_update_record` | kind/id, patch | write и read ресурса + права ссылок |
| `propose_create_task` | leadId, type, text, dueAt, assigneeId? | tasks:write, tasks:read, leads:read + users:read при назначении |
| `propose_update_task` | id, разрешённый patch, включая completion | tasks:write, tasks:read; leads:read при выборе нового leadId |
| `propose_add_note` | kind/id, body | read/write ресурса |

Никакого `execute_action` в наборе LLM tools. Только endpoint подтверждения выполняет запись. Предложение от модели — ещё не результат операции.

Для write payload использовать DTO существующих модулей через `plainToInstance` и `validate` с запретом неизвестных свойств. Глобальный HTTP ValidationPipe **не валидирует внутренние tool calls**. До сохранения предложения дополнительно проверять позитивные целочисленные IDs, обязательные строки, FK, принадлежность статуса воронке и custom fields. Преобразования JSON date ↔ Date делать на границе, не менять действующие форматы price/date без отдельной причины.

Неоднозначное совпадение имён → вопрос пользователю с вариантами; запрещено выбирать первую запись. Неизвестная дата/время задачи → уточнение. `timezone` — валидный IANA timezone браузера; server now передавать отдельно. В подтверждении показывать абсолютную дату и timezone. Не выдумывать вероятность сделки, выручку, валюту или историю, которой нет в схеме. Суммы считать БД/существующим отчётом, не LLM.

## 5. Фазы выполнения

### Фаза 0 — подготовить среду и сверить точки интеграции

- [x] Прочитать AGENTS.md, этот план, релевантные локальные skills. Nx targets проверены по `.agents/skills/nx-workspace/SKILL.md`; Angular Developer skill прочитан.
- [x] Проверить `git status`, Node/pnpm и описанный blocker. Node 26.9.0 и pnpm 12.8.1 приняты по указанию пользователя. Настройки pnpm перенесены в `pnpm-workspace.yaml`; overrides сохранены, build policy оставляет разрешённым только `argon2`. Frozen install успешен, lockfile не менялся.
- [x] Через `pnpm exec nx show project <name> --json` проверить api/web/api-e2e/web-e2e targets. Vitest фильтры проверены через `nx run api:test -- --help`; API e2e запускается `vitest --config apps/api-e2e/vitest.config.mts`, web e2e — `playwright test`.
- [x] Прочитать затрагиваемые DTO, сервисы, module exports и соседние tests. Проверены user projection, JWT active-user check, notes компаний/контактов и правила прав.
- [x] До Copilot-правок найти callers CRM create/update/addNote методов (контроллеры и service specs) и записать baseline: 7 API spec files, 86 tests passed.

Результат фазы 0: baseline команда `PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false NX_DAEMON=false pnpm exec nx run api:test -- --run ...` завершилась успешно (7 файлов, 86 тестов). Nx предупреждает, что sandbox запрещает plugin-worker Unix-сокеты, и успешно продолжает работу в основном процессе.

### Фаза 1 — конфигурация, схема, личные чаты (реализация готова; проверка миграции на чистой БД ожидает доступный PostgreSQL)

Создать `modules/copilot/copilot.module.ts`, controller/service/entity и `dto/`. Добавить модуль в AppModule. Новые файлы frontend/API называть по местным конвенциям, не заводить общий shared package ради нескольких интерфейсов.

- [x] Env: `COPILOT_ENABLED` default false, `OPENAI_API_KEY` optional при disabled, `COPILOT_MODEL` обязателен при enabled. Строку `false` разбирать явно, не через `Boolean('false')`.
- [x] Enabled без ключа/модели → понятная startup validation error. Disabled → обычный CRM работает, внешних вызовов нет. Обновить `.env.example` без реальных секретов.
- [x] Создать четыре таблицы, ограничения, индексы и **новую** миграцию через `pnpm db:generate`. Проверить SQL: только четыре новые Copilot-таблицы, FK и индексы; DROP/изменений CRM нет. Применение к чистой тестовой БД ожидает доступный PostgreSQL.
- [x] Реализовать authenticated status и CRUD чатов/чтение сообщений с cursor pagination и owner-check. Заголовок по умолчанию «Новый чат».
- [x] Добавить unit/controller tests: disabled/status, env validation, чужой чат 404, rename/delete conflict, pagination, unknown input fields.

Проверки: 3 API spec-файла, 11 тестов пройдены; `nx run api:build` прошёл. Миграция сгенерирована и проверена статически, но пока не применялась: `DATABASE_URL` не задан, Docker daemon отсутствует.

### Фаза 2 — один провайдер и ограниченный run

Создать `copilot-provider.ts`, `copilot-prompt.ts`, `copilot.types.ts`, `copilot-runner.service.ts` при необходимости отделить runner от CRUD. Не делить на дополнительные классы без самостоятельной ответственности.

- [x] Реализовать запуск run, idempotency clientRequestId, polling, cancel, deadlines и лимиты из §3.2.
- [x] Атомарно проверять лимиты старта: короткая DB-транзакция с блокировкой строки текущего пользователя, проверкой существующего clientRequestId, подсчётом run и вставкой; повтор уже принятого запроса возвращается до проверки лимитов. Просроченные running сначала переводить в failed, чтобы они не блокировали новый run. Partial unique защищает один run на чат. Внешних HTTP внутри транзакции нет.
- [x] Передавать server-side system prompt: роль CRM-помощника, доступные возможности, запрет выдумывать факты/выполнение, недоверенность CRM-текста, запрос уточнений, запрет обхода подтверждения.
- [x] Нормализовать ответ провайдера во внутренние text/tool calls/usage. В текущем цикле сохранять протокол tool calling, включая необходимые response items. Проверять отказ модели, пустой/битый ответ, unsupported output.
- [x] На 429/5xx провайдера допустим один ограниченный retry чтения/генерации в пределах общего timeout. Не запускать повторно CRM-изменения и не повторять весь run автоматически.
- [x] Run status и финальное assistant message сохранять одной короткой транзакцией с CAS по `status=running`. После cancel/deadline не сохранять поздний ответ как completed.
- [x] Cancel сохраняет cancelled в БД; локальный AbortController прерывает upstream, runner других инстансов проверяет статус между шагами и перед публикацией. Cancel не откатывает отдельно подтверждённое действие.
- [x] Логировать runId/userId/model, длительность, количество шагов, usage и errorCode. Не логировать prompt/body, Authorization и axios error object целиком.
- [x] Tests с подменённым provider: normal answer, timeout, cancel, late result, provider 401/429/5xx, превышение шагов, duplicate requestId и два конкурирующих запроса.

Проверки после итогового review: 7 API spec-файлов, 35 тестов пройдены (32 Copilot, 3 env); Copilot suite и `nx run api:build` прошли. Fake-provider тесты не требуют ключа/сети. Фаза 2 намеренно подключает обычный ответ и сохраняет function-call protocol; выполнение CRM-инструментов и многошаговый tool loop добавляет фаза 3. Provider request ограничен одним вызовом на run в текущей фазе; верхний лимит 6 применяется при расширении цикла.

### Фаза 3 — чтение CRM и проверяемые источники

Создать `copilot-tools.ts`, `copilot-tools.service.ts`; импортировать существующие CRM modules. Добавить export AnalyticsService в AnalyticsModule. Остальные exports добавлять только если фактически отсутствуют.

- [x] Реализовать read-инструменты из §4.3. Для ограниченных SQL-выборок расширить существующие сервисы внутренним методом/необязательным параметром, сохранив текущие HTTP-ответы. Не открывать произвольный query builder модели.
- [x] Добавить нужные фильтры задач на уровне БД. Сервер определяет «просрочено» по dueAt/isCompleted и now; LLM только объясняет результат.
- [x] Сделать безопасные проекции полей, проверку каждого связанного ресурса и явный `truncated/nextCursor` в ограниченных результатах.
- [x] Создавать sourceId на сервере для реально полученных записей/отчётов. Итоговый ответ должен включать текст и выбранные sourceIds через проверяемый структурированный результат. Неизвестные sourceIds отклонять, не превращать в ссылки.
- [x] Повторить проверки прав при возврате сохранённой истории и финального результата. Не отправлять модели скрытые старые ответы.
- [x] Поддержать сценарии «найди компанию», «сводка лида», «мои просроченные задачи», «состояние воронки», «черновик письма» через доступные инструменты и контекстные инструкции.
- [x] Tests: unknown tool, invalid args, SQL-подобный search как обычный параметр, нет прав, права отозваны между шагами, injection в заметке, пустая выборка, много результатов, поддельный sourceId, отсутствие passwordHash/секретов.

Результат фазы 3: Copilot предлагает только разрешённые read-tools, повторно проверяет права при вызове и публикации, использует bounded запросы CRM-сервисов и сохраняет только подтверждённые источники. Проверки: targeted API tests — 7 файлов, 42 теста; `api:build` проходит. Тесты используют поддельные сервисы/provider; подключение к БД не выполнялось.

Готово: помощник отвечает на данных CRM, с корректными источниками и ограниченными выборками. Факты без данных не выдаются за известные; советы явно отделены от фактов.

### Фаза 4 — предложения без записи в CRM

Создать `copilot-actions.service.ts`, реализовать proposal-инструменты и endpoint reject.

- [x] Каждое предложение валидируется по DTO и текущим read/write/link permissions. Неизвестные IDs/обязательные значения → уточнение/ошибка инструмента, без записи.
- [x] Сохранить canonical payload, необходимые permissions, срок, snapshot изменяемой записи и серверный preview с названиями полей и before/after. Скрытые связи в preview не раскрывать.
- [x] Повтор одного tool call в run не создаёт дубль предложения: связать proposal с `(runId, call_id)` уникальным ограничением. Одинаковый call_id с другим payload → ошибка.
- [x] Изменение пользователем текста запроса после preview создаёт новое предложение. Confirm не принимает от клиента patch. В этой версии карточка preview не редактирует payload.
- [x] Ответ модели говорит «Предлагаю создать/изменить», пока action не executed. Строка «да» в чате не выполняет действие: показать кнопку подтверждения.
- [x] При cancel/failed run его неподтверждённые предложения недоступны для выполнения. Подтверждать можно только опубликованные proposals завершённого run.
- [x] Tests для каждого типа proposal, неверных FK/status/custom fields, неоднозначности, expiry/reject и отсутствия CRM-вставок до confirm.

Результат фазы 4: разрешённые write-intent инструменты создают только серверно валидированные proposals; reject доступен владельцу только для action из завершённого run. CRM write методы не вызываются. Проверки: targeted Copilot tests — 8 файлов, 48 тестов; `api:build` проходит. DB не подключалась.

Готово: любой write-tool создаёт только карточку предложения. Проверено, что CRM остаётся неизменной без endpoint confirm.

### Фаза 5 — атомарное подтверждение и восстановление

Это самая чувствительная фаза. Её нельзя заменять frontend-блокировкой кнопки или обещанием модели.

- [x] Перед confirm проверить активного пользователя, owner, completed run, текущие permissions и разрешённые ссылки.
- [x] Открыть короткую DB-транзакцию, заблокировать action `FOR UPDATE`. Если executed — вернуть сохранённый результат; rejected/expired/conflict — вернуть соответствующий отказ. Истёкшее proposed перевести в expired.
- [x] Для update заблокировать изменяемую запись и сравнить актуальные значения со snapshot из preview. Сравнивать также изменяемые связи: одного `updatedAt` недостаточно для всех типов записей. При расхождении завершить action как conflict без CRM-изменения, предложить сформировать новое preview.
- [x] Выполнить существующий CRM write в **этой же транзакции**, затем сохранить action.result/status=executed. Для этого добавить минимальную возможность передавать transaction executor в затронутые create/update/addNote методы. Все старые callers продолжают работать без аргумента. Внутренние чтения после записи также используют тот же executor. Существующие транзакции, custom-field validation и lead activity сохраняются.
- [x] Тип transaction executor вывести из Drizzle/Database и использовать один локальный общий тип в database module. Не обходить типизацию через `any`. Переданные executor корректно используется без вложенной транзакции и без независимого DB-соединения.
- [x] В confirm нет LLM/HTTP. Итог для пользователя — детерминированный результат сервера и ссылки. Поздняя ошибка LLM не превращает выполненное действие в failed.
- [x] При ошибке записи ошибка выходит из транзакции; CRM-запись и executed status откатываются вместе, proposal остаётся повторяемым.
- [x] Отказ/reject и confirm конкурируют за одну блокировку action; из двух операций побеждает одна. Повтор confirm после потерянного HTTP-ответа возвращает тот же result.
- [x] На frontend обновить затронутые ресурсы и карточки после confirmed result. Перед обновлением открытой формы с unsaved changes показать уведомление и сохранить черновик пользователя; не затирать его автоматической перезагрузкой.
- [ ] DB integration tests на изолированном PostgreSQL: два confirm одновременно → одна CRM-запись; ошибка после CRM insert перед action update → полный rollback; потеря ответа + retry; confirm/reject race; запись изменилась после preview; удалена связанная запись; отозваны права; чужой action; completed task и повтор confirm.

Результат фазы 5: confirm/reject используют action row lock и общую транзакцию с CRM write; повтор confirm возвращает сохранённый результат, права проверяются внутри транзакции, snapshot включает связанные IDs. Fake transaction tests проходят. Frontend после подтверждения обновляет чистые карточки и сохраняет dirty draft с уведомлением. PostgreSQL integration tests не добавлены: безопасная отдельная тестовая БД недоступна; миграции не применялись и к dev DATABASE_URL не подключались.

Готово: успешное изменение и его сохранённый результат атомарны. Запись через Copilot сохраняет те же бизнес-правила и историю, что обычный UI.

### Фаза 6 — полноценная страница Copilot

Создать `apps/web/src/features/copilot/copilot-api.ts`, `copilot-types.ts`, `copilot-state.ts`, `copilot-chat/`, `copilot-page/`. Разделять UI на дополнительные компоненты только когда это упрощает chat/action/source повторное использование.

- [x] Добавить authenticated lazy route `/copilot` и пункт меню в `app.ts` по текущему шаблону. Enabled status управляет доступностью ввода; disabled показывает объяснение конфигурации без секретов и сохраняет доступ к истории.
- [x] Sidebar чатов: список, новый чат, переименование, удаление с объяснением, что CRM-изменения сохранятся. Пагинация истории и списка.
- [x] Общий chat component: user/assistant messages, suggestions, textarea, send/stop, progress, sources, action preview с confirm/reject, copy для ответов.
- [x] На отправке создать один clientRequestId. Повтор после сетевой ошибки использует тот же id. После 202 выполнять polling; после reload восстановить активный run по серверным сообщениям и polling без повтора уже принятого сообщения. Предложения из runs текущей страницы истории восстанавливаются при выборе чата.
- [x] UI ошибок 401/403/409/429/disabled, retry, failed/cancelled status. Блокировать только конфликтующие действия; текст ввода сохранять при ошибке отправки.
- [x] Источники — RouterLink по allowlist. В preview показывать тип операции, запись, поля before/after, абсолютную дату/timezone и expiry. Кнопка confirm заблокирована пока идёт запрос; сервер остаётся главным механизмом защиты дублей.
- [x] Состояние на signals, обычный HttpClient/interceptor; новый state manager не установлен.
- [x] Keyboard: Enter отправляет, Shift+Enter переносит; не отправлять во время IME composition. Accessible names, aria-live для статуса, фокус после действий, нормальная работа на узком экране.
- [x] Unit tests: send/retry ID, восстановление run, отмена, source routes, confirm/reject, redacted messages, logout cleanup, HTML как текст.

Результат фазы 6: добавлена защищённая lazy-страница и переиспользуемый chat component; история и proposals восстанавливаются с API, pending запрос хранится на время вкладки для безопасного повтора с прежним clientRequestId. Первичные проверки фазы: focused web tests — 9 тестов; `ngc -p apps/web/tsconfig.app.json` и web lint проходят. Web build повторно проверен в фазе 7 с `NX_ISOLATE_PLUGINS=false`, `--output-style=stream --verbose` и `NG_BUILD_MAX_WORKERS=1`; все попытки завершились кодом 1 на `Building...` без compiler diagnostics.

Готово: через браузер можно пройти полный сценарий поиска → уточнения → предложения → подтверждения → перехода к изменённой записи.

### Фаза 7 — контекст карточки и панель

- [x] Разместить кнопку Copilot в shell и кнопку «Обсудить в Copilot» в сохранённых lead/company/contact карточках. Для new/invalid id контекст не отправлять.
- [x] Использовать один chat component и один state для page/panel. Переключение представления не дублирует run, polling и историю. В каждый момент держать один активный экземпляр chat UI.
- [x] В context передавать только `{kind,id}`; данные заново читает API с проверкой прав. Несохранённый draft формы не собирать из DOM.
- [x] Перед отправкой показывать видимый context chip с именем записи и возможностью убрать. Смена маршрута не меняет незаметно контекст уже отправленного сообщения. Предыдущие сообщения сохраняют исходный контекст.
- [x] PrimeNG Drawer по установленному API. На mobile ширина панели равна доступному экрану; Escape/close, встроенный focus trap и возврат фокуса к кнопке открытия.
- [x] После confirmed write обновлять данные текущей карточки при чистой форме; при несохранённом draft сохранять его и показывать сообщение. Существующие canDeactivate guards не менялись.
- [x] Unit tests покрывают привязку контекста к run, старый контекст в истории, замену выбранной карточки во время run, закрытие панели без остановки run и context chip.

Результат фазы 7: shell и сохранённые карточки открывают одну общую Copilot-сессию в PrimeNG Drawer; API возвращает сохранённый context reference run, не значения формы. Focused проверки: web Copilot tests — 13 тестов; API `copilot.service.spec.ts` — 8 тестов; web typecheck и lint, API build проходят. Web production/development build остаётся технически непроверенным из-за бездиагностического выхода Nx Angular builder на `Building...`.

Готово: Copilot доступен из рабочего контекста и не теряет/не затирает данные формы.

### Фаза 8 — поток событий и отмена без потери результата

Polling из фазы 2 остаётся fallback. Для progressive UX добавить GET `/runs/:id/events` как SSE; перед каждым подключением JWT/owner-check.

- [x] На клиенте читать поток через fetch с Authorization и AbortController: native EventSource не умеет текущий Bearer header. Токен в URL запрещён. Использовать AuthApi token и существующие правила обработки 401; не создавать второй auth store.
- [x] События: `status`, `tool_started`, `tool_finished`, `text_delta`, `completed`, `failed`, `cancelled`; включать runId. Не передавать сырые args, CRM dumps, reasoning и provider events.
- [x] В первой версии достаточно stream прогресса и безопасно подготовленного текста. Если выдавать токены до финальной проверки источников/прав, нельзя их отозвать: поэтому raw provider deltas не публиковать. Финальный валидированный ответ можно отдавать частями после сохранения.
- [x] SSE status брать из сохранённого run и безопасного локального прогресса. На другом API-инстансе допустим только status/final; не добавлять distributed event bus ради прогресса.
- [x] После reconnect получать каноническое состояние через GET run, не запускать генерацию повторно. Дедупликация по persisted message/action IDs. Потеря stream не отменяет run; Stop вызывает отдельный cancel endpoint.
- [x] Ограничить число SSE-подключений на пользователя, закрывать их по terminal state/deadline, убирать listeners/timers при disconnect.
- [ ] Проверить отсутствие buffering на фактическом proxy, если он используется. В workspace proxy/deployment config не найден; внешняя конфигурация не предоставлена.
- [x] Tests: split SSE chunks, UTF-8, disconnect/reconnect, unauthorized, duplicate final, cancel, fallback polling и cleanup.

Результат фазы 8: добавлены SSE прогресс и безопасные persisted-text deltas; reconnect сверяет GET run, затем переключается на polling без повторной генерации. Целевые API Copilot и web Copilot tests проходят; полный `api:test` также проходит после проверки. Добавлен тест graceful API shutdown: локальный run помечается `server_restarted`. Реальный proxy не указан, поэтому buffering не проверен.

### Фаза 9 — интеграционная приёмка, эксплуатация, документация

- [x] Добавить API integration suite с Nest TestingModule и deterministic fake provider; реальный JwtAuthGuard/JwtStrategy выполняются. Проверки прав выполняются существующими CopilotToolsService/CopilotActionsService tests. Публичный test endpoint и выбор fake provider клиентом не добавлялись.
- [ ] Для DB atomicity использовать отдельную тестовую БД с миграциями. Никогда не выполнять truncate/cleanup на dev/prod DATABASE_URL. Test URL должен быть явным, проверенным fixture.
- [x] Добавить browser e2e с Playwright routing для UI-сценариев; отдельно API integration тестирует реальный backend. Не рассчитывать на production LLM в обычном CI.
- [x] Добавить повторяемые fake-provider tests; проверять нормализованный ответ, разрешённые tool calls и effects, не точное совпадение художественного текста.
- [x] Обновить README: возможности и ограничения, env, запуск, privacy, хранение/удаление истории, лимиты, ошибки, проверка модели, рестарт run, что именно означает «подтверждено».
- [x] После интеграции выполнить обязательную команду `PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm nx run-many -t lint test build`. Все lint targets, `api:test` и `api:build` прошли; `web:build:production` завершился кодом 1 на `Building...` без compiler diagnostics. Тесты не ослаблялись; проверки передачи transaction executor валидации обновлены.
- [x] Запустить Copilot browser e2e по фактическому Nx target `web-e2e:e2e-ci--src/copilot.spec.ts`: 6 тестов прошли в Chromium, Firefox и WebKit. Browser binaries установлены во временный каталог `/private/tmp`; браузеры не добавлялись в репозиторий.
- [ ] API e2e target не запускался: global setup может завершить процесс на настроенном порту, а отдельной тестовой БД и изолированного API здесь нет.
- [ ] Ручной live smoke test только с предоставленным dev API key и синтетическими CRM-записями. Если ключа нет, отметить это; не объявлять реальный provider проверенным.
- [x] Просмотреть итоговый diff на секреты, непредусмотренные миграции и public test hooks; `git diff --check` прошёл. Добавлена только новая Copilot migration; тестовый provider используется только через Nest test override. Изменения не коммитились.

Первичная проверка реализации: `lint`, `api:test`, `api:build`, Copilot browser e2e и diff check прошли. Production build web тогда падал без сообщения компилятора. API e2e и DB/PostgreSQL atomicity не запускались без изолированной тестовой БД; фактический proxy buffering и live provider оставались непроверенными. Миграция не применялась.

Исправления после ревью, 24 октября 2026: права использованной истории наследуются новым ответом и проверяются перед сохранением; устранено двойное преобразование custom fields; добавлены связанные контакты лида с SQL LIMIT и проверкой `contacts:read`; восстановление pending-запроса использует `clientRequestId` из API; logout отменяет HTTP и блокирует продолжения старой сессии; пагинация командной аналитики имеет уникальный ключ сортировки. Дополнительно защищены запоздалые загрузки сообщений/предложений при переключении чатов. Добавлены регрессионные тесты.

Повторная интеграционная проверка: `CI=true NX_SKIP_NX_CACHE=true NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm nx run-many -t lint test build -p api web` прошла без кэша Nx. Copilot browser e2e прошёл повторно: 6 тестов в Chromium, Firefox и WebKit. Причина прежнего немого падения web установлена по macOS crash report: SIGABRT в нативном LMDB-кэше Angular. `CI=true` отключает persistent Angular cache; production bundle компилируется и проходит error budgets, остаются предупреждения о размерах. Рабочая команда описана в README. Live LLM, API e2e и атомарность на отдельном PostgreSQL этим исправлением не проверены; миграции не применялись.

## 6. Матрица приёмки

| Сценарий | Ожидаемое поведение |
| --- | --- |
| Copilot disabled, нет API key | CRM запускается; Copilot объясняет отключение; внешних вызовов нет |
| «Найди компанию Acme» | Только доступные результаты, короткие поля, рабочие ссылки |
| Две компании с одним именем | Просит выбрать; не связывает запись с первой автоматически |
| «Что происходит с этим лидом?» | Сводка по сохранённому lead context, заметкам и задачам; источники |
| «Что у меня просрочено?» | assigneeId из текущего пользователя; серверные даты и completion; ограничение выдачи обозначено |
| «Покажи всю воронку» | Существующий аналитический отчёт, точные count/sum; не сумма первых 20 лидов |
| «Напиши письмо клиенту» | Только черновик, без отправки; не выдуманы реквизиты/обязательства |
| «Создай задачу позвонить завтра» без времени/лида | Уточнение недостающих данных |
| Создание лида | Корректные pipeline/status/custom fields; preview; до confirm записей нет |
| Изменение компании/контакта и заметка | Соблюдены DTO, права и история соответствующего сервиса |
| «Перенеси лид в другой статус» | Preview before/after; status той же воронки либо явно согласована смена pipeline |
| «Заверши задачу» | Одно подтверждаемое изменение, после него UI показывает актуальное состояние |
| «Удалить все лиды» | Объяснение ограничения, нет delete/bulk tools |
| Prompt injection в заметке | Текст не даёт права выполнять действие/раскрывать секреты |
| Write tool без write permission | 403/безопасный tool error; proposal/изменение не появляются |
| Права отозваны после preview или во время run | Confirm запрещён; устаревшие ответы/источники скрыты и не попадают в новый LLM context |
| Чужой conversation/run/action ID | 404, без содержимого и metadata чужого объекта |
| Повтор send после обрыва | Тот же clientRequestId → тот же run, одна user message |
| Double confirm / confirm из двух вкладок | Один CRM-эффект, одинаковый сохранённый result |
| Ошибка между CRM write и action save | Общая транзакция полностью откатывается |
| Запись изменена другим пользователем после preview | Conflict, данные не перезаписаны; новое preview требует нового confirm |
| Provider timeout/429/invalid tool call | Ограниченный run, понятная ошибка, секреты не раскрыты |
| Cancel/reload/restart | Terminal state честный; нет скрытого выполнения write; успешные подтверждения доступны из БД |
| Открытая карточка с unsaved changes | Copilot не стирает draft и не читает его без явного отдельного механизма |
| Mobile/keyboard/HTML в ответе | Интерфейс доступен, фокус корректен, HTML не исполняется |

## 7. Что передать исполнителю вместе с документом

Скопируй следующий запрос, выбрав режим выполнения:

> Прочитай AGENTS.md и docs/copilot-implementation-plan.md в workspace opencrm. Реализуй CRM Copilot по этому плану. Начни с фазы 0, затем выполняй фазы последовательно. **[ВЫБЕРИ: остановись после первой завершённой фазы / продолжай непрерывно до завершения всех фаз]**. Сначала схема и контракты, затем зависимый код. Используй существующие CRM services, DTO, UI-компоненты и auth. Не заменяй проверки прав prompt-инструкциями, подтверждение — текстом «да», а атомарность — блокировкой кнопки. Для каждой фазы отмечай сделанные пункты, выполняй focused tests; полную проверку запусти после интеграции. Не коммить, не редактируй старые миграции, не трогай чужие изменения. Если нужен API key, реализуй и проверь всё доступное через fake provider, затем явно укажи оставшийся live smoke test. Итог: изменённые файлы, проверенные сценарии, реальные результаты команд, оставшиеся ограничения. Не называй Copilot готовым, если обязательная матрица не выполнена.

Если исполнителю делегируется фаза 5, полезна независимая проверка транзакций/конкурентных тестов. Остальные фазы не требуют автоматического набора агентов. Схему, общие типы и exports завершать до зависимых задач; не поручать двум исполнителям одни файлы одновременно.
