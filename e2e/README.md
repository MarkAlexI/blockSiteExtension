# BlockDistraction Chromium E2E

Цільова версія: **5.3.4**. Playwright: **1.62.1**, Node.js: **20+**.

## Статус перевірки

Набір підготовлено для реального Chromium із завантаженим MV3-розширенням.
Під час підготовки в ChatGPT Work браузер не зміг запуститися:
`process_singleton_posix.cc: socket() failed: Operation not permitted (1)`.
Це блокування середовища до входу в scenario body. Жоден браузерний сценарій
не позначено пройденим. `--list`, синтаксичні перевірки та Node regression suite
не є E2E-проходженням. GitHub Actions workflow підготовлено, але не запускалося.

## Локальний запуск

З кореня Chromium-репозиторію, після застосування змін 5.3.4:

```sh
cd e2e
npm ci
npx playwright install chromium
npm test
```

Linux CI із відсутніми browser dependencies:

```sh
npx playwright install --with-deps chromium
```

Видимий браузер і HTML-звіт:

```sh
npm run test:headed
npm run report
```

Використовується Chromium, який встановлює Playwright, та окремий тимчасовий
профіль на кожен тест. Особистий браузер і профіль користувача не підключаються.
У restart-сценаріях використовується той самий тестовий профіль, після тесту
він видаляється. Перевірка headless та headed — окремі запуски.

За замовчуванням extension path — батьківська папка `e2e`. Для перевірки
**байтів store ZIP** розпакуйте `BD534-cws.zip` у звичайну папку та вкажіть її:

PowerShell:

```powershell
$env:BD_EXTENSION_PATH = 'E:\Work\BD534-cws'
npm test
```

Bash:

```sh
BD_EXTENSION_PATH=/absolute/path/BD534-cws npm test
```

Runner перевіряє manifest version. Для майбутньої версії явно задайте
`BD_EXPECTED_VERSION`. Це не означає автоматичної сумісності набору з нею.

## GitHub Actions

Патч додає `.github/workflows/e2e-chromium.yml`. Після додавання workflow до
default branch у власному репозиторії: **Actions → Chromium extension E2E →
Run workflow**. Автоматичного запуску на кожен push немає.

Workflow збирає CWS ZIP із tracked HEAD чинним `package:cws`, розпаковує його
та запускає тести на цьому пакеті. Зберігає HTML/JSON-звіти, screenshots,
final extension state і traces як workflow artifact на 14 днів.
Завантаження в CWS/Edge/AMO та deployment не виконує.

## Що перевіряється

| Сценарій | Спосіб дії та перевірки |
| --- | --- |
| Два Options додають правила | Native runtime callers у двох реальних сторінках; обидва UI, різні ID, actual DNR та blocked navigation |
| UI split спільного Daily Limit | Edit/Save; збереження 840 секунд, limit-reached UI, новий ID і кінцевий redirect |
| Конкурентні split/move до v1 migration | Два native runtime callers; бюджети, rules, journal, actual DNR і blocked navigation |
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
- Clock, alarm emit та WebExtension methods не підміняються. Для deadline
  допускається до 75 секунд реального часу. Тест може виявити відмінності
  фактичної доставки alarm, visibility чи lifetime worker.
- H1 не вважається доведеним дефектом. Цей набір не містить artificial hook
  перед manager queue та не доводить відсутності всіх можливих гонок.
- Firefox Desktop, Firefox Android, Edge/Kiwi Android і автоматична idle
  suspension/restart одного worker цим набором не покриті.

Після виконаного запуску оцінюйте JSON/HTML report. Падіння до scenario body
означає помилку запуску середовища; проходження scenario body підтверджується
лише реальним браузерним запуском. Retry вимкнено; падіння не приховується
повтором. Версія розширення й production-код цим E2E-патчем не змінюються.

## Артефакти й діагностика

`test-results/` — traces, screenshots та final state; `playwright-report/` —
HTML; `results.json` — машинний report. Після restart зберігаються traces до
і після нього. Для іншого місця результатів доступні `BD_E2E_RESULTS`,
`BD_E2E_HTML` і `BD_E2E_JSON`.

Офіційні інструкції:

- https://playwright.dev/docs/chrome-extensions
- https://playwright.dev/docs/service-workers
- https://playwright.dev/docs/ci-intro
