# План: доменная модель CRM → публикация

## Смена курса

Прошлая редакция этого плана вела к быстрой публикации через тонкий срез: плоский `status`-строкой, денормализованные `companyName`/`contactName`, Contacts и Companies без своих таблиц. Курс сменён: **строим домен нормально, публикация уезжает в конец**.

Причина — срез заставлял фронт деградировать. Моки во фронте изначально написаны под реляционную модель (`Pipeline` со вложенными `Status[]`, `Lead.statusId`/`pipelineId`, массивы `contacts[]`/`companies[]`), и плоская схема требовала выкинуть переключатель воронок, схлопнуть контакты в строку и переписать половину `leads-page.ts`. Новая модель ложится на существующий фронт почти один в один — работы по фронту становится **меньше**, а не больше.

---

## Статус

**Этапы 0–3 закрыты.** Схема домена целиком в коде и в одной миграции `0001_clumsy_gideon.sql`, применена локально. Все пять модулей (`pipelines`, `custom-fields`, `companies`, `contacts`, `leads`) зарегистрированы в `app.module.ts`, приложение поднимается, эндпоинты отдаются, 207 unit-тестов зелёные.

Составной FK проверен на живой базе: вставка лида со статусом из чужой воронки отбивается Postgres с `Key (statusId, pipelineId)=(2,1) is not present in table "statuses"`. Валидация в сервисе для этого не нужна.

**Следующее — Этап 4 (сиды)**, затем добивка тестов, README и фронт.

## Что уже сделано — не переделывать

- **Cleanup скаффолда**: снесены `packages/api/products`, `packages/shared/models`, `libs/shared`, `libs/plugin-sdk`, вычищены path-алиасы и секция README. Проверено.
- **Health-check**: `GET /api/health` → `{ status: 'ok' }`, публичный, `apps/api/src/app/app.controller.ts`.
- **e2e-заглушки**: `api-e2e` проверяет health, `web-e2e` — реально отображаемый заголовок Desktop.
- **`auth.service.spec.ts`** — 4 теста, к доменной модели не привязаны.
- **Нейминг во фронте**: `responsibleUserId` → `ownerId`, `Task.responsibleUserId` → `assigneeId`, `responsibleName` → `ownerName`/`assigneeName`, `responsibleFilter` → `ownerFilter`. Вхождений `responsible` в `apps/web/src` не осталось.
- **Аудит демо-данных** — проведён, блокер закрыт, см. ниже.
- **Фронт на реальном API** (Этап 6) — auth, guard, интерсептор, dev-прокси; leads/pipelines/companies/contacts/users читаются через `httpResource`, вкладка Users в настройках редактирует пользователя через `PUT /api/users/:id`. Моков в `apps/web` не осталось.
- **Модуль задач** — `apps/api/src/app/modules/tasks/`: таблица `tasks` (миграция `0002_hesitant_lockjaw.sql`), CRUD с фильтрами `leadId`/`assigneeId`/`isCompleted`, задачи удаляются каскадом вместе с лидом. Страница Tasks и блок «Next step» на канбане читают этот эндпоинт.
- **Фильтры списков** — `leads`, `contacts`, `companies` и `tasks` принимают фильтры одним query-DTO, поэтому мусор в параметре отбивается 400, а Swagger собирает параметры из DTO.

## Что выбрасывается и переписывается

- `apps/api/src/app/modules/leads/lead.entity.ts` — плоская модель, заменяется целиком.
- `apps/api/drizzle/0001_remarkable_blackheart.sql` + `meta/0001_snapshot.json` — **удалить**, откатив локальную БД, и сгенерировать одну чистую миграцию под всю новую модель. В публичной истории не должно быть цепочки «создали таблицу → тут же перестроили».
- `apps/api/src/app/modules/database/seed-leads.ts` — переписать под связи.
- `apps/api/src/app/modules/leads/leads.service.spec.ts` — 16 тестов ассертят точный SQL, после джойнов не выживет ни один.
- `leads.service.ts`, `leads.controller.ts`, `dto/*` — переписать.

---

## Целевая модель

