// Twitch Chat Counter - Content Script
class TwitchChatCounter {
  constructor() {
    this.uniqueUsers = new Set();
    this.botsList = new Set(); // Список ботов для исключения из подсчета
    this.isActive = false;
    this.isEnabled = false; // Мониторинг выключен по умолчанию
    this.observer = null;
    this.currentStreamer = null;
    this.init();
  }

  init() {
    // Определяем текущего стримера
    this.detectCurrentStreamer();
    
    // Ждем загрузки страницы
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        this.detectCurrentStreamer();
        // Не запускаем мониторинг автоматически
      });
    }
  }

  detectCurrentStreamer() {
    // Различные способы определения стримера
    const selectors = [
      'h1[data-a-target="stream-title"]', // Заголовок стрима
      '.channel-info-content h1', // Заголовок канала
      '[data-a-target="stream-info-card-component-title"]', // Информация о стриме
      'h1[class*="title"]', // Общие заголовки
      '.stream-info h1', // Информация о стриме
      'h1' // Любой заголовок как fallback
    ];

    // Также пробуем извлечь из URL
    const urlMatch = window.location.pathname.match(/\/([^\/]+)/);
    if (urlMatch && urlMatch[1] && urlMatch[1] !== 'directory' && urlMatch[1] !== 'browse') {
      this.currentStreamer = urlMatch[1];
    }

    // Пробуем найти в DOM
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && element.textContent && element.textContent.trim()) {
        const text = element.textContent.trim();
        // Если это не системные тексты
        if (!text.includes('Twitch') && !text.includes('Browse') && text.length > 0) {
          this.currentStreamer = text;
          break;
        }
      }
    }

    // Если не нашли в DOM, используем URL
    if (!this.currentStreamer && urlMatch) {
      this.currentStreamer = urlMatch[1];
    }

    console.log('Twitch Chat Counter: Текущий стример:', this.currentStreamer);
    
    // Отправляем информацию о стримере
    chrome.runtime.sendMessage({
      type: 'STREAMER_UPDATE',
      streamer: this.currentStreamer
    });
  }

  startMonitoring(retryCount = 0, analyzeHistory = false) {
    // Ищем контейнер чата
    const chatContainer = this.findChatContainer();
    if (chatContainer) {
      // Если нужно проанализировать историю и это первый запуск
      if (analyzeHistory && this.uniqueUsers.size === 0) {
        this.analyzeChatHistory();
      }
      
      this.setupChatObserver(chatContainer);
      this.isActive = true;
      console.log('Twitch Chat Counter: Мониторинг чата запущен');
    } else {
      // Если чат еще не загружен, ждем (максимум 10 попыток)
      if (retryCount < 10) {
        console.log(`Twitch Chat Counter: Поиск чата... попытка ${retryCount + 1}/10`);
        setTimeout(() => this.startMonitoring(retryCount + 1, analyzeHistory), 1000);
      } else {
        console.log('Twitch Chat Counter: Не удалось найти чат после 10 попыток');
        this.isActive = false;
      }
    }
  }

  findChatContainer() {
    // Ищем различные селекторы чата Twitch
    const selectors = [
      '[data-a-target="chat-scrollable-area-messages"]',
      '.chat-scrollable-area__message-container',
      '[data-testid="chat-room-component-layout"]',
      '.chat-room__content',
      '.chat-messages'
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        return element;
      }
    }
    return null;
  }

  setupChatObserver(chatContainer) {
    this.observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              this.processNewMessage(node);
            }
          });
        }
      });
    });

    this.observer.observe(chatContainer, {
      childList: true,
      subtree: true
    });
  }

  processNewMessage(node) {
    // Ищем сообщения чата
    const messageSelectors = [
      '[data-a-target="chat-line-message"]',
      '.chat-line__message',
      '.chat-line',
      '[data-testid="chat-line"]'
    ];

    let messageElement = null;
    for (const selector of messageSelectors) {
      if (node.matches && node.matches(selector)) {
        messageElement = node;
        break;
      }
      const found = node.querySelector && node.querySelector(selector);
      if (found) {
        messageElement = found;
        break;
      }
    }

    if (messageElement) {
      this.extractUsername(messageElement);
    }
  }

  extractUsername(messageElement) {
    // Ищем имя пользователя в сообщении
    const usernameSelectors = [
      '[data-a-target="chat-message-username"]',
      '.chat-author__display-name',
      '.chat-line__username',
      '.username',
      '[data-testid="chat-author"]'
    ];

    for (const selector of usernameSelectors) {
      const usernameElement = messageElement.querySelector(selector);
      if (usernameElement) {
        const username = usernameElement.textContent?.trim();
        if (username && username !== '') {
          this.addUser(username);
          break;
        }
      }
    }

    // Альтернативный способ - поиск по атрибутам
    if (!this.lastAddedUser) {
      const usernameAttr = messageElement.getAttribute('data-a-user') || 
                          messageElement.getAttribute('data-user') ||
                          messageElement.getAttribute('data-username');
      if (usernameAttr) {
        this.addUser(usernameAttr);
      }
    }
  }

  addUser(username) {
    // Очищаем имя пользователя от лишних символов
    const cleanUsername = username.replace(/[^\w\-_]/g, '').toLowerCase();
    if (cleanUsername && cleanUsername.length > 0) {
      // Проверяем, является ли пользователь ботом
      if (this.botsList.has(cleanUsername)) {
        console.log(`Twitch Chat Counter: Пользователь ${cleanUsername} является ботом, исключаем из подсчета`);
        return;
      }
      
      const isNewUser = !this.uniqueUsers.has(cleanUsername);
      this.uniqueUsers.add(cleanUsername);
      this.lastAddedUser = cleanUsername;
      
      // Отправляем обновление в background script
      chrome.runtime.sendMessage({
        type: 'USER_COUNT_UPDATE',
        count: this.uniqueUsers.size,
        username: cleanUsername,
        isNewUser: isNewUser,
        usersList: Array.from(this.uniqueUsers)
      });

      // Сбрасываем флаг через небольшую задержку
      setTimeout(() => {
        this.lastAddedUser = null;
      }, 100);
    }
  }

  getUniqueUserCount() {
    return this.uniqueUsers.size;
  }

  resetCounter() {
    this.uniqueUsers.clear();
    // НЕ очищаем список ботов при сбросе счетчика - он должен сохраняться
    chrome.runtime.sendMessage({
      type: 'COUNTER_RESET'
    });
  }

  stopMonitoring() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    this.isActive = false;
  }

  enableMonitoring() {
    console.log('Twitch Chat Counter: Включение мониторинга');
    this.isEnabled = true;
    
    // Отправляем команду начала сессии
    chrome.runtime.sendMessage({
      type: 'SESSION_START'
    });
    
    this.startMonitoring(0, true); // Запускаем с анализом истории
  }

  disableMonitoring() {
    console.log('Twitch Chat Counter: Отключение мониторинга');
    this.isEnabled = false;
    this.stopMonitoring();
    
    // НЕ очищаем список ботов при выключении мониторинга - он должен сохраняться
    
    // Отправляем команду остановки сессии
    chrome.runtime.sendMessage({
      type: 'SESSION_STOP'
    });
    
    // НЕ отправляем команду очистки списка ботов - список должен сохраняться
  }

  toggleMonitoring() {
    if (this.isEnabled) {
      this.disableMonitoring();
    } else {
      this.enableMonitoring();
    }
    return this.isEnabled;
  }

  analyzeChatHistory() {
    console.log('Twitch Chat Counter: Анализ истории чата');
    
    const chatContainer = this.findChatContainer();
    if (!chatContainer) {
      console.log('Twitch Chat Counter: Контейнер чата не найден для анализа истории');
      return;
    }

    // Ищем все существующие сообщения в чате
    const messageSelectors = [
      '[data-a-target="chat-line-message"]',
      '.chat-line__message',
      '.chat-line',
      '[data-testid="chat-line"]'
    ];

    let totalMessages = 0;
    let processedMessages = 0;

    for (const selector of messageSelectors) {
      const messages = chatContainer.querySelectorAll(selector);
      if (messages.length > 0) {
        totalMessages = messages.length;
        console.log(`Twitch Chat Counter: Найдено ${totalMessages} сообщений для анализа`);
        
        messages.forEach((messageElement) => {
          this.extractUsername(messageElement);
          processedMessages++;
        });
        break; // Используем первый найденный селектор
      }
    }

    console.log(`Twitch Chat Counter: Проанализировано ${processedMessages} сообщений, найдено ${this.uniqueUsers.size} уникальных пользователей (боты исключены)`);
    
    // Отправляем обновленный счетчик и список пользователей
    chrome.runtime.sendMessage({
      type: 'USER_COUNT_UPDATE',
      count: this.uniqueUsers.size,
      username: null,
      isNewUser: false,
      usersList: Array.from(this.uniqueUsers)
    });
  }

  restartMonitoring() {
    console.log('Twitch Chat Counter: Перезапуск мониторинга чата');
    
    // Останавливаем текущий мониторинг
    this.stopMonitoring();
    
    // Очищаем только счетчик пользователей, список ботов сохраняем
    this.uniqueUsers.clear();
    
    // Отправляем уведомление о сбросе
    chrome.runtime.sendMessage({
      type: 'COUNTER_RESET'
    });
    
    // Если мониторинг был включен, перезапускаем сессию
    if (this.isEnabled) {
      chrome.runtime.sendMessage({
        type: 'SESSION_RESTART'
      });
    }
    
    // Небольшая задержка перед перезапуском
    setTimeout(() => {
      // Запускаем мониторинг с анализом истории
      this.startMonitoring(0, true);
    }, 500);
  }

  getBotsList() {
    console.log('Twitch Chat Counter: Поиск ботов в чате');
    
    // Очищаем предыдущий список ботов
    this.botsList.clear();
    
    // Ищем блок с заголовком "Чат-боты"
    const chatBotsSection = this.findChatBotsSection();
    
    if (chatBotsSection) {
      console.log('Twitch Chat Counter: Найден блок чат-ботов');
      
      // Ищем все элементы chatter-list-item только внутри этого блока
      const chatterListItems = chatBotsSection.querySelectorAll('.chatter-list-item');
      
      chatterListItems.forEach(item => {
        // Ищем span с именем бота внутри кнопки
        const botSpan = item.querySelector('span');
        if (botSpan) {
          const botName = botSpan.textContent?.trim();
          if (botName && botName !== '') {
            this.botsList.add(botName.toLowerCase());
            console.log(`Twitch Chat Counter: Найден бот: ${botName}`);
          }
        }
        
        // Также проверяем aria-label кнопки для дополнительной информации
        const button = item.querySelector('button');
        if (button) {
          const ariaLabel = button.getAttribute('aria-label');
          if (ariaLabel) {
            // Извлекаем имя бота из aria-label (например: "Подробнее о пользователе wzbot")
            const match = ariaLabel.match(/пользователе\s+(\w+)/i);
            if (match && match[1]) {
              this.botsList.add(match[1].toLowerCase());
              console.log(`Twitch Chat Counter: Найден бот из aria-label: ${match[1]}`);
            }
          }
        }
      });
    } else {
      console.log('Twitch Chat Counter: Блок чат-ботов не найден');
    }

    const botsArray = Array.from(this.botsList);
    console.log(`Twitch Chat Counter: Найдено ${botsArray.length} ботов:`, botsArray);
    
    // Отправляем список ботов в background script
    chrome.runtime.sendMessage({
      type: 'BOTS_LIST_UPDATE',
      botsList: botsArray
    });

    return botsArray;
  }

  findChatBotsSection() {
    // Ищем все блоки с классами Layout-sc-1xcs6mc-0 iymPrH
    const possibleContainers = document.querySelectorAll('.Layout-sc-1xcs6mc-0.iymPrH');
    
    for (const container of possibleContainers) {
      // Проверяем, есть ли внутри этого контейнера заголовок "Чат-боты"
      const title = container.querySelector('strong');
      if (title && title.textContent?.trim() === 'Чат-боты') {
        console.log('Twitch Chat Counter: Найден контейнер ботов с заголовком "Чат-боты"');
        return container;
      }
    }
    
    console.log('Twitch Chat Counter: Блок чат-ботов не найден');
    return null;
  }

  updateBotsListAndRecount() {
    console.log('Twitch Chat Counter: Обновление списка ботов и пересчет участников');
    
    // Получаем новый список ботов
    this.getBotsList();
    
    // Создаем новый Set для пользователей без ботов
    const usersWithoutBots = new Set();
    
    // Пересчитываем пользователей, исключая ботов
    this.uniqueUsers.forEach(username => {
      if (!this.botsList.has(username)) {
        usersWithoutBots.add(username);
      } else {
        console.log(`Twitch Chat Counter: Исключаем бота ${username} из подсчета`);
      }
    });
    
    // Обновляем список пользователей
    this.uniqueUsers = usersWithoutBots;
    
    console.log(`Twitch Chat Counter: Пересчет завершен. Участников без ботов: ${this.uniqueUsers.size}`);
    
    // Отправляем обновленный счетчик
    chrome.runtime.sendMessage({
      type: 'USER_COUNT_UPDATE',
      count: this.uniqueUsers.size,
      username: null,
      isNewUser: false,
      usersList: Array.from(this.uniqueUsers)
    });
  }
}

