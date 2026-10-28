# Вимірювання cold startup і справжнього Popup

Додано [окремий вимір фактичного DNR](dnr-readiness.md) перед першою командою
Popup. Звіт schemaVersion 2 містить `dnr` та `dnrPartial` при помилці; поряд із
12 workload-вкладками відновлюється одна активна контрольна HTTP-вкладка.
Спостереження DNR починається до налаштування tracing/routes і очікування
CPU pressure. Popup не чекає готовності DNR; записується фактичний порядок
підтвердження DNR й команди Popup. Це верхня межа спостереженої готовності, з підрахунком ранніх
запитів до HTTP. Числові результати потребують окремого native запуску.

Один Chromium scenario 66, тестове доповнення до **5.4.15**.
Повний browser process exit/relaunch відрізняється від worker idle wake.

Тест використовує постійно встановлене unpacked розширення в окремому профілі,
завершує браузер через native `Browser.close`, перевіряє exit і запускає новий
PID з тим самим профілем. Перевстановлення та збережений session/global marker
є помилками. 12 справжніх HTTP-вкладок відновлюються браузером із loopback
сервера; Web Workers створюють CPU pressure з поновлюваною owner lease (20 s).
Без відповіді owner Worker зупиняється; 8 ms / 32 ms збережені. Звіти про реальні CPU
chunks щонайменше двох різних вкладок повинні перекривати Popup measurement.
Лише кількість вкладок або ввімкнений workload flag доказом не вважаються.

Під час підготовки профілю Workers відповідають `idle` і не запускають CPU loops.
Owner дозволяє навантаження тільки після підтвердженого exit початкового браузера,
для documents із `timeOrigin` нового cold launch. Пізній запит старого document
цього дозволу не отримує. Кожен document передає всі реальні CPU chunks пакетами
раз на 250 ms, з одним HTTP-запитом у роботі. Інтенсивність CPU 8 ms / 32 ms
та 20-секундна lease залишаються тими самими. Перед оцінкою overlap тест чекає
доставки пакетів до кінця виміряного інтервалу; сам overlap перевіряється за
часом окремих chunks усередині початкового click-to-ready інтервалу.

До першого запиту від minimal packaged `blocked.html` тест не отримує worker,
не посилає readiness ping і не повторює message. Один trusted click паралельно
посилає `check_pro_status` і відкриває native `action.openPopup`. Перевіряються
одна відповідь, persisted Pro state та один browser-side `runtime.onMessage`
callback від цього host. Це перший **тестовий frontend-запит** нового процесу;
він не означає відсутність усіх внутрішніх подій самого розширення.

Звіт `cold-startup-popup-measurement` містить:

| Поле | Що вимірюється |
| --- | --- |
| `spawnToCdpMs` | host wall time від запуску процесу до доступного CDP |
| `pressureReadyMs` | підготовка навантаження в нових restored documents |
| `popup.firstReplyMs` | renderer monotonic RTT першого одноразового запиту |
| `popup.readyMs` | від trusted open до спостереженої готовності UI |
| `launchToFirstReplyMs` / `launchToPopupReadyMs` | час від запуску браузера |
| `input.addToDraftMs` | від trusted Add до actual focusin нового draft input |
| `input.saveToReplyMs` | від trusted Save до native mutation response |

Readiness означає готову оболонку, правильну кількість stored rows, локалізовані
Focus controls і доступну Add action. Polling має крок 16 ms, тому `readyMs` є
верхньою межею DOM readiness, а не точним часом compositor paint.
Працездатність підтверджує один native XTEST Enter для Add, введення URL та
один Enter для Save. Обидва click events мають `isTrusted=true`; записується
один справжній `rules:add`, зберігається рівно одне нове правило. Попереднє
правило, usage та journal зберігаються. API-обгортка лише спостерігає mutation
request/callback і пересилає їх незміненими.

Фіксованого performance budget немає. 15 секунд — наявна функціональна межа
readiness; це не обіцянка прийнятної швидкодії продукту. Спочатку потрібні
нативні результати на визначених ОС/CPU/browser. UI polling, tracing та
browser activity logging додають overhead, тому результати є baseline саме
цього тестового середовища.

Природний запуск може закінчити initialization до першої frontend-команди.
Звіт явно містить `initializationOverlap: not established ...`: тест **не
доводить** працездатність UI в кожній незавершеній фазі ініціалізації.
Окремі controlled initialization/API-model перевірки не замінюють цього
нативного доказу. Готовність worker навмисно не очікується перед вимірюванням.

Локально пройшли enumeration, receipt-model acceptance/negative controls,
повний `npm run check` (2255/2255). Сам Chromium у цьому контейнері завершується
до CDP через заборонений ProcessSingleton socket; числового native benchmark
тут немає. CI після застосування патчу має виконати цей один сценарій у
`lifecycle` і зберегти JSON, trace та environment identity.

Команда: `cd e2e && xvfb-run -a npm test -- startup-responsiveness.spec.mjs`.
Потрібні Linux/X11, openbox, xdotool/XTEST, Python для сусіднього overdue job;
наявний workflow встановлює залежності. Production telemetry не додається.

Корекція після першого CI measurement: [діагноз за trace і часовими мітками](ci-readiness-2026-10-26.md). Поточний звіт також розділяє setup overhead у `preparation` та містить `pressurePolicy`/`pressureProducers`.

Корекція після CI `fa5ae71`: [підготовка workload і cleanup](ci-lifecycle-2026-10-26.md).
Звіт містить останній `stage`, навіть коли scenario body не дійшов до власного
`finally`. Fixture teardown спочатку зупиняє loopback workload; діагностика має
спільний бюджет 5 s, а очікування context/transport не блокує cleanup owned process.