```ts
// Воронки и стадии
pipelines      (id, name, sortOrder)
statuses       (id, pipelineId → pipelines.id CASCADE, name, color, sortOrder)
               UNIQUE (id, pipelineId)          // нужен для составного FK ниже

// Справочники
companies      (id, name, industry, address, email, phone,
                ownerId → users.id SET NULL, customFields jsonb, createdAt, updatedAt)
contacts       (id, name, position, companyId → companies.id SET NULL, email, phone,
                ownerId → users.id SET NULL, customFields jsonb, createdAt, updatedAt)

// Лиды
leads          (id, name, price, source,
                pipelineId, statusId,            // составной FK → statuses (id, pipelineId)
                companyId → companies.id SET NULL,
                ownerId → users.id SET NULL,
                customFields jsonb, createdAt, updatedAt)
lead_contacts  (leadId → leads.id CASCADE, contactId → contacts.id CASCADE)
               PRIMARY KEY (leadId, contactId)

// Кастомные поля
custom_field_definitions (id, entityType, key, label, type, options jsonb,
                          isRequired, sortOrder)
                         UNIQUE (entityType, key)
```

### Ключевой приём: составной FK на статус

Лид хранит и `pipelineId`, и `statusId`. Наивно это разъезжается — статус из одной воронки попадает лиду из другой, и поймать это можно только валидацией в сервисе. Вместо этого запрещаем на уровне БД:

```ts
export const statuses = pgTable('statuses', { /* ... */ }, (t) => [
  unique('statuses_id_pipeline_key').on(t.id, t.pipelineId),
]);

export const leads = pgTable('leads', { /* ... */ }, (t) => [
  foreignKey({
    columns: [t.statusId, t.pipelineId],
    foreignColumns: [statuses.id, statuses.pipelineId],
  }),
]);
```

Postgres сам не даст вставить лид со статусом из чужой воронки. Сигнатура `foreignKey({ columns, foreignColumns })` с массивами в установленной версии drizzle-orm проверена.

---

## Зафиксированные решения

1. **customFields — гибрид**: таблица определений + `jsonb` со значениями на самой записи. Не EAV: список лидов — горячий путь, платить джойном и пивотом на каждой карточке ради пары полей не стоит. Переезд на EAV потом возможен без смены публичного API.
2. **Таблица определений общая** для всех сущностей, разделение через `entityType` (`lead` | `company` | `contact`).
3. **Набор типов**: `text` | `number` | `date` | `boolean` | `select` (варианты в `options`). Больше пока не нужно.
4. **Осиротевшие ключи чистим.** Удаление определения и вычистка ключа из данных идут **в одной транзакции**: `UPDATE <таблица> SET "customFields" = "customFields" - '<key>'` по таблице, соответствующей `entityType`.
5. **Валидация значений** — в общем `CustomFieldsService`, который дёргают сервисы leads/companies/contacts перед записью: ключ существует для этого `entityType`, тип значения совпадает с определением, `isRequired` соблюдён, для `select` значение входит в `options`.
6. **У лида одна компания** (FK) и **много контактов** (join-таблица `lead_contacts`).
7. **Companies и Contacts — полный CRUD**: entity, DTO, service, controller, тесты, наравне с leads.
8. **Без пагинации** — как и раньше, `findAll()` отдаёт весь список. Демо-масштаб.
9. **Без RBAC-enforcement** — `JwtAuthGuard` на контроллерах, `permissions.catalog.ts` остаётся демонстрацией схемы. Отдельный будущий шаг.
10. **Swagger-аннотации** (`@ApiTags` + `@ApiBearerAuth`) — на всех новых контроллерах.

---

## Порядок работ

Зависимости выстроены так, чтобы этапы 1–3 можно было раздать параллельно, а 4 собрать поверх.

### Этап 0 — Сброс миграции

Удалить `0001_*.sql` и `meta/0001_snapshot.json`, дропнуть таблицу `leads` в локальной БД. Дальше все новые таблицы приезжают одной миграцией `0001` в конце Этапа 3.

### Этап 1 — Pipelines + Statuses