// Инициализируем счетчик
let chatCounter = null;

// Слушаем сообщения от popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.type) {
    case 'GET_COUNT':
      sendResponse({
        count: chatCounter ? chatCounter.getUniqueUserCount() : 0,
        isActive: chatCounter ? chatCounter.isActive : false,
        isEnabled: chatCounter ? chatCounter.isEnabled : false,
        streamer: chatCounter ? chatCounter.currentStreamer : null,
        usersList: chatCounter ? Array.from(chatCounter.uniqueUsers) : []
      });
      break;
    case 'RESET_COUNTER':
      if (chatCounter) {
        chatCounter.resetCounter();
      }
      sendResponse({ success: true });
      break;
    case 'START_MONITORING':
      if (!chatCounter) {
        chatCounter = new TwitchChatCounter();
      }
      sendResponse({ success: true });
      break;
    case 'RESTART_MONITORING':
      if (chatCounter) {
        chatCounter.restartMonitoring();
      } else {
        chatCounter = new TwitchChatCounter();
      }
      sendResponse({ success: true });
      break;
    case 'TOGGLE_MONITORING':
      if (chatCounter) {
        const isEnabled = chatCounter.toggleMonitoring();
        sendResponse({ success: true, isEnabled: isEnabled });
      } else {
        chatCounter = new TwitchChatCounter();
        const isEnabled = chatCounter.toggleMonitoring();
        sendResponse({ success: true, isEnabled: isEnabled });
      }
      break;
    case 'ENABLE_MONITORING':
      if (chatCounter) {
        chatCounter.enableMonitoring();
      } else {
        chatCounter = new TwitchChatCounter();
        chatCounter.enableMonitoring();
      }
      sendResponse({ success: true });
      break;
    case 'DISABLE_MONITORING':
      if (chatCounter) {
        chatCounter.disableMonitoring();
      }
      sendResponse({ success: true });
      break;
    case 'GET_BOTS_LIST':
      if (chatCounter) {
        const botsList = chatCounter.getBotsList();
        sendResponse({ success: true, botsList: botsList });
      } else {
        sendResponse({ success: false, error: 'Chat counter not initialized' });
      }
      break;
    case 'UPDATE_BOTS_AND_RECOUNT':
      if (chatCounter) {
        chatCounter.updateBotsListAndRecount();
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: 'Chat counter not initialized' });
      }
      break;
  }
});

