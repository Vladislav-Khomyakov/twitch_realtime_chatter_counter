// Twitch Chat Counter - Background Script
class BackgroundController {
  constructor() {
    this.init();
  }

  init() {
    this.setupMessageListener();
    this.setupInstallListener();
    this.loadInitialData();
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleMessage(request, sender, sendResponse);
      return true; // Асинхронный ответ
    });
  }

  setupInstallListener() {
    chrome.runtime.onInstalled.addListener((details) => {
      if (details.reason === 'install') {
        this.handleInstall();
      } else if (details.reason === 'update') {
        this.handleUpdate(details.previousVersion);
      }
    });
  }

  async loadInitialData() {
    try {
      const result = await chrome.storage.local.get(['userCount', 'sessionStartTime']);
      
      if (!result.userCount) {
        await chrome.storage.local.set({ userCount: 0 });
      }
      
      if (!result.sessionStartTime) {
        await chrome.storage.local.set({ 
          sessionStartTime: new Date().toISOString() 
        });
      }
    } catch (error) {
      console.error('Ошибка инициализации данных:', error);
    }
  }

  async handleMessage(request, sender, sendResponse) {
    try {
      switch (request.type) {
        case 'USER_COUNT_UPDATE':
          await this.updateUserCount(request.count, request.username, request.isNewUser, request.usersList);
          break;
          
        case 'COUNTER_RESET':
          await this.resetCounter();
          break;
          
        case 'STREAMER_UPDATE':
          await this.updateStreamer(request.streamer);
          break;
          
        case 'PAGE_CHANGE_CLEAR':
          await this.clearPageData();
          break;
          
        case 'SESSION_START':
          await this.startSession();
          break;
          
        case 'SESSION_STOP':
          await this.stopSession();
          break;
          
        case 'SESSION_RESTART':
          await this.restartSession();
          break;
          
        case 'BOTS_LIST_UPDATE':
          await this.updateBotsList(request.botsList);
          break;
          
        case 'GET_STATS':
          const stats = await this.getStats();
          sendResponse(stats);
          break;
          
        default:
          console.log('Неизвестный тип сообщения:', request.type);
      }
    } catch (error) {
      console.error('Ошибка обработки сообщения:', error);
      sendResponse({ error: error.message });
    }
  }

  async updateUserCount(count, username, isNewUser, usersList) {
    try {
      // Обновляем счетчик
      await chrome.storage.local.set({ userCount: count });
      
      // Сохраняем список пользователей
      if (usersList) {
        await chrome.storage.local.set({ usersList: usersList });
      }
      
      // Сохраняем последнего пользователя
      if (username) {
        await chrome.storage.local.set({ 
          lastUser: username,
          lastUpdate: new Date().toISOString()
        });
      }

      // Отправляем обновление в popup (если открыт)
      this.notifyPopup({ 
        type: 'COUNT_UPDATE', 
        count: count,
        username: username,
        isNewUser: isNewUser,
        usersList: usersList
      });
      
      // Обновляем badge
      this.updateBadge(count);
      
    } catch (error) {
      console.error('Ошибка обновления счетчика:', error);
    }
  }

  async resetCounter() {
    try {
      await chrome.storage.local.set({ 
        userCount: 0,
        sessionStartTime: new Date().toISOString(),
        lastUser: null,
        lastUpdate: null,
        usersList: []
      });
      
      this.updateBadge(0);
      this.notifyPopup({ type: 'COUNTER_RESET' });
      
    } catch (error) {
      console.error('Ошибка сброса счетчика:', error);
    }
  }

  async updateStreamer(streamer) {
    try {
      await chrome.storage.local.set({ 
        currentStreamer: streamer,
        streamerUpdate: new Date().toISOString()
      });
      
      this.notifyPopup({ type: 'STREAMER_UPDATE', streamer: streamer });
      
    } catch (error) {
      console.error('Ошибка обновления стримера:', error);
    }
  }

  async clearPageData() {
    try {
      console.log('Background: Очистка данных при смене страницы');
      
      // Очищаем счетчик пользователей, время сессии и список ботов
      await chrome.storage.local.set({ 
        userCount: 0,
        sessionStartTime: null, // Не сбрасываем время сессии при смене страницы
        usersList: [],
        sessionActive: false,
        botsList: []
      });
      
      // Обновляем badge
      this.updateBadge(0);
      
      // Уведомляем popup об очистке
      this.notifyPopup({ 
        type: 'PAGE_CHANGE_CLEAR',
        userCount: 0,
        usersList: [],
        botsList: []
      });
      
    } catch (error) {
      console.error('Ошибка очистки данных при смене страницы:', error);
    }
  }

  async startSession() {
    try {
      console.log('Background: Начало сессии мониторинга');
      
      await chrome.storage.local.set({ 
        sessionStartTime: new Date().toISOString(),
        sessionActive: true
      });
      
      this.notifyPopup({ 
        type: 'SESSION_START',
        sessionStartTime: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('Ошибка начала сессии:', error);
    }
  }

  async stopSession() {
    try {
      console.log('Background: Остановка сессии мониторинга');
      
      await chrome.storage.local.set({ 
        sessionActive: false
      });
      
      this.notifyPopup({ 
        type: 'SESSION_STOP'
      });
      
    } catch (error) {
      console.error('Ошибка остановки сессии:', error);
    }
  }

  async restartSession() {
    try {
      console.log('Background: Перезапуск сессии мониторинга');
      
      await chrome.storage.local.set({ 
        sessionStartTime: new Date().toISOString(),
        sessionActive: true
      });
      
      this.notifyPopup({ 
        type: 'SESSION_RESTART',
        sessionStartTime: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('Ошибка перезапуска сессии:', error);
    }
  }

  async updateBotsList(botsList) {
    try {
      console.log('Background: Обновление списка ботов');
      
      await chrome.storage.local.set({ 
        botsList: botsList,
        botsUpdateTime: new Date().toISOString()
      });
      
      this.notifyPopup({ 
        type: 'BOTS_LIST_UPDATE',
        botsList: botsList
      });
      
    } catch (error) {
      console.error('Ошибка обновления списка ботов:', error);
    }
  }

  async getStats() {
    try {
      const result = await chrome.storage.local.get([
        'userCount', 
        'sessionStartTime', 
        'lastUser', 
        'lastUpdate',
        'currentStreamer',
        'usersList',
        'sessionActive',
        'botsList'
      ]);
      
      return {
        userCount: result.userCount || 0,
        sessionStartTime: result.sessionStartTime,
        lastUser: result.lastUser,
        lastUpdate: result.lastUpdate,
        currentStreamer: result.currentStreamer,
        usersList: result.usersList || [],
        sessionActive: result.sessionActive || false,
        botsList: result.botsList || []
      };
    } catch (error) {
      console.error('Ошибка получения статистики:', error);
      return { error: error.message };
    }
  }

  updateBadge(count) {
    try {
      const badgeText = count > 0 ? count.toString() : '';
      chrome.action.setBadgeText({ text: badgeText });
      chrome.action.setBadgeBackgroundColor({ color: '#9146ff' }); // Twitch purple
    } catch (error) {
      console.error('Ошибка обновления badge:', error);
    }
  }

  notifyPopup(message) {
    // Отправляем сообщение в popup, если он открыт
    chrome.runtime.sendMessage(message).catch(() => {
      // Popup может быть закрыт, это нормально
    });
  }

  handleInstall() {
    console.log('Twitch Chat Counter установлен');
    
    // Устанавливаем начальные настройки
    chrome.storage.local.set({
      userCount: 0,
      sessionStartTime: new Date().toISOString(),
      version: chrome.runtime.getManifest().version
    });
  }

  handleUpdate(previousVersion) {
    console.log(`Twitch Chat Counter обновлен с версии ${previousVersion}`);
    
    // Здесь можно добавить логику миграции данных при обновлении
    chrome.storage.local.set({
      version: chrome.runtime.getManifest().version,
      lastUpdate: new Date().toISOString()
    });
  }
}

// Инициализируем background controller
const backgroundController = new BackgroundController();