Модуль `apps/api/src/app/modules/pipelines/`: обе таблицы в одном модуле (статусы не существуют отдельно от воронки). CRUD на воронки, CRUD на статусы внутри воронки. `UNIQUE (id, pipelineId)` на statuses — обязательно, без него не соберётся FK лида.

### Этап 2 — Custom Fields

Модуль `apps/api/src/app/modules/custom-fields/`: CRUD определений + `CustomFieldsService.validate(entityType, payload)` + вычистка осиротевших ключей при удалении. Экспортировать сервис, его будут инжектить три других модуля.

### Этап 3 — Companies → Contacts → Leads

Строго в этом порядке, contacts ссылается на companies, leads — на обоих.

- **Companies**: полный CRUD, `customFields` через `CustomFieldsService`.
- **Contacts**: полный CRUD, `companyId` FK.
- **Leads**: переписать существующий модуль. `findAll(filters)` с джойнами на statuses/companies/users, фильтры по `ownerId` / `pipelineId` / `statusId` / `search`. Контакты лида — отдельные эндпоинты привязки/отвязки либо массив `contactIds` в DTO.
- Сгенерировать **одну** миграцию на всё, прочитать SQL глазами, применить.

### Этап 4 — Сиды

Переписать `seed-leads.ts` → сид всего домена: воронки со стадиями (из моков `leads-api.ts`: Pipeline 1 с 4 стадиями, Pipeline 2 с 3), компании, контакты, лиды со связями, пара определений кастомных полей для демонстрации. Guard от повторного запуска. Владельцы резолвятся по существующим пользователям, при отсутствии — `null`.

**Демо-данные брать НЕ из текущих моков** — см. блокер ниже.

### Этап 5 — Тесты

Переписать `leads.service.spec.ts` под новую модель, добавить спеки на companies, contacts, pipelines, custom-fields. Подход сохранить тот, что уже себя оправдал: мокается `pg.Pool.query`, SQL строит настоящий Drizzle, ассертятся текст запроса и параметры. Проверять мутацией — намеренно сломать ветку логики и убедиться, что падает профильный тест, а не все подряд.

### Этап 6 — Фронт

**Сделано** (сделано раньше сидов, поэтому до Этапа 4 все списки в UI пустые). Моки лидов, компаний, контактов и пользователей удалены из `apps/web` — если понадобятся как источник для сидов, они есть в git-истории до этого изменения.

### Этап 7 — Публикация

- README переписать последним: что реализовано end-to-end, что UI-прототип, что запланировано.
- Финальный прогон `pnpm nx run-many -t lint test build` + ручная проверка полного цикла.
- Смена видимости репозитория — **только с отдельного явного подтверждения**, необратимо открывает всю историю коммитов.

---

## Открытые блокеры

1. ~~**Демо-данные содержали реальные объекты**~~ — **закрыто**. Аудит подтвердил в моках живые домены с рабочими MX-записями, дозвонимые телефоны на реальных префиксах операторов, действующие физические адреса и названия зарегистрированных юрлиц. Всё заменено: домены на зарезервированные RFC 2606 (`example.com`/`.org`/`.net`, без MX), абонентские части телефонов на синтетические последовательности, адреса и названия — на обобщённые.
   Подробная опись осталась только локально и намеренно **не коммитится** (она целиком состоит из тех самых данных). При переносе демо-данных в бэкенд-сиды на Этапе 4 брать значения из текущих, уже очищенных моков.
2. **`.env` без `ADMIN_EMAIL`/`ADMIN_PASSWORD`** — `pnpm db:seed-admin` падает, залогиниться нечем. В `.env.example` они задокументированы, просто не перенесены.
3. **`api-e2e` не запускается** — таргет настроен на jest, а jest в зависимостях нет.

## Проверка

- `pnpm nx run-many -t lint test build` — весь монорепо зелёный.
- Составной FK работает: попытка присвоить лиду статус из чужой воронки отбивается базой, а не только сервисом.
- Удаление определения кастомного поля вычищает ключ из всех записей своей сущности.
- Лид с несколькими контактами корректно отдаётся и обновляется.
- Swagger `/api/docs` показывает все модули с bearer-lock.
- В браузере: логин → канбан с данными из сида, переключение воронок меняет набор стадий.