// Функция для очистки данных при смене страницы
function clearPageData() {
  console.log('Twitch Chat Counter: Очистка данных при смене страницы');
  
  // НЕ очищаем список ботов при смене страницы - он должен сохраняться между страницами
  
  // Отправляем команду очистки в background script
  chrome.runtime.sendMessage({
    type: 'PAGE_CHANGE_CLEAR'
  });
  
  // НЕ отправляем команду очистки списка ботов - список должен сохраняться
}

// Функция для инициализации счетчика
function initializeChatCounter() {
  if (window.location.hostname === 'www.twitch.tv') {
    console.log('Twitch Chat Counter: Инициализация на странице Twitch');
    chatCounter = new TwitchChatCounter();
    
    // Мониторинг выключен по умолчанию - пользователь должен включить его вручную
    console.log('Twitch Chat Counter: Мониторинг выключен по умолчанию');
  }
}

// Инициализируем счетчик при загрузке
initializeChatCounter();

// Обработка смены страницы (SPA навигация)
let currentUrl = window.location.href;
const urlObserver = new MutationObserver(() => {
  if (window.location.href !== currentUrl) {
    console.log('Twitch Chat Counter: Обнаружена смена страницы');
    currentUrl = window.location.href;
    
    // Очищаем данные при смене страницы
    clearPageData();
    
    // Останавливаем текущий мониторинг
    if (chatCounter) {
      chatCounter.stopMonitoring();
    }
    
    // Небольшая задержка для загрузки новой страницы
    setTimeout(() => {
      initializeChatCounter();
    }, 1000);
  }
});

// Наблюдаем за изменениями в DOM (для SPA навигации)
urlObserver.observe(document.body, {
  childList: true,
  subtree: true
});

// Дополнительная проверка при изменении URL через history API
window.addEventListener('popstate', () => {
  console.log('Twitch Chat Counter: Обнаружена навигация через history API');
  
  // Очищаем данные при смене страницы
  clearPageData();
  
  setTimeout(() => {
    if (chatCounter) {
      chatCounter.stopMonitoring();
    }
    initializeChatCounter();
  }, 500);
});
