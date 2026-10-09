# BlockDistraction Chromium E2E

Цільова версія: **5.3.20**. Playwright: **1.62.1**, Node.js: **20+**.

## Статус перевірки

Набір запускає реальний Chromium із завантаженим MV3-розширенням.
Оцінюйте результат для конкретного commit SHA у GitHub Actions та
`results.json`: Node suite, синтаксичні перевірки і `--list` не є E2E.
Помилка запуску браузера до scenario body не підтверджує поведінку розширення.

На `05d5708c45c0cfbf4306a27fbd9e44c5f3889381`
[run 37946464789](https://github.com/MarkAlexI/blockSiteExtension/actions/runs/37946464789)
має **37 passed / 2 failed**, Extension CI успішний. Обидва alarm bodies
пройшли native unload/wake та cold-state poll, але зупинилися на помилковій
вимозі `event.count === 1`. У вкладеннях cold ActivityLog має 83/51 записи,
усі з raw `COUNT=0`, без parser errors. Native PID збережено, JS-маркер
зник, session sentinel залишився; три alarms доставлено в різному порядку.
[Chromium 151 Action](https://github.com/chromium/chromium/blob/151.0.7922.34/chrome/browser/extensions/activity_log/activity_actions.h)
починає `count_` з нуля; це поле обліковує merged database records.
Live `PrintForDebug` history тепер вимагає точний raw zero. Позитивні counts
1/2, missing/duplicate callbacks, неправильний timestamp і transient writes
залишаються помилками. Усі cold-history assertions пройшли replay обох
збережених CI-вкладень після виправлення; це не новий browser run.
UI/navigation частина після history ще потребує нового CI. Runtime,
версія, timeouts/retries і native parser незмінні.

На `e8a33f6b9cfb4313f5d00d6d4ec99482b512aff4`
[run 37942510361](https://github.com/MarkAlexI/blockSiteExtension/actions/runs/37942510361)
має **37 passed / 2 failed**, Extension CI успішний. Обидва нові alarm bodies
пройшли warm ActivityLog, UI Focus storage та DNR positive controls, але
зупинилися до idle unload: Chromium забороняє dynamic `import()` у service worker.
Fixture тепер імпортує встановлений production calendar у вже відкритому
Options Window, використовуючи його native Date/Intl і справжній storage API.
Перед idle ця сторінка закривається разом з іншими extension views.
Alarms, passive unload/wake observation, history та assertions збережені;
runtime і версія незмінні. Повне виконання двох bodies потребує нового CI.
Coherent Popup scenario цього разу пройшов; першопричину попередніх порожніх
native translations цим не встановлено.

На `f8ad68b0eaf180afd3202a93b2ba68d30944842c`
[run 37925397622](https://github.com/MarkAlexI/blockSiteExtension/actions/runs/37925397622)
має **36 passed / 3 failed**, Extension CI успішний. Обидва нові alarm bodies
зупинилися на warm ActivityLog control до Focus setup/idle; вкладення містять
нуль розпізнаних events. Parser помилково очікував basename, тоді як
[Chrome 151 logging source](https://github.com/chromium/chromium/blob/151.0.7922.34/base/logging.cc)
залишає `chrome/browser/extensions/activity_log/activity_log.cc` у prefix.
Виправлення приймає цей точний native шлях; усі positive controls, history,
idle/wake та assertions збережено. Raw stderr того запуску не було у вкладеннях,
тому виправлений parser ще потребує native підтвердження у новому CI.

Третє падіння — `reader initial rows` у coherent Popup scenario, до import.
Trace показує `<span class="rule-daily-limit-popup">daily_limit_usage</span>`
та інші буквальні translation keys; durable rules, credentials і 420/120
секунд збережені. Першопричину порожнього native message bundle не встановлено.
Failed teardown тепер зберігає `native-i18n-final`: native getMessage results,
UI language, фактичні default catalog entries та row text. `native-owner-final`
додає raw stderr/PID/targets для failed native tests і alarm observer tests.
Це діагностика після scenario; вона не змінює callbacks, не перезавантажує UI
та не послаблює перевірку видимих usage values. Runtime і версія незмінні.

На базі `1f2acfd1ee3d0e3dbe29083303a2e0e499c30892`
[run 37907288475](https://github.com/MarkAlexI/blockSiteExtension/actions/runs/37907288475)
підтвердив **37 passed**, Extension CI теж зелений. Два нові native alarm
batch сценарії нижче збільшують набір до **39**; їх виконання потребує нового CI.

База `ab4c1c65223c1fd9523c1967f15b0fe91dbecd6b`: [Chromium E2E run
37823365955](https://github.com/MarkAlexI/blockSiteExtension/actions/runs/37823365955),
перша спроба — **36 passed**. Новий idle-сценарій нижче додає 37-й тест;
цей попередній зелений результат не є його виконанням.

На `0ee99c9f3324fbdc3db04975d97dd87c7f476b09` [run 37830491885](https://github.com/MarkAlexI/blockSiteExtension/actions/runs/37830491885)
дав **36 passed, 1 failed**, без retries/skips. Новий idle/wake пройшов:
у `native-idle-wake` PID 8997 збережено, worker зник через 30 секунд і
прокинувся через 50, JS-маркер зник, `storage.session` sentinel збережено.
Єдине падіння — початковий seed day-boundary 35 після зайвого підготовчого
restart: migration marker уже існував, а seeded usage 120/840 став `{}`,
DNR — `[]`, до timezone transition. Trace підтверджує порядок marker → seed →
empty usage; Node-регресія з production startup і контрольованим API wait
відтворює втрату бюджету після seed за раннім marker.

Day-boundary тепер задає process TZ **першому fresh-install launch** через
`initialTimezone`. Date-line пара обирається один раз перед launch і та сама
пара використовується тілом тесту. Seed чекає наявний completed-install
Options barrier. Підготовчий restart прибрано; наступні recovery/ABA рестарти,
durable journal, usage assertions, native clock/visibility, UI/DNR і profile
identity збережені. Це зміна fixture; production runtime/version не змінені.

## Локальний запуск

З кореня Chromium-репозиторію, після застосування змін 5.3.20:

```sh
cd e2e
npm ci
npx playwright install chromium
npm test
```

Linux CI із відсутніми browser dependencies:

```sh
npx playwright install --with-deps chromium
xvfb-run -a npm test
```

Видимий браузер і HTML-звіт:

```sh
npm run test:headed
npm run report
```

Використовується Chromium, який встановлює Playwright, та окремий тимчасовий
профіль на кожен тест. Особистий браузер і профіль користувача не підключаються.
У restart-сценаріях використовується той самий тестовий профіль, після тесту
він видаляється. За замовчуванням набір використовує headed Chromium:
visibility/accounting потребує справжнього перемикання вкладок. На Linux
без desktop display запускайте через `xvfb-run -a npm test`, як у CI.
Visibility-сценарій позначений `@native-visibility`. Для нього Playwright
запускає окремий Chromium із новим тимчасовим профілем, а сторінками керує
`connectOverCDP({ noDefaults: true })` у default context. Focus emulation
тоді не вмикається; `document.visibilityState` і події лишаються нативними.
Loopback CDP доступний лише під час тесту; launch owner закриває браузер
і видаляє його профіль навіть після невдалого CDP-підключення.

Fresh install чекає справжню Options-вкладку, яку `onInstalled` створює
після `initializeExtension` та permission check. Раніший
`is_migrated_to_local` не є бар'єром перед seed usage. На native visibility
launch/restart старі Options/Popup закриваються через loopback DevTools HTTP
до `connectOverCDP`, зі збереженням того самого профілю. Спочатку створюється
одна нова `about:blank`, потім закриваються всі старі page targets, включно
зі старою blank-вкладкою. Worker target та storage не змінюються.
`native-pages-before-cdp` зберігає targets, а `native-cdp-setup-failure` —
targets, PID, exit status та stderr. Timeout і retries набору не збільшені.

Options focus smoke вставляє URL справжньою командою browser input.
Capture listener перевіряє `isTrusted`, початковий URL focus і переходить
у друге поле в тому самому `input` event. Межа `<100 ms` зберігається;
per-character CDP calls і Node reads не витрачають це вікно. Подальший
ввід, перевірка focus після 150 ms та точних persisted полів лишаються.

За замовчуванням extension path — батьківська папка `e2e`. Для перевірки
**байтів store ZIP** розпакуйте `BlockDistraction-5.3.20-cws.zip` у звичайну папку та вкажіть її:

PowerShell:

```powershell
$env:BD_EXTENSION_PATH = 'E:\Work\BlockDistraction-5.3.20-cws'
npm test
```

Bash:

```sh
BD_EXTENSION_PATH=/absolute/path/BlockDistraction-5.3.20-cws npm test
```

Runner перевіряє manifest version. За замовчуванням `BD_EXPECTED_VERSION`
береться з `manifest.json` поточного checkout через `target-version.mjs`.
Для іншої версії пакета задайте override явно; це не означає автоматичної
сумісності набору з нею.

## GitHub Actions

`.github/workflows/e2e-chromium.yml` запускається для pull request і push
у `main`. Для ручного запуску: **Actions → Chromium extension E2E →
Run workflow**.

Workflow збирає CWS ZIP із tracked HEAD чинним `package:cws`, розпаковує його
та запускає тести на цьому пакеті. Зберігає HTML/JSON-звіти, screenshots,
final extension state і traces як workflow artifact на 14 днів.
Завантаження в CWS/Edge/AMO та deployment не виконує.

## Автоматичний idle unload → native alarm wake

`idle-native.spec.mjs` додає один Chromium-сценарій. Окремий запуск:

```sh
cd e2e
xvfb-run -a npm test -- idle-native.spec.mjs
```

У справжньому Popup reader у вкладці запускається хвилинна Focus Session.
Час початку обирається перед штатним хвилинним tick, щоб після нього лишилося
понад 45 секунд до completion alarm, а наступний minute alarm був пізніше.
Fresh-install license alarm спершу виконується з dummy-key HTTP mock.
Жоден production alarm не очищається та не переноситься.

Перед idle закриваються extension UI й усі сторінки, крім `about:blank`.
Зберігається trace, після чого **весь Playwright CDP transport від'єднується**;
native launch owner, PID, WS endpoint і профіль лишаються тими самими.
У detached проміжку runner лише читає `/json/list`: не виконує JS, extension
API, heartbeat, повідомлень, worker stop/start або browser restart.
Worker має зникнути після native idle window та бути відсутнім принаймні
секунду; нова активність має з'явитися на completion alarm, до конкуруючого
minute alarm. Немає сценарійних retries або fallback на forced stop.

Після спостережуваного wake runner під'єднується знову. JS-маркер має
зникнути, а native `storage.session` sentinel — зберегтися. Chromium може
повторно використати target ID: його зміна не є assertion. До відкриття UI
перевіряється **кінцеве** завершення Focus production alarm handler, зняття
cross-list DNR, збереження 840 секунд Daily Limit і порожнього journal.
Completion alarm має зникнути, хвилинний periodic alarm — залишитися.
Потім Options/Popup reader показують завершену сесію, spent rule блокує
навігацію з `daily_limit`, а неактивний профіль знову дозволений.

`native-idle-wake` містить PID, alarms, targets і часову історію HTTP samples;
trace охоплює ділянки до від'єднання та після під'єднання. Detached проміжок
навмисно без debugger trace. Окремий deadline 210 секунд враховує справжні
maintenance/Focus alarms; timeout та retries інших сценаріїв не змінені.
Провал до unload або пізній wake спершу аналізуйте за цією історією: це не
автоматичний доказ runtime-регресії.

Це eventual completion, не доказ відсутності короткого stale DNR між async
операціями. Сценарій не перевіряє crash між writes, OS suspend, Firefox event
page/Android, toolbar Popup чи байти встановленого магазинного пакета.
HTTP protocol-model тести з контрольованим clock не є native E2E.

Підстави для harness: [Chrome lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle),
[Playwright connected Browser.close](https://playwright.dev/docs/api/class-browser#browser-close),
[Chromium live/stopped worker hosts](https://github.com/chromium/chromium/blob/main/content/browser/devtools/service_worker_devtools_manager.cc)
та [DevTools attachment](https://github.com/chromium/chromium/blob/main/content/browser/devtools/service_worker_devtools_agent_host.cc).
Історичне уточнення wOxxOm про Chrome 110 та idle timer:
[Chromium Extensions, 7 січня 2023](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/_RxghHKGQ8s).

## Кілька native alarms після automatic idle unload

`alarm-batch-native.spec.mjs` додає два сценарії: завершення простроченого
хвилинного Focus без activation уже expired schedule та збереження новішої
трихвилинної ручної Hardcore-сесії після stale completion alarm. У другому
випадку поточна schedule occurrence має отримати один durable claim без
заміни ручного Focus.

Через справжній `chrome.alarms.create` призначається один timestamp для
`end_focus_session`, `start_scheduled_focus` і `update_scheduled_rules`.
Minute alarm залишається періодичним; у ручній сесії completion timestamp
є старим alarm fixture, ранішим за її справжній end. Порядок створення між
сценаріями різний. Assertion перевіряє три callbacks рівно один раз, але
не вимагає конкретної послідовності доставки.

Усі extension views закриваються. Після останнього setup API всі CDP clients
від'єднуються; лише HTTP `/json/list` спостерігає natural unload і wake.
Idle window, sustained absence, перший wake до сторонніх alarms, PID,
профіль, global/session sentinel перевіряються тим самим native harness.
Жодний worker listener чи production API не обгортається.

Тільки нові тести вмикають browser flags `enable-extension-activity-logging`,
`enable-extension-activity-log-testing`, `enable-logging=stderr` і
`vmodule=activity_log=1`. Node читає browser-side `ActivityLog::LogAction`
stream, включно з callbacks із service worker, без debugger attachment.
Позитивні контроли мусять побачити genuine warm license alarm, UI Focus
storage/DNR requests та native session fence перед detach. Відсутній,
malformed, aggregated чи переповнений log є помилкою; fallback на mock
або лише фінальний snapshot відсутній. Browser flags не додають heartbeat
і не змінюють idle timeout; фактичний unload залишається обов'язковим.

Activity log записує **API arguments**, а не успішні commits. Перевіряються
всі спостережувані Focus/claim/budget/DNR requests у cold інтервалі;
native storage/DNR, completion count та наступні alarms перевіряються
окремо до будь-якого UI/status/force-sync intent. Cold snapshot виконується
після reconnect до вже спостережуваного wake. Після цього Options/Popup
reader та справжня blocked/allowed navigation підтверджують стан; UI read
не має повторно активувати чи claim-ити occurrence. 840 секунд, journal,
rules/profiles/revisions і credentials зберігаються.

`native-alarm-batch` містить browser activity order, позитивні контроли та
cold state; `native-idle-wake` — lifecycle samples і identity. Артефакти
зберігаються також при падінні. Node protocol models перевіряють chunked
UTF-8 log, console lookalikes, malformed/overflow history, batch timing,
повторні deliveries, transient activation/overwrite/budget loss та DNR.

```sh
cd e2e
xvfb-run -a npm test -- alarm-batch-native.spec.mjs
```

Це automatic idle та genuine timers; OS sleep/resume і накопичення overdue
alarms під час сну лишаються окремою перевіркою. Усі 24 перестановки чотирьох
alarms, включно з Daily Limit deadline, покриті окремими production-module
API-model тестами. Runtime/source version 5.3.20 не змінено. Локальний
AF_UNIX preflight дає EPERM; native виконання нових Chromium сценаріїв тут
не підтверджено. Список із 39 тестів та Node check не замінюють цей CI.

Первинні джерела для browser-side observer:

- https://github.com/chromium/chromium/blob/main/chrome/common/chrome_switches.h
- https://github.com/chromium/chromium/blob/main/chrome/browser/extensions/activity_log/activity_log.cc
- https://github.com/chromium/chromium/blob/main/chrome/browser/extensions/activity_log/activity_actions.cc
- https://github.com/chromium/chromium/blob/main/extensions/renderer/ipc_message_sender.cc
- https://github.com/chromium/chromium/blob/main/extensions/renderer/api_activity_logger.cc
- https://github.com/chromium/chromium/blob/main/extensions/renderer/storage_area.cc
- https://github.com/w3c/webextensions/issues/1107

## Що перевіряється

| Сценарій | Спосіб дії та перевірки |
| --- | --- |
| Два Options додають правила | Native runtime callers у двох реальних сторінках; обидва UI, різні ID, actual DNR та blocked navigation |
| UI split спільного Daily Limit | Edit/Save; збереження 840 секунд, limit-reached UI, новий ID і кінцевий redirect |
| Конкурентні split/move до v1 migration | Два callers з однією revision: одна дія проходить, інша отримує `rules_state_changed`; після читання актуальної revision retry зберігає обидва бюджети, DNR і blocked navigation |
| UI delete/import | Delete та справжній file input change із JSON; синхронізація двох UI і блокування імпортованого URL |
| Journal після browser restart | Durable fixture перед recovery; clean close/relaunch того самого профілю, перенесений usage та actual navigation |
| Mixed v1 migration після restart | 840 legacy + 10 scoped → 840; більший scoped 900 збережено |
| Foreground deadline | UI-конфігурація; native visibility, реальний час та chrome.alarms, actual DNR і blocked reason |
| Background/resume | Native tab activation і document.visibilityState; 6 секунд hidden не враховуються, foreground продовжується |
| UI activation + Free action | Затримана mock HTTP verification; Free працює, paid відхиляється до commit, два UI оновлюються |
| UI logout без reload | Два Options; Free credentials, paid rejection, Basic UI add та actual navigation |
| Paid commit перед logout | Native storage event в іншому Options запускає logout після початку rule commit; збережений порядок і відповіді |
| Trusted Legacy після logout | Trusted installationDate fixture; advanced controls і Daily Limit add залишаються доступними |
| Тимчасова помилка verification | Mock HTTP 500; Pro зберігається, наступна paid action проходить |
| Payment suspension → manual recovery | Та сама збережена ліцензія; General лишається активним, cross-list Focus DNR відновлюється до відповіді, два Options стають Pro |
| Payment suspension → native alarm | Справжній `check_pro_expiry` alarm і HTTP mock; key, rules, profiles, settings збережено, інший профіль знову блокується |
| Readers: delete/import × 3 | Три послідовні цикли без retry сценарію: два Options і Popup, cleanup usage/journal, DNR і blocked navigation |
| Readers: concurrent/chained move | Два незалежні move, потім fresh move: прийняті й сторонній бюджети збережено; stale keys прибрано, усі три UI та DNR узгоджені |
| Readers: expired-day restart | Учорашній usage + pending remap; чистий restart, сьогоднішній нульовий бюджет, UI/DNR та облік нового foreground segment |
| Deferred DNR sync → native retry | Oversized fixture перевищує фактичний browser capacity; `syncPending=true` і Pro/key збережено; після виправлення fixture нативний `update_scheduled_rules` відновлює DNR |

## Календарний smoke (32–34)

`calendar.spec.mjs` додає три сценарії до повного CI-набору. Окремий запуск у Linux:

```sh
xvfb-run -a npm test -- calendar.spec.mjs
```

32 змінює процесний `TZ` з UTC на UTC+1 через чистий restart того самого
профілю: key та revision незмінні, absolute start інший. Старий Skip має
повернути `schedule_changed`, storage не змінюється, alarm переозброєно.
33 змінює UTC−12 на UTC+14: локальний occurrence key також змінюється.
Обидва сценарії перевіряють свіжий Skip через UI і його збереження після
наступного restart без повторного seed. Date, Date.now та WebExtension API
не підміняються; timezone і offset звіряються в Options та MV3 worker.

34 імпортує production `focusSchedule.js` у реальний браузер із процесним
`TZ=America/New_York`. Передає фіксовані instants як аргументи календарного
модуля: gap 02:30 пропускається, fold 01:30 має один key/start, handled і
skipped key ведуть на наступний тиждень. Це native Date/Intl integration,
а не очікування живого переходу DST чи перевірка доставки alarm під час DST.
Покриття процесного TZ наразі призначене для Linux CI; інші OS потребують
окремого підтвердження. Невідповідність timezone в будь-якому realm є падінням.

## Daily Limit day-boundary smoke (35–36)

Повний набір реєструє ще два persistent сценарії. Окремий Linux запуск із
каталогу `e2e`:

```sh
xvfb-run -a npm test -- day-boundary.spec.mjs
```

| ID | Native перевірка |
| --- | --- |
| 35 | Timezone змінюється, локальний day key залишається: journal одноразово переносить фактично накопичений foreground usage; exhausted budget і native DNR зберігаються після двох restart. |
| 36 | Date-line A-to-B-to-A: старі counters та journal з активним lastSample очищуються при зміні дня; новий foreground segment обліковується окремо; повернення до попереднього дня не відновлює жоден старий бюджет. |

В обох сценаріях Date/Intl перевіряються в Options і background. Один
disposable profile та storage marker переживають кожний restart без reseed.
Два Options і Popup reader показують committed assignments, точні budgets
та exhausted state; справжня navigation перевіряє DNR. Native recovery alarm
має бути відновлений. У 35 foreground segment завершено перед restart, тому
usage після recovery мусить збігтися точно; це не перевірка suspend активного
segment. У 36 збережений lastSample походить із фактичного активного segment.

Pending journal — durable post-commit fixture, записаний через native storage,
а не штучно індукований crash між production writes. Day key змінюється через
process TZ при clean restart, без Date override чи ручного виклику listener.
Жива північ, timezone change без restart, короткий suspend активного segment,
automatic idle unload і Android suspend/resume залишаються окремими кроками.

## Scheduled Focus expiry smoke (37–38)

Ці два persistent сценарії затримують **повернення** одного справжнього API
в background після його виконання. 37 утримує session read до durable claim;
38 утримує завершений claim write. Нативний Scheduled Focus alarm доставляється
у хвилинному occurrence; Date/Date.now/Intl та результати API не підміняються.
Тест чекає фактичного endTime, звільняє delivery і ставить незмінений save у
production transition queue як barrier завершення reconcile.

| ID | Обов’язкова перевірка |
| --- | --- |
| 37 | Після expiry немає handled key, жодної transient Focus activation чи Focus DNR; наступний occurrence має точний native alarm. |
| 38 | Claim уже збережений перед hold; після expiry немає transient Focus/DNR; той самий claim і schedule переживають restart профілю без reseed. |

Спостерігач записує storage write/commit, справжні storage.onChanged, native
DNR update arguments і rules після commit, доставлені alarms та час gate.
Позитивний контроль через ручний Focus start/stop мусить показати activation
обом спостерігачам до очищення history для основного сценарію. Перевіряється
вся history, а не лише фінальний eventually. Browser API errors лишаються
помилками; held delivery та observers відновлюються у finally.

Background heartbeat читає справжній storage під час контрольованого wait.
Це перевірка expiry всередині живого background, а не automatic idle unload,
OS suspend/resume, зміна timezone під час wait або Android. Restart чистий;
history стосується індукованого wait до закриття браузера. Після restart
перевіряються durable claim, schedule, Focus state, DNR, alarm і navigation.
Окремий timeout 240 секунд охоплює native запуск, до 75 секунд до start,
хвилинний occurrence та restart; retries вимкнено.

Окремий Linux запуск із каталогу `e2e`:

```sh
xvfb-run -a npm test -- scheduled-expiry.spec.mjs
```

## Межі набору

- Chrome APIs не замінюються doubles; завантажено справжній extension worker,
  сторінки Options, native storage, DNR, tabs, scripting та alarms.
- Частина сценаріїв взаємодіє через native runtime messages із двох Options;
  це браузерні integration scenarios, а не імітація одночасних фізичних кліків
  у двох UI. UI add/edit/delete/import/activation/logout також є окремо.
- Початкові rules/usage/credentials та pending journal — fixtures, записані
  через справжній Chrome storage у тестовому профілі. Journal-сценарій не
  індукує crash між двома production writes; restart — чистий browser close.
- HTTP-сторінки `*.bd-e2e.test` синтетичні й обслуговуються Playwright route.
  Native DNR та redirects браузера перевіряються на справжній навігації.
- Verification endpoint перехоплюється й повертає контрольовані відповіді;
  використовуються лише dummy credentials. Paddle, backend, реальна ліцензія,
  мережеві властивості production endpoint і фактичні покупки не тестуються.
- Clock, alarm emit та результати WebExtension APIs не підміняються.
  37–38 затримують доставку одного фактично завершеного API-виклику. Для deadline
  допускається до 75 секунд реального часу. Тест може виявити відмінності
  фактичної доставки alarm, visibility чи lifetime worker.
- H1 не вважається доведеним дефектом. Цей набір не містить artificial hook
  перед manager queue та не доводить відсутності всіх можливих гонок.
- Popup у reader-сценаріях — справжня `index.html` сторінка розширення у
  вкладці. Це не перевірка відкриття/закриття toolbar Popup браузером.
- Expired-day fixture не доводить живу північ. 35–36 додають process timezone
  restart із foreground usage/pending remap; live timezone change всередині
  pending API wait не покрита. 32–34 перевіряють календар Scheduled Focus.
- Firefox Desktop, Firefox Android, Edge/Kiwi Android і автоматична idle
  suspension/restart одного worker цим набором не покриті.

Після виконаного запуску оцінюйте JSON/HTML report. Падіння до scenario body
означає помилку запуску середовища; проходження scenario body підтверджується
лише реальним браузерним запуском. Retry вимкнено; падіння не приховується
повтором. У 5.3.20 виправлено відкладений autofocus у Options і застарілі
refresh/callback вставлення рядків у Popup.

Deferred-sync сценарій перевіряє реальний browser capacity через oversized
fixture, а не всі можливі API rejection чи OS failure. Ані DNR methods, ані
alarm delivery не замінено doubles. Наступний retry — фактичний native alarm,
запланований у тимчасовому профілі, без виклику production listener вручну.

## Артефакти й діагностика

`test-results/` — traces, screenshots та final state; `playwright-report/` —
HTML; `results.json` — машинний report. Після restart зберігаються traces до
і після нього. Для іншого місця результатів доступні `BD_E2E_RESULTS`,
`BD_E2E_HTML` і `BD_E2E_JSON`.

У Chromium focus emulation утримує visibility capture handle окремого
CDP-сеансу. `enabled:false` у другому сеансі не звільняє handle Playwright;
тому visibility-сценарій використовує documented `noDefaults` від початку.
Інші сценарії працюють через звичайний `launchPersistentContext`.
Delete/import чекає usage cleanup окремим bounded poll: rules та DNR можуть
оновитися до завершення post-commit cleanup. Умова порожнього usage збережена.
Screenshots Options знімаються після завершення сценарію, з активацією
кожної вкладки. Помилки збирання діагностики записуються в `diagnostic-errors`
та annotation; вони не переривають спробу зберегти trace і не підміняють
результат assertions сценарію. Browser close errors залишаються помилками.

Офіційні інструкції:

- https://playwright.dev/docs/chrome-extensions
- https://playwright.dev/docs/service-workers
- https://playwright.dev/docs/ci-intro
- https://playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp-option-no-defaults
