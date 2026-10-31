/* =========================================================
   I18N — строки интерфейса + выбор поля по языку (title_ru / title_kk / title_en)
   ========================================================= */
(function (App) {
  const C = window.APP_CONFIG;
  const { store } = App.utils;

  const DICT = {
    ru: {
      back: 'Назад', up: 'Наверх', cart: 'Корзина', close: 'Закрыть',
      search: 'Поиск или «хочу что-то лёгкое»', aiPickBtn: 'Подобрать с ИИ', aiPickHint: 'Опишите словами, чего хочется — ИИ предложит блюда из меню', aiLoading: 'Подбираю блюда…', aiNote: 'Подбирает ИИ и может ошибаться. Об аллергиях уточните у официанта.', aiEmpty: 'Не получилось подобрать. Попробуйте описать по-другому.', aiError: 'ИИ сейчас недоступен — воспользуйтесь обычным поиском.', aiTitle: 'Подборка для вас', aiFocusHint: 'Напишите, чего хочется, и нажмите «✨ Подобрать с ИИ»', aiPressHint: 'Нажмите — ИИ подберёт блюда по вашему запросу', aiTry: 'Например:', aiExamples: ['что-то к пиву', 'лёгкое без мяса', 'сладкое к кофе', 'сытное на двоих'], notFound: 'Ничего не нашлось. Попробуйте другое название.',
      cartTitle: 'Ваш заказ', total: 'Итого', positions: 'Позиций',
      order: 'Заказать', addToOrder: 'Добавить к заказу?',
      emptyCart: 'В заказе пока пусто', toMenu: 'Открыть меню',
      viewDish: 'Посмотреть блюдо', added: 'Добавлено в заказ',
      more: 'Подробнее', addWithPrice: 'Добавить', pairsWith: 'С этим берут', tipTap: 'Нажмите на блюдо — откроются фото и полное описание', tipOk: 'Понятно', photoNote: 'Внешний вид блюда может отличаться от фото',
      chooseVariant: 'Выберите вариант', byDefault: 'По умолчанию', from: 'от',
      remove: 'Удалить', orderSent: 'Заказ отправлен', orderFailed: 'Заказ не отправлен. Проверьте интернет и нажмите ещё раз.',
      orderMsgTitle: 'Новый заказ', loadError: 'Меню не загрузилось. Проверьте интернет.', retry: 'Повторить',
      noticeAgree: 'Согласен(-на)', closedNow: 'Часы работы с {from} - {to}',
      copyOrderFallback: 'Не открылся WhatsApp? Скопировать заказ',
      orderCopied: 'Заказ скопирован — отправьте его на {phone}',
      orderCopiedNoPhone: 'Заказ скопирован',
      copyFailed: 'Не получилось скопировать'
    },
    kk: {
      back: 'Артқа', up: 'Жоғары', cart: 'Себет', close: 'Жабу',
      search: 'Іздеу немесе «жеңіл бірдеңе»', aiPickBtn: 'ЖИ арқылы таңдау', aiPickHint: 'Не қалайтыныңызды жазыңыз — ЖИ мәзірден тағам ұсынады', aiLoading: 'Тағамдарды таңдап жатырмын…', aiNote: 'ЖИ таңдайды және қателесуі мүмкін. Аллергия туралы даяшыдан сұраңыз.', aiEmpty: 'Таңдау мүмкін болмады. Басқаша сипаттап көріңіз.', aiError: 'ЖИ қазір қолжетімсіз — кәдімгі іздеуді пайдаланыңыз.', aiTitle: 'Сізге арналған таңдау', aiFocusHint: 'Не қалайтыныңызды жазып, «✨ ЖИ арқылы таңдау» батырмасын басыңыз', aiPressHint: 'Басыңыз — ЖИ сұранысыңыз бойынша тағам таңдайды', aiTry: 'Мысалы:', aiExamples: ['сыраға бірдеңе', 'етсіз жеңіл тағам', 'кофеге тәтті', 'екі адамға тойымды'], notFound: 'Ештеңе табылмады. Басқа атауды жазып көріңіз.',
      cartTitle: 'Сіздің тапсырысыңыз', total: 'Барлығы', positions: 'Позиция',
      order: 'Тапсырыс беру', addToOrder: 'Тапсырысқа қосасыз ба?',
      emptyCart: 'Тапсырыс әзірге бос', toMenu: 'Мәзірді ашу',
      viewDish: 'Тағамды көру', added: 'Тапсырысқа қосылды',
      more: 'Толығырақ', addWithPrice: 'Қосу', pairsWith: 'Бұған қоса алады', tipTap: 'Тағамды басыңыз — фотосы мен толық сипаттамасы ашылады', tipOk: 'Түсінікті', photoNote: 'Тағамның сыртқы түрі суреттен өзгеше болуы мүмкін',
      chooseVariant: 'Нұсқаны таңдаңыз', byDefault: 'Әдепкі', from: 'бастап',
      remove: 'Жою', orderSent: 'Тапсырыс жіберілді', orderFailed: 'Тапсырыс жіберілмеді. Интернетті тексеріп, қайта басыңыз.',
      orderMsgTitle: 'Жаңа тапсырыс', loadError: 'Мәзір жүктелмеді. Интернетті тексеріңіз.', retry: 'Қайталау',
      noticeAgree: 'Келісемін', closedNow: 'Жұмыс уақыты: {from} - {to}',
      copyOrderFallback: 'WhatsApp ашылмады ма? Тапсырысты көшіру',
      orderCopied: 'Тапсырыс көшірілді — {phone} нөміріне жіберіңіз',
      orderCopiedNoPhone: 'Тапсырыс көшірілді',
      copyFailed: 'Көшіру сәтсіз аяқталды'
    },
    en: {
      back: 'Back', up: 'Back to top', cart: 'Cart', close: 'Close',
      search: 'Search or “something light”', aiPickBtn: 'Ask AI to pick', aiPickHint: 'Describe what you feel like — AI will suggest dishes from the menu', aiLoading: 'Picking dishes…', aiNote: 'Picked by AI and may be wrong. Ask your waiter about allergies.', aiEmpty: 'Couldn’t find a match. Try describing it differently.', aiError: 'AI is unavailable right now — please use the regular search.', aiTitle: 'Picked for you', aiFocusHint: 'Type what you feel like and tap “✨ Ask AI to pick”', aiPressHint: 'Tap — AI will pick dishes for your request', aiTry: 'For example:', aiExamples: ['snacks for beer', 'light, no meat', 'sweet with coffee', 'hearty for two'], notFound: 'Nothing found. Try another name.',
      cartTitle: 'Your order', total: 'Total', positions: 'Items',
      order: 'Place order', addToOrder: 'Add to your order?',
      emptyCart: 'Your order is empty', toMenu: 'Open menu',
      viewDish: 'View dish', added: 'Added to order',
      more: 'Details', addWithPrice: 'Add', pairsWith: 'Goes well with', tipTap: 'Tap a dish to see the photo and full description', tipOk: 'Got it', photoNote: 'Actual dish may look different from the photo',
      chooseVariant: 'Choose an option', byDefault: 'Default', from: 'from',
      remove: 'Remove', orderSent: 'Order sent', orderFailed: 'Order not sent. Check your connection and try again.',
      orderMsgTitle: 'New order', loadError: 'Menu failed to load. Check your connection.', retry: 'Retry',
      noticeAgree: 'I agree', closedNow: 'Opening hours: {from} - {to}',
      copyOrderFallback: "WhatsApp didn't open? Copy order",
      orderCopied: 'Order copied — send it to {phone}',
      orderCopiedNoPhone: 'Order copied',
      copyFailed: 'Could not copy'
    }
  };

  const SHORT = { ru: 'RU', kk: 'KZ', en: 'EN' };     // шапка меню
  const WELCOME = { ru: 'Рус', kk: 'Қаз', en: 'En' }; // главный экран
  const FULL = { ru: 'Русский', kk: 'Қазақша', en: 'English' };

  const listeners = [];
  let lang = store.get(C.LANG_KEY, C.DEFAULT_LANG);
  if (!C.LANGS.includes(lang)) lang = C.DEFAULT_LANG;
  document.documentElement.lang = lang;

  const I18n = {
    get lang() { return lang; },
    langs: C.LANGS, SHORT, WELCOME, FULL,

    set(next) {
      if (!C.LANGS.includes(next) || next === lang) return;
      lang = next;
      store.set(C.LANG_KEY, lang);
      document.documentElement.lang = lang;
      I18n.applyStatic();
      listeners.forEach((fn) => fn(lang));
    },

    /** Строка интерфейса */
    t(key) { return DICT[lang]?.[key] ?? DICT.ru[key] ?? key; },

    /** Поле данных на текущем языке с фолбэком на русский */
    f(obj, field) {
      if (!obj) return '';
      return obj[`${field}_${lang}`] || obj[`${field}_ru`] || obj[field] || '';
    },

    onChange(fn) { listeners.push(fn); },

    /** Статичные элементы с data-i18n / data-i18n-aria */
    applyStatic() {
      document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = I18n.t(el.dataset.i18n); });
      document.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', I18n.t(el.dataset.i18nAria)); });
      const input = document.getElementById('searchInput');
      if (input) input.placeholder = I18n.t('search');
    }
  };

  App.I18n = I18n;
})(window.App);
