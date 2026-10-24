# Заявки → Google Таблиця + Email

Кожна заявка з калькулятора додається новим рядком у Google Таблицю,
і на вашу Gmail-пошту приходить лист із кнопками «Anrufen» та «WhatsApp».

## Налаштування (~5 хвилин, один раз)

1. Відкрийте https://sheets.new під своїм Google-акаунтом. Назвіть таблицю, наприклад, «Einfach Umzüge – Anfragen».
2. У меню таблиці: **Розширення → Apps Script** (Extensions → Apps Script).
3. Видаліть увесь код у файлі `Code.gs` і вставте вміст файлу [Code.gs](Code.gs) з цієї папки. Натисніть 💾 (Зберегти).
4. Праворуч угорі: **Розгорнути → Нове розгортання** (Deploy → New deployment).
   - Тип (⚙️): **Вебдодаток** (Web app)
   - Виконувати від імені: **Я** (Me)
   - Хто має доступ: **Усі** (Anyone)
   - Натисніть **Розгорнути**.
5. Google попросить дозвіл: **Надати доступ → виберіть свій акаунт → Advanced / Додатково → Перейти до проєкту (небезпечно) → Дозволити**.
   Це нормально: скрипт ваш, Google просто його не перевіряв. Доступ потрібен, щоб писати в таблицю й надсилати листи.
6. Скопіюйте **URL вебдодатка** (закінчується на `/exec`).
7. Вставте його в [src/config.js](../src/config.js):
   ```js
   export const FORM_ENDPOINT = 'https://script.google.com/macros/s/…/exec';
   ```
8. `npm run build` → вивантажте нову папку `dist/` на хостинг.

## Перевірка

- **У редакторі Apps Script (ще до розгортання):** угорі виберіть функцію `testAnfrage` → ▶ **Виконати**. У таблиці з'явиться рядок «TEST – bitte löschen», а на пошту прийде тестовий лист.
- Відкрийте URL з кроку 6 у браузері — має показати `{"ok":true,…}`.
- Заповніть калькулятор на сайті й надішліть заявку → у таблиці з'явиться аркуш «Anfragen» з рядком, а на пошту прийде лист.

## Корисно знати

- Лист приходить на пошту Google-акаунта, в якому створено скрипт. Інша адреса → вкажіть її в `NOTIFY_EMAIL` у `Code.gs`.
- Колонка **Status** («Neu») — для вас: міняйте на «Angebot geschickt», «Gebucht», «Abgesagt».
- Якщо змінюєте `Code.gs`: **Розгорнути → Керувати розгортаннями → ✏️ → Версія: Нова → Розгорнути**. URL залишається той самий.
- Ліміт Gmail: ~100 листів на день (безкоштовний акаунт) — для заявок більш ніж достатньо.
- Якщо скрипт недоступний, сайт запропонує клієнту надіслати заявку через WhatsApp — заявка не загубиться.

## Bestätigung an den Kunden mit echtem Absender anfrage@einfach-umzuege.de (Brevo, kostenlos)

Без цього кроку підтвердження клієнту все одно надсилається, але відправником технічно буде ваш Gmail (з ім'ям «Einfach Umzüge» і відповіддю на anfrage@).

1. Зареєструйтесь на https://www.brevo.com (безкоштовний план: 300 листів/день).
2. **Settings → Senders, Domains & Dedicated IPs → Domains → Add a domain** → `einfach-umzuege.de`.
   Brevo покаже DNS-записи (TXT `brevo-code`, 2× DKIM, DMARC). Додайте їх у **Spaceship → Advanced DNS** і натисніть у Brevo **Verify**.
   ⚠️ Другий SPF-запис НЕ додавати – існуючий `v=spf1 include:secureserver.net -all` не чіпати.
3. **Senders → Add a sender** → `anfrage@einfach-umzuege.de`, ім'я «Einfach Umzüge» (підтвердити кодом з цієї скриньки).
4. **SMTP & API → API Keys → Generate a new API key** → скопіювати.
5. Apps Script → ⚙️ **Project Settings → Script Properties → Add script property**:
   `BREVO_API_KEY` = ваш ключ → **Save**. (Нове розгортання не потрібне.)
6. Перевірка: функція `testAnfrage` → ▶ Run → підтвердження прийде на вашу пошту від anfrage@einfach-umzuege.de.
