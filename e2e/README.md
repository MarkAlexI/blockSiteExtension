# BlockDistraction Chromium E2E

Цільова версія: **5.4.5**. Playwright: **1.62.1**, Node.js: **22+**.

## Startup CDP setup correction (2026-10-23, tests only)

На `5e94460ed23fa9f653b4628107794e85782882db`
[run 39854297861](https://github.com/MarkAlexI/blockSiteExtension/actions/runs/39854297861)
має **48 passed / 1 failed**. Усі dialog scenarios пройшли. Startup restore
зупинився до seed/body на `tracing.start: Target page, context or browser has
been closed`. Таке саме setup failure було на 5.4.2 у
[run 39849590724](https://github.com/MarkAlexI/blockSiteExtension/actions/runs/39849590724).
Його artifact підтверджує успішний native installer, enabled unpacked extension,
локалізований Options title і keeper tab після HTTP cleanup. Діагностики процесу
в момент tracing failure немає; точну причину закриття цими даними не встановлено.

Installer раніше лишав CDP client підключеним під час HTTP cleanup його вкладок,
а scenario повторно використовував той самий context. Тепер короткий installer
client від'єднується до cleanup; scenario підключається після нього заново до
того самого owned process/profile. Зв'язок stale installer sessions із CI failure
лишається гіпотезою до нового headed run. Для `connectOverCDP`, `browser.close()`
від'єднує transport; тут не закривається context і не надсилається CDP `Browser.close`.
Обидва connections зберігають `noDefaults`/`isLocal`. Native setup diagnostics
тепер охоплює tracing/routes і додає stage, error та connection state.

Вісім Node protocol-model tests перевіряють межу між клієнтами, відмови без
повторної інсталяції та read-only restore. Локально: **1930/1930** root tests,
validator/contrast і реєстрація **49** E2E scenarios. Окремий реальний Chrome
Headless Shell smoke пройшов fresh connection/tracing, зберіг PID/profile cookie,
а read-only reconnect зберіг target IDs і document timeOrigin. Старий порядок
відхиляється protocol-model guard; саме CI failure локально не відтворено.
Це не виконання native GTK/startup restore scenario: фінальне приймання потребує
Linux headed CI. Runtime, версія 5.4.3, `update/update.js`, startup assertions,
timeouts та zero retries незмінні.

## Ітерація 5.3.29: повідомлення про збережені зміни

Popup, Options і Settings показують `ruleschangessavedpending`, якщо committed
mutation повертає `syncPending` або `dailyUsageSyncPending`. Rule Packs зберігає
лічильники й деталі результату разом із попередженням. Повторна мутація не
надсилається; persisted intent, password/revision guards і worker retry не змінені.
Додано 41 Node-регресію, включно з real production client/router/mutation/DNR
pipeline із контрольованою відмовою browser API та подальшим відновленням.
Це не native browser API execution. Native CI для 5.3.29 ще має пройти.
У browser smoke перевірити читабельність повідомлення в Popup і Settings та
звичайне підтвердження успіху без pending flags. Відмову DNR перевіряти лише
в ізольованому тестовому профілі.

## Ітерація 5.3.28: Focus Stop

Stop повертає явний pending status за відмови DNR, а Popup показує наявне
локалізоване повідомлення й оновлює збережений стан. Лічильник focus_stopped
рахує тільки збережений перехід активної сесії в неактивну. Додано 19 worker/UI
регресій для повторних Stop, природного завершення, scheduled occurrence,
помилок звітування, відновлення DNR та конкурентного Start.

E2E target автоматично читається з manifest.json і тепер дорівнює 5.3.28.
Підтверджено native CI для 5.3.28 (Chromium 45/45: https://github.com/MarkAlexI/blockSiteExtension/actions/runs/39152826832).

## Native installer correction (2026-10-14, tests only)

На `aa10457846a893b61470eda3feb11c905ea1bb90` [run 38547258363](https://github.com/MarkAlexI/blockSiteExtension/actions/runs/38547258363)
завершився з **44 passed / 1 failed**. Чотири попередні usage/DNR failures
більше не виникли. Startup scenario зупинився ще до свого тіла: вкладення
`native-cdp-setup-failure` містить `Unchecked runtime.lastError: No current drop data.`,
лише WebUI/blank targets і жодного worker чи Options установленого розширення.

Для revision Chromium `782af9cb30a53f54487e5d2e44738645a8ec457c`
[native developerPrivate](https://github.com/chromium/chromium/blob/782af9cb30a53f54487e5d2e44738645a8ec457c/chrome/browser/extensions/api/developer_private/developer_private_functions.cc)
читає `WebContents::GetDropData()`. [CDP Input](https://github.com/chromium/chromium/blob/782af9cb30a53f54487e5d2e44738645a8ec457c/content/browser/devtools/protocol/input_handler.cc)
доставляє drag data renderer-у й не реєструє цей native path. Старий Node
fixture помилково створював enabled extension record після synthetic drop.

Початкова одноразова інсталяція тепер натискає справжню WebUI кнопку
`Load unpacked`. Звичайний Linux/X11 GTK folder dialog отримує шлях CWS-package
через XTEST із уже встановленого `xdotool`. Перевіряються PID процесу,
однозначність діалогу, його English title та активне вікно перед кожним input.
Немає повторного натискання Open, fallback installer або keyboard input у
стороннє вікно. [GTK dialog Chromium](https://github.com/chromium/chromium/blob/782af9cb30a53f54487e5d2e44738645a8ec457c/ui/gtk/select_file_dialog_linux_gtk.cc)
використовує `SELECT_EXISTING_FOLDER` і штатну кнопку Open.

Window polling і installed metadata мають **спільний попередній 15-second
deadline**. Перевірка path/version/UNPACKED/ENABLED збережена. Відсутність X11,
XTEST або owned PID зупиняє setup; сценарій не пропускається. Dependencies
Linux workflow уже містять `xdotool`, `x11-utils` і Openbox.

Це підготовка isolated profile **до seed**. Обидва наступні relaunch, native
visibility, session markers, original document identity, DNR, foreground
budget і Hardcore Focus assertions лишаються незмінними. Runtime/manifest/
версія 5.3.27, restore switches, scenario count, retries і test timeout незмінні.
`native-persistent-install` додає evidence про dialog/PID/XTEST.

Перевірено локально: **1829/1829** root tests, validator, **30/30** focused
protocol/desktop-command model tests, syntax і 45-scenario registration.
Старий installer провалив контрольний model із фактичним CI `No current drop data`.
Це не виконання GTK/Chromium: local native browser blocker AF_UNIX EPERM лишається.
Фінальне приймання потребує нового Linux headed CI без retries/skips.

Текст коміту: `test(e2e): install persistent Chrome fixture through native folder dialog`.

## Ітерація 5.3.27: відновлення бюджету та DNR

На commit `6541e093e39486db29717b2f8481a5add187eb5f` Chromium E2E
run [38409496385](https://github.com/MarkAlexI/blockSiteExtension/actions/runs/38409496385)
завершився з 40 passed і 5 failed. Чотири перевірки мали правильний persisted
usage/journal, але застарілий або відсутній DNR. Окреме падіння native startup
сталося в installer metadata (`installed.id` був undefined).

Production-worker регресії відтворили пропущений DNR sync після install/update:
canonical rules не потребували user-visible migration, а внутрішнє recovery
денного бюджету вже змінило рішення про блокування. Canonical install/update
тепер завершується awaited DNR sync після usage, Focus та access normalization.
Видима міграція вже має попередній sync; startup і browser update мають власні
sync/integrity steps. Їхній tab cleanup не дублюється.

Playwright 1.62.1 перевіряє truthiness результату waitForFunction до очікування
Promise. Async predicate із першим порожнім getExtensionsInfo міг завершити
очікування зі false. Installer тепер очікує результат кожного справжнього
асинхронного WebUI read і перевіряє metadata, з тією ж межею 15 секунд.
Регресії перевіряють початкові порожні reads, відсутність повторного drop,
неправильні version/state та timeout навіть при завислому API read.

Наступний CI має виконати всі 45 існуючих Chromium сценаріїв із zero retries.
Пріоритет: durable-remap restart, mixed-v1 startup, date-line ABA, expired-day
reader recovery та native startup restore. Assertions і timeout цих сценаріїв
не змінені. Node regressions не замінюють native browser verification.

Джерело семантики poller:
[Playwright v1.62.1 frames.ts](https://github.com/microsoft/playwright/blob/v1.62.1/packages/playwright-core/src/server/frames.ts).

## Статус перевірки

Набір запускає реальний Chromium із завантаженим MV3-розширенням.
Оцінюйте результат для конкретного commit SHA у GitHub Actions та
`results.json`: Node suite, синтаксичні перевірки і `--list` не є E2E.
Помилка запуску браузера до scenario body не підтверджує поведінку розширення.

На `49e48d05aef932113c299fcc5a01598c50f2c52f`
[run 37970460255](https://github.com/MarkAlexI/blockSiteExtension/actions/runs/37970460255)
має **39 passed / 1 failed**, без retries; Extension CI успішний. Новий cold
message body пройшов повністю, включно з native callbacks, alarms, UI та
navigation. Єдине падіння — coherent Popup reader, `reader initial rows`,
до import/probe та assignment moves. Trace показує наявний Daily Limit span
із текстом `daily_limit_usage`. `native-i18n-final` підтверджує порожні native
`header`, `deletebtn`, `daily_limit_usage` в обох відкритих extension views,
хоча default catalog повертає HTTP 200 і містить правильні entries. Durable
usage 420/120, rules та Pro credentials збережено. Це повтор попереднього
localization failure, а не доказ втрати budget або некогерентного snapshot.

Harness закривав install Options після появи target, до завершення її першої
локалізації. [Chromium 151 SharedL10nMap](https://github.com/chromium/chromium/blob/151.0.7922.34/extensions/renderer/shared_l10n_map.cc)
синхронно отримує bundle і кешує відповідь, включно з порожньою. Зв'язок
передчасного закриття Options із порожньою відповіддю — **гіпотеза**: trace
починається після cleanup і не містить цього першого IPC. Fresh setup тепер
чекає реальний Options title, який production `t('header')` отримав із native
API; очікуване значення читається з установленого English catalog при
`--lang=en-US`. Це HTTP target observation, без renderer evaluation, shim,
reload або повторного запуску. Literal `header` одразу зупиняє setup із
помилкою; pending title має той самий 15-second deadline. Бар'єр не
застосовується до restored pages під час restart. Новий `installReady`
у `native-pages-before-cdp` зберігає native title та target ID.

Failed i18n diagnostics додатково зберігають `@@extension_id`, `@@ui_locale`
та `@@bidi_dir` до fetch. [Chromium disk loader](https://github.com/chromium/chromium/blob/151.0.7922.34/extensions/browser/l10n_file_util.cc)
залишає `@@extension_id` навіть при невдалому читанні catalog; повністю порожня
відповідь IPC/cache не має і цього ключа. Попередній artifact не містить цих
reserved values, тому конкретну гілку помилки ним не встановлено. Три HTTP
protocol-model regressions перевіряють pending, untranslated і unfinished
install title. Вони не є native Chromium E2E; усунення CI failure потребує
нового browser run. Runtime, версія, visible usage assertions і retries
незмінні.

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
`is_migrated_to_local` не є бар'єром перед seed usage. Native fresh launch
також чекає її перекладений title до закриття install view. На native visibility
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


## Перші content messages після native worker idle unload

`cold-message-native.spec.mjs` додає один сценарій: увесь native набір тепер
містить 40 тестів у 12 файлах. Node 22 потрібен для page-only CDP WebSocket;
workflow уже використовує Node 22. Root module checks лишаються сумісні з Node 20.


Durable fixture: Daily Limit 21 із 840 seconds, правило 22 у неактивному Study,
ручна 10-minute Hardcore Focus через справжній Popup reader UI, disabled
Scheduled Focus revision 7 та явно збережені ненульові generation/rule/list
revisions. Metadata і schedule записано справжнім storage.local API; це fixture,
а не імпорт або crash між writes. Production runtime і version 5.3.20 незмінні.

Після справжнього minute tick залишено лише HTTP producer із content script,
інжектованим native scripting.executeScript. Він не викликає runtime API до
явного trigger. Сценарій спочатку підтверджує automatic unload із native default
idle interval та sustained stopped/absent стан щонайменше 1 second. Жодного
readiness ping, reload, terminate або примусового restart перед cold request.

П’ять повідомлень надсилаються одним synchronous burst, без await між sends,
таймера або retry: check_pro_status, focus_schedule_get, валідний rename Study,
rename Work із застарілою generation, rename Work із застарілою list revision.
Усі перші callbacks мають завершитись до кожного native alarm. Перевіряються
саме початкові packets: paid true, schedule config/revision 7, повні rules/list
дані й успішний валідний intent, точний rules_state_changed для обох stale
intents. Пізніший правильний state не може виправити неправильну першу відповідь.

До відкриття читачів cold storage/DNR мають зберегти Focus, 840 seconds, порожній
journal, generation/rule revisions і всі незмінені list revisions. Лише rename
Study змінює name та його revision. JS global sentinel губиться, native session
sentinel і той самий process/profile зберігаються. Потім reopened Options/Popup
reader та реальна навігація перевіряють чинний Focus і exhausted budget. Це reader
у вкладці; справжній toolbar Popup покрито іншими сценаріями.

Node controls відхиляють pinned background, early/competing wake, відсутній
producer, погані first replies, прийняті stale intents і retry. Окремі два
production-worker тести (із контрольованими storage API waits) надсилають перший
burst без warm-up intent і під час утриманого startup; listener мусить лишити
канал відкритим, не відповідати default state до read completion і повернути
правильні дані. Це production modules із model APIs, не native browser proof.

Native cold wake перевіряє повторний module/context startup від message після
idle, а не browser runtime.onStartup overlap, install/reload registration gap,
OS suspend/resume, Android/macOS або весь проміжний state history. Для browser
onStartup overlap окремо наведено контрольований production-module тест. Додані
сценарії не підміняють Date, API results або browser alarm delivery; retries 0.

Від’єднано всі Playwright/CDP transports. HTTP /json/list пасивно підтверджує
worker absence; далі єдиний page-only WebSocket виконує Runtime.evaluate у вже
існуючому HTTP producer. Browser/worker CDP під’єднуються лише після всіх п’яти
first replies. Native ActivityLog підтверджує рівно п’ять runtime.onMessage
записів після початку cold observation із точними sender extension ID та URL
producer. Chromium логування messaging не містить payload/token/request ID:
їх перевіряють початкові content packets. Перевіряється відсутність alarm
callbacks перед першою message-подією за native sequence, навіть якщо stderr
доставлено пізніше, та у спостережуваному cold interval до завершення replies.
Межа історії — native запис уже наявного session sentinel перед detach, а не
час отримання stderr у Node; запізнілі warm записи не стають cold подіями.
Raw log не є доказом storage/DNR commit, які перевіряються окремим native read.
Повний scoped ActivityLog додається до cold-first-responses-and-state також
при падінні ActivityLog assertion, незалежно від обрізаного stderr tail.

На цей сценарій відведено 210 seconds: fresh install maintenance, справжній
minute tick, native idle, first replies і readers. Existing deadlines не змінено.
Діагностика: before-cold-message-trace, native-cold-message,
cold-first-responses-and-state та native-owner-final.

```sh
cd e2e
xvfb-run -a npm test -- cold-message-native.spec.mjs
```

Офіційна вимога synchronous listener registration:
https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/events


## Два native вікна та перенесення вкладки (44)

База `047c1e474c8839d2f4d6ee52e4981de9542c91bf` має успішний повний native CI: 40/40.
Цей патч додає один сценарій: новий список містить **41 tests**; кількість
не дорівнює найбільшому ID. Додавання до списку не є native виконанням.

Дві вкладки можуть бути `active` одночасно в різних нормальних вікнах.
У headed Firefox 158.0b2 обидва їх документи також `visible`, хоча лише
один має document/window focus. На незміненому Firefox tracker фонове
завантаження B durably змінює власника segment з A на B при незмінному
фокусі A. Tracker тепер запитує поточну active вкладку через
`lastFocusedWindow: true`; event hint зберігає свій URL лише коли
збігаються і `tabId`, і `windowId` поточної вкладки. Це виправлення
підтвердженого Firefox runtime failure; аналогічна гілка Chromium має
production-module regressions і потребує свого native CI.

Сценарій використовує справжні `windows.create({tabId, focused:false})`,
`windows.update({focused:true})`, `tabs.move`, `tabs.update`, native Date,
visibility, alarms, storage і DNR. Вкладки спостерігаються за native ID
через `scripting.executeScript`, без припущення про збереження CDP/BiDi
page context після перенесення. Перевіряються реальні onDetached/onAttached
з тим самим tabId, обидва windowId та справжні onUpdated completions.

У трьох стабільних фазах фонове завантаження відбувається після 2.2 секунди
реального foreground часу. Кожний спостережуваний durable usage write
зберігає foreground owner і точний budget іншого вікна. Позитивний контроль
вимагає приросту foreground usage, видимого unfocused документа в іншому
вікні та незмінного реального фокусу. Приріст обмежений одним elapsed
timeline; історія ніколи не зменшує counters. Модельні fault controls
відхиляють transient wrong owner навіть при правильному фінальному стані,
inactive charge, дублювання часу й втрату budget.

Після native deadline вичерпана вкладка A закривається production cleanup,
обидва вікна залишаються відкритими, а B не втрачає budget. Options та
Popup **reader у вкладці** показують точні persisted usage/minutes. Нова
навігація A справді отримує `blocked.html?reason=daily_limit`, B залишається
дозволеною. Це не додаткове покриття toolbar Popup.

Linux/Xvfb потребує нормального window manager: використовуємо наявний
або власний Openbox, який завершується після тесту. Headless не проходить
передумову native focus. Перехід фокусу може містити WINDOW_ID_NONE,
тому вимірювана фаза починається після native focus/state та 200 ms без
нових спостережуваних подій; після background load також чекаємо його
реальний completion і завершення спостережуваних writes. Ці бар'єри не
перезапускають сценарій і не виправляють runtime стан. Історія охоплює
доставлені listener callbacks, не всі можливі внутрішні interleavings
браузера. Таймаути попередніх сценаріїв і retries незмінні.

Підтверджені межі: два normal windows на Linux, без session restore,
OS suspend/resume, browser-to-other-app focus, minimized windows, live
midnight або idle worker unload. Firefox macOS/Android та native Edge
цим не перевірені.

```bash
xvfb-run -a npx playwright test multi-window-native.spec.mjs
```


## Native window-focus recovery та release 5.3.21

На `cf74c3bd05f9a18020ec0a0012e2553fedf4fbc3`
[run 37993856473](https://github.com/MarkAlexI/blockSiteExtension/actions/runs/37993856473)
має **40 passed / 1 failed**, retries 0. Падає лише новий native сценарій
двох вікон після першої успішної фази: A витрачає 2 секунди, B не
витрачає нічого. Native history далі має focus B → WINDOW_ID_NONE.
Production worker записує segment B і за 1 ms очищає його; фінальний
native snapshot через 15 секунд має B window/document focus, visible
document та порожні assignmentKeys. Отримано повні job logs, native
multi-window/owner/state вкладення та browser trace. Fresh install, CDP
і native localization пройшли; це не launch/setup blocker.

WINDOW_ID_NONE handler тепер читає поточні `windows.getAll()` flags.
Якщо браузерне вікно сфокусоване, tracker resamples поточну вкладку;
якщо жодне не сфокусоване або query впав, pause і deadline cleanup
зберігаються. Sequence fence відхиляє відповідь цього query, якщо під
час очікування вже надійшла новіша focus подія. API callbacks не
підміняються, немає polling/debounce/retry або corrective E2E intent.

П'ять worker regressions використовують production worker і контрольовані
API replies: NONE після gain без transient pause; справжня втрата фокусу
при visible документах; запізнілі NONE replies після нового gain та
нової loss; query failure. Перша регресія червона на незміненому worker
цієї бази й зелена з виправленням. Native сценарій, його assertions та
timeouts незмінні; список залишається 41 test у 13 файлах.

Версія узгоджена як SemVer patch **5.3.21** у manifest/version_name, package,
source badge, changelog та поточній E2E цілі. `target-version.mjs` читає
manifest і автоматично дає новий default. Старі докази прив'язані до
початкових SHA/version. Local AF_UNIX EPERM заважає native Chromium запуску,
тому виправлення потребує повторного реального CI; model green не є
Chromium native green. Причину незвичного browser callback order
артефакти не встановлюють, і workaround для конкретного WM не додається.


## Native undo-close tab (45), release 5.3.22

Поточна закомічена база `5baa9fe79f17a2e44e6f8319b74de9d8980bc7ea`,
[run 37998704774](https://github.com/MarkAlexI/blockSiteExtension/actions/runs/37998704774),
має **41 native passed** на 5.3.21. Цей доказ не переноситься на 5.3.22.

Новий Linux/X11 сценарій використовує XTEST через `xdotool`: справжні
Ctrl+W та Ctrl+Shift+T. Перед вводом desktop title має містити унікальний
nonce вибраного fixture document, а active window перевіряється повторно.
Відновлення не викликає tabs.create, sessions API або corrective intent.
Єдина runtime reconciliation — початкова підготовка fixture.

Перевірки: новий native tab ID та document timeOrigin, один observed created
event; spent budget не зникає в жодному observed storage write; вкладка
не витрачає budget, поки закрита; foreground відновлюється; сумарний usage
не перевищує одну native elapsed timeline. Deadline відповідає збереженому
budget, реально завершує його, встановлює DNR і закриває restored tab.
Options/Popup reader показують точний остаточний usage; exhausted навігація
блокується, друге правило залишається allowed, revisions/Focus не змінюються.
Popup тут — reader tab, не додаткова toolbar-перевірка.

Це undo-close у тому самому browser process, **не startup session restore**,
OS sleep, mobile чи macOS/Windows. `nativeTabShortcutBackend` перевіряє
Linux DISPLAY, xdotool та XTEST до launch/body; backend failure — setup
blocker. Native API delivery/час/foreground не підміняються. Keyboard
delivery виконується один раз без retries. Unit protocol models перевіряють
відмову на чужому desktop title, зміні active window та недоступному backend;
вони не є доказом native browser restore.

CI встановлює xdotool поряд з Openbox/x11-utils. Native список після патча
має 42 tests; повний 5.3.22 CI залишається потрібним.

```bash
xvfb-run -a npx playwright test session-restore-native.spec.mjs
```


## Unchanged license verification during Daily Limit cleanup, release 5.3.23

Actual [run 38037081263](https://github.com/MarkAlexI/blockSiteExtension/actions/runs/38037081263)
на `6b36134dd3399cf7abef723e530aa6ced229c5ac` завершився **41/42**.
Новий native undo-close (45) пройшов. Двовіконний сценарій (44) досяг
usage 60 і DNR `[21]`, але виснажена вкладка залишилася відкритою.
Job log, native-multi-window attachment та browser trace отримано.
Trace фіксує verification response `{"isPro":true}` одночасно з crossing 60.

Production worker безумовно інвалідовував blocking decision перед
оновленням Pro. Якщо credentials не змінилися, storage event не забезпечував
новий DNR drain: поточний guarded cleanup скасовувався після застосування DNR.
Три контрольовані API-wait регресії відтворюють це для Pro/Free/Legacy.
Виправлення зберігає ранню інвалідацію, коли `isPro` справді змінюється;
інші credential changes і далі інвалідовуються через storage.onChanged.
Незмінне підтвердження доступу не додає нових запитів sync чи сканувань вкладок.

Worker model порівнює storage values структурно: перестановка object keys
не створює уявного event. Ідентичні credentials і відсутність credential event
є явними передумовами регресій. Це production modules із контрольованим API
reply, не заміна реального native CI. Firefox може доставляти onChanged без
зміни значення; Chromium-падіння не доводить аналогічну Firefox-регресію.

Runtime змінено, тому manifest/version_name, package і source metadata
узгоджено на patch **5.3.23**. Native suite залишається 42 tests;
assertions/timeouts/retries не змінено. Local AF_UNIX EPERM у цьому хості
блокує Chromium launch, тому підтвердження виправлення потрібне в новому CI.


## Native nested frames (46), test-only addition at 5.3.23

A genuine HTTP parent embeds a Basic-blocked cross-origin document, which in
turn embeds a Daily Limit document. Native `scripting.executeScript` results
prove three distinct frame IDs, main frame 0, actual document URLs, DOM parent
relationships and parent referrer origins. Child result order and specific
child IDs are browser-dependent. Default referrer policy is retained; full
cross-origin referrer paths are not required.

A real child navigation preserves its frame ID and the parent's document.
Initial load, child navigation and a parent reload preserve usage 40 in every
observed usage write and the final snapshot, without a foreground deadline.
The identical Daily Limit URL then becomes top-level: real foreground time is
charged, its native deadline alarm is observed, DNR installs the exhausted rule
and cleanup removes the top-level tab. No corrective intent, synthetic event,
Date shim, alarm override or API hold is used after initial fixture reconciliation.
With Basic and exhausted Daily Limit DNR active, all three embedded HTTP
documents still load, while the two top-level navigations reach blocked.html
with exact reasons. The parent survives, usage and revisions are retained,
and Options/Popup readers show the exhausted budget. Popup is a reader tab.

This checks DNR main/sub-frame behavior and tab accounting, not
`webRequest.type`, `webRequest.parentFrameId`, worker idle, OS sleep, startup
session restore, minimum versions, mobile, macOS or native Edge. Production
modules, permissions, version, existing assertions, deadlines and retries are
unchanged. This new deadline phase starts with 20 seconds remaining and has
its own 35-second observation bound, as in the existing native window coverage.
The only additional HTTP responses are local synthetic documents.

Native list after scenario 46: **43 scenarios**; listing is not execution.

```bash
cd e2e
npx playwright test frames-native.spec.mjs --headed
```

## Pro feedback geometry (scenario 47)

The native Options scenario opens Pro, switches the fixture through Pro and Free and broadcasts the status from the actual background context. It then rejects one native verification request through the existing isolated HTTP fixture and checks message geometry in 340 px and 640 px Pro columns. A MutationObserver and every rendered animation frame retain the full observed history; a later successful layout cannot erase an earlier clipped message. Rules, usage, credentials, retry input and collapsed/inert state are also checked. Firefox grants its real authentication-info consent first. Column resizing is a desktop layout check, not Firefox Android or a mobile platform run.

## Native startup session restore (scenario 48, Chromium)

Prepared against `41c13b6c543e603c0c3099ad741797b4e949079c` on 2026-10-13.
The original scenario was introduced on 5.3.25 with tests-only changes.
The 5.3.26 correction and native acceptance status are recorded below.

This is a clean whole-browser process replacement using the same disposable
profile, rather than undo-close, a worker restart or an induced crash.
The harness sends the native `Browser.close` command before closing any
context, observes exit code 0 without a signal, waits eight seconds with no
browser process, then launches with `--restore-last-session` and no startup URL.
The dedicated restore path preserves all original targets before CDP attaches;
the existing fresh-install barrier and other restart cleanup paths stay intact.

The first phase restores the original selected and background HTTP tabs.
The selected document has a new time origin and server-issued identity.
A real loopback server remains available before the driver attaches, with
native Chromium DNS mapping for the three fixture domains and `no-store`
responses. The document identity is tied to its actual HTTP request after
relaunch, not a recreated tab or driver-fulfilled restoration.
Daily budgets cannot reset, charge the closed-browser interval, spend the
background budget or count post-startup foreground twice. The actual deadline,
native DNR, stored credentials, rules and revisions are checked.

The second phase starts a real ten-minute Hardcore Focus through Popup UI.
An unruled HTTP document is kept across a second native process replacement.
Focus must retain the exact original end time, its native completion alarm,
budget, DNR and Options/Popup state. Actual navigation still redirects with
`reason=focus`. There is no seed, list activation, focus correction or
corrective reconciliation between relaunch and the startup observations.
The durable local marker survives; worker global and storage.session markers
do not. Each quit gets a distinct trace, and both phases are attached as
`native-startup-session-restore` JSON evidence.

Before CDP routing is installed, the production license hostname is mapped
to DNS failure only for this dedicated scenario; later verification uses the
existing mock route. No real license or purchase is involved.

Local preparation: full root suite **1797/1797**, extension validation and
focused helpers **18/18**. The new native list contains **45 tests in 17 files**;
listing is not execution. Local native execution is blocked by AF_UNIX
`EPERM`; new browser-scenario acceptance is pending the owner's CI.
Timeouts, retries and existing assertions are not weakened. CI must retain a
headed desktop and the existing window manager. Firefox parity is a subsequent
iteration after this Chromium scenario is exercised.

This does not prove crash recovery, OS sleep, live midnight/DST, first-message
registration races, every intermediate startup commit, mobile/macOS/Edge, or
bytes of an installed signed store package.

```bash
cd e2e
npx playwright test startup-restore-native.spec.mjs --headed
```

Commit subject:

```text
test(e2e): cover native Chromium startup session restore
```


## Startup correction 5.3.26 (2026-10-13)

Base: `e37de37801648479d50f524634c4f5db78d5abb8`. Chromium run
`38396728533` completed with 44 passed and one startup failure. Original HTTP
URLs and new document identities survived a normal process exit, but the
command-line extension load fired a fresh install and opened Options. Spent
foreground usage changed from 40 to 51 seconds across an 8007 ms interval
without a browser. Native storage dictionary order also invented a schema
migration and replaced unchanged rule revisions.

The worker now checks `storage.session.dailyLimitSession` before every elapsed
sample. A new browser lifetime discards the old foreground segment while
keeping spent counters and durable remaps. Worker replacement in the same
browser retains its marker and its accounting segment. Boundary persistence
precedes the session marker so a failed write cannot revive stale accounting.
Firefox shares these runtime changes; its 113/114 fallback clears only the
old segment on the explicit queued onStartup event. Native Firefox startup
restoration is still a separate scenario.

The 5.3.26 Chromium startup fixture omitted both `--load-extension` and
`--disable-extensions-except`, enabled Developer mode and attempted a directory
drop in `chrome://extensions` before seeding. The later CI run above proved
that CDP drag lacked native DropData; the current fixture uses the ordinary
Load unpacked folder dialog instead. The CDP `Extensions.loadUnpacked`
method is not used: Chromium clears CDP-installed registrations on restart.
Later launches rely solely on the same profile's saved installation. There is
no profile-file editing, reload, new tab, focus correction or runtime intent
between either relaunch and its observations.

Dictionary field order alone can no longer trigger rules/usage migration.
The dedicated Focus phase requires a null foreground segment after relaunch,
unchanged budgets and the exact original Focus deadline. Nonempty foreground
assignment keys, native visibility/focus, restored document identity, DNR and
single-charge accounting assertions are retained. Failed polling now attaches
its final read-only snapshot. Retries and deadlines remain unchanged.

Local checks: Chromium 1814/1814 and Firefox 1810/1810 root tests, validators,
plus expected failing controls with the old accounting/migration code. The
Chromium list still contains 45 native tests in 17 files. Native execution is
blocked locally by AF_UNIX EPERM. The directory-drop installer and the full
startup scenario require the owner's next headed CI run; these root results
are not native acceptance or proof of signed-store installation.

## A11Y-02 / 5.4.1: сценарій 48

`npm test -- accessibility.spec.mjs` перевіряє нативні Enter/Space/Tab/Shift+Tab у семи секціях,
виключення hidden-панелей із Tab, збереження чернетки після згортання,
accessible names списків і фокус кнопки прокручування. Сценарій не змінює
збережені правила. Для Chromium тут перевірено Blink-рендеринг; native
запуск блокується до тіла тесту через ProcessSingleton socket. Firefox 153
із тимчасовим встановленням пройшов до підвищення релізної версії (5.4.0 + A11Y-02).
Native E2E для фінальних метаданих 5.4.1 ще має пройти CI. Подробиці — `docs/accessibility-roadmap.md`.

## Парольний діалог / 5.4.2: сценарій 49

`npm test -- password-dialog.spec.mjs` перевіряє встановлене розширення: native dialog/AX names,
Enter з другого поля, Tab/Shift+Tab, Escape, невірний пароль, cancel,
відновлення й дозволене видалення після правильної перевірки.
Локально Firefox 153: 49 і наявний 22 пройшли; native Chromium очікує CI.
Див. `docs/accessibility-roadmap.md`. `update.js` для 5.4.2 не змінено.


## A11Y-03 / 5.4.3: Feedback, Rule Packs and Schedule

Scenarios 50–51 cover named dialogs, real Tab/Shift+Tab, Escape, background
inertness, nested and standalone Schedule focus, validation, group editing,
one explicit Rule Pack save and Feedback dismissal. Node tests separately
cover controlled storage/tab failures, duplicate submissions and stale results.
Patch releases leave `update/update.js` unchanged.


## A11Y-04 / 5.4.4: keyboard rule state and chart day (52)

Scenario 52 checks native Space/Enter rule toggles, saved pressed state and
replacement focus; protected disabling still requires the real password gate,
including Escape cancellation. It checks chart radio names/roles, trusted
activation, exact daily text, one Tab stop, wrapping arrows, Home/End and visual
RTL direction. Local Firefox 153 temporary-install run passed; baseline 5.4.3
fails at its mouse-only SPAN. New full headed CI remains required.
See `docs/accessibility-roadmap.md` for evidence and platform limits.


## A11Y-04 / 5.4.5: native 200% browser zoom (53)

Scenario 53 resizes the isolated native browser window and calls the real
`tabs.setZoom(tabId, 2)`. It checks `tabs.getZoom`, CSS viewport and doubled DPR;
CSS zoom and Playwright viewport emulation do not stand in for browser zoom.
It checks compact editor action labels, a retained Daily Limit draft, Schedule
geometry/group focus/Escape, one explicit saved rule, and Rule Packs/password
modal geometry. It restores zoom and window size in `finally`. Chromium uses
`@native-visibility` for its existing native viewport fixture; Firefox headed
runs start a window manager. The registered totals are 51 Chromium and 52 Firefox.

Local Firefox 153 temporary-install run passed. On baseline 5.4.4 the same
scenario fails because the Options body exceeds the real zoomed viewport.
Focused loopback DOM/CSS checks cover en/uk/de/ar at 320px, de/ar at 360px and
en at 1280px in Blink 151 and Firefox 153. Saved-rule table widths and address
wrapping remain unchanged by request. New full native CI, actual screen reader,
Android/macOS and minimum-version checks remain required. Baseline 5.4.4 Firefox
CI passed 51/51; the Chromium run was cancelled after 20 passes.
See `docs/accessibility-roadmap.md` for exact scope, sources and limitations.
