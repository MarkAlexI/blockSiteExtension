# Вимірювання cold startup і справжнього Popup

Один Chromium scenario 66, тестове доповнення до **5.4.15**.
Повний browser process exit/relaunch відрізняється від worker idle wake.

Тест використовує постійно встановлене unpacked розширення в окремому профілі,
завершує браузер через native `Browser.close`, перевіряє exit і запускає новий
PID з тим самим профілем. Перевстановлення та збережений session/global marker
є помилками. 12 справжніх HTTP-вкладок відновлюються браузером із loopback
сервера; bounded Web Workers створюють CPU pressure. Звіти про реальні CPU
chunks щонайменше двох різних вкладок повинні перекривати Popup measurement.
Лише кількість вкладок або ввімкнений workload flag доказом не вважаються.

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
повний `npm run check` (2232/2232). Сам Chromium у цьому контейнері завершується
до CDP через заборонений ProcessSingleton socket; числового native benchmark
тут немає. CI після застосування патчу має виконати цей один сценарій у
`lifecycle` і зберегти JSON, trace та environment identity.

Команда: `cd e2e && xvfb-run -a npm test -- startup-responsiveness.spec.mjs`.
Потрібні Linux/X11, openbox, xdotool/XTEST, Python для сусіднього overdue job;
наявний workflow встановлює залежності. Production telemetry не додається.
