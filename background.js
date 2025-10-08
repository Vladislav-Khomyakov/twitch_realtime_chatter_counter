// Twitch Chat Counter - Background Script
class BackgroundController {
  constructor() {
    this.tabData = new Map(); // Хранилище данных по вкладкам
    this.init();
  }

  init() {
    this.setupMessageListener();
    this.setupInstallListener();
    this.setupTabListener();
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

  setupTabListener() {
    // Очищаем данные при закрытии вкладки
    chrome.tabs.onRemoved.addListener((tabId) => {
      this.cleanupTabData(tabId);
    });

    // Очищаем данные при обновлении вкладки
    chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
      if (changeInfo.status === 'loading' && changeInfo.url) {
        // Если URL изменился, очищаем данные вкладки
        this.cleanupTabData(tabId);
      }
    });

    // Обновляем badge при смене активной вкладки
    chrome.tabs.onActivated.addListener(async (activeInfo) => {
      await this.updateBadgeForActiveTab();
    });
  }

  cleanupTabData(tabId) {
    if (this.tabData.has(tabId)) {
      console.log(`Background: Очистка данных для вкладки ${tabId}`);
      this.tabData.delete(tabId);
      
      // Обновляем общую статистику
      this.updateGlobalStats();
    }
  }

  getTabData(tabId) {
    if (!this.tabData.has(tabId)) {
      this.tabData.set(tabId, {
        userCount: 0,
        usersList: [],
        sessionStartTime: null,
        sessionActive: false,
        currentStreamer: null,
        botsList: [], // Список ботов уникален для каждой вкладки
        lastUser: null,
        lastUpdate: null
      });
    }
    return this.tabData.get(tabId);
  }

  async updateGlobalStats() {
    // Подсчитываем общую статистику по всем вкладкам
    let totalUsers = 0;
    let allUsers = new Set();
    let activeTabs = 0;

    for (const [tabId, data] of this.tabData) {
      if (data.sessionActive) {
        activeTabs++;
        totalUsers += data.userCount;
        data.usersList.forEach(user => allUsers.add(user));
      }
    }

    // Сохраняем глобальную статистику
    await chrome.storage.local.set({
      globalUserCount: totalUsers,
      globalUsersList: Array.from(allUsers),
      activeTabsCount: activeTabs
    });

    // Обновляем badge с количеством пользователей активной вкладки
    await this.updateBadgeForActiveTab();
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
      const tabId = sender.tab?.id;
      if (!tabId) {
        // Если сообщение приходит не из content script (например, из popup), 
        // обрабатываем его по-другому
        if (request.type === 'GET_ALL_TABS_STATS') {
          const allStats = await this.getAllTabsStats();
          sendResponse(allStats);
          return;
        }
        if (request.type === 'GET_STATS' && request.tabId) {
          const stats = await this.getStats(request.tabId);
          sendResponse(stats);
          return;
        }
        console.log('Background: Сообщение не из content script, пропускаем');
        return;
      }

      switch (request.type) {
        case 'USER_COUNT_UPDATE':
          await this.updateUserCount(tabId, request.count, request.username, request.isNewUser, request.usersList);
          break;
          
        case 'COUNTER_RESET':
          await this.resetCounter(tabId);
          break;
          
        case 'STREAMER_UPDATE':
          await this.updateStreamer(tabId, request.streamer);
          break;
          
        case 'PAGE_CHANGE_CLEAR':
          await this.clearPageData(tabId);
          break;
          
        case 'SESSION_START':
          await this.startSession(tabId);
          break;
          
        case 'SESSION_STOP':
          await this.stopSession(tabId);
          break;
          
        case 'SESSION_RESTART':
          await this.restartSession(tabId);
          break;
          
        case 'BOTS_LIST_UPDATE':
          await this.updateBotsList(tabId, request.botsList);
          break;
          
        case 'GET_STATS':
          const stats = await this.getStats(tabId);
          sendResponse(stats);
          break;

        case 'GET_ALL_TABS_STATS':
          const allStats = await this.getAllTabsStats();
          sendResponse(allStats);
          break;
          
        default:
          console.log('Неизвестный тип сообщения:', request.type);
      }
    } catch (error) {
      console.error('Ошибка обработки сообщения:', error);
      sendResponse({ error: error.message });
    }
  }

  async updateUserCount(tabId, count, username, isNewUser, usersList) {
    try {
      const tabData = this.getTabData(tabId);
      
      // Обновляем данные вкладки
      tabData.userCount = count;
      if (usersList) {
        tabData.usersList = usersList;
      }
      if (username) {
        tabData.lastUser = username;
        tabData.lastUpdate = new Date().toISOString();
      }

      // Обновляем глобальную статистику
      await this.updateGlobalStats();

      // Отправляем обновление в popup (если открыт)
      this.notifyPopup({ 
        type: 'COUNT_UPDATE', 
        tabId: tabId,
        count: count,
        username: username,
        isNewUser: isNewUser,
        usersList: usersList
      });
      
    } catch (error) {
      console.error('Ошибка обновления счетчика:', error);
    }
  }

  async resetCounter(tabId) {
    try {
      const tabData = this.getTabData(tabId);
      
      // Сбрасываем данные вкладки
      tabData.userCount = 0;
      tabData.sessionStartTime = new Date().toISOString();
      tabData.lastUser = null;
      tabData.lastUpdate = null;
      tabData.usersList = [];
      
      // Обновляем глобальную статистику
      await this.updateGlobalStats();
      
      this.notifyPopup({ type: 'COUNTER_RESET', tabId: tabId });
      
    } catch (error) {
      console.error('Ошибка сброса счетчика:', error);
    }
  }

  async updateStreamer(tabId, streamer) {
    try {
      const tabData = this.getTabData(tabId);
      
      // Обновляем данные вкладки
      tabData.currentStreamer = streamer;
      
      this.notifyPopup({ type: 'STREAMER_UPDATE', tabId: tabId, streamer: streamer });
      
    } catch (error) {
      console.error('Ошибка обновления стримера:', error);
    }
  }

  async clearPageData(tabId) {
    try {
      console.log(`Background: Очистка данных при смене страницы для вкладки ${tabId}`);
      
      const tabData = this.getTabData(tabId);
      
      // Очищаем данные вкладки, но сохраняем список ботов
      tabData.userCount = 0;
      tabData.usersList = [];
      tabData.sessionActive = false;
      // НЕ очищаем tabData.botsList - список ботов должен сохраняться между страницами
      
      // Обновляем глобальную статистику
      await this.updateGlobalStats();
      
      // Уведомляем popup об очистке, но сохраняем список ботов
      this.notifyPopup({ 
        type: 'PAGE_CHANGE_CLEAR',
        tabId: tabId,
        userCount: 0,
        usersList: [],
        botsList: tabData.botsList // Сохраняем список ботов
      });
      
    } catch (error) {
      console.error('Ошибка очистки данных при смене страницы:', error);
    }
  }

  async startSession(tabId) {
    try {
      console.log(`Background: Начало сессии мониторинга для вкладки ${tabId}`);
      
      const tabData = this.getTabData(tabId);
      
      // Обновляем данные вкладки
      tabData.sessionStartTime = new Date().toISOString();
      tabData.sessionActive = true;
      
      // Обновляем глобальную статистику
      await this.updateGlobalStats();
      
      this.notifyPopup({ 
        type: 'SESSION_START',
        tabId: tabId,
        sessionStartTime: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('Ошибка начала сессии:', error);
    }
  }

  async stopSession(tabId) {
    try {
      console.log(`Background: Остановка сессии мониторинга для вкладки ${tabId}`);
      
      const tabData = this.getTabData(tabId);
      
      // Обновляем данные вкладки
      tabData.sessionActive = false;
      
      // Обновляем глобальную статистику
      await this.updateGlobalStats();
      
      this.notifyPopup({ 
        type: 'SESSION_STOP',
        tabId: tabId
      });
      
    } catch (error) {
      console.error('Ошибка остановки сессии:', error);
    }
  }

  async restartSession(tabId) {
    try {
      console.log(`Background: Перезапуск сессии мониторинга для вкладки ${tabId}`);
      
      const tabData = this.getTabData(tabId);
      
      // Обновляем данные вкладки
      tabData.sessionStartTime = new Date().toISOString();
      tabData.sessionActive = true;
      
      // Обновляем глобальную статистику
      await this.updateGlobalStats();
      
      this.notifyPopup({ 
        type: 'SESSION_RESTART',
        tabId: tabId,
        sessionStartTime: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('Ошибка перезапуска сессии:', error);
    }
  }

  async updateBotsList(tabId, botsList) {
    try {
      console.log(`Background: Обновление списка ботов для вкладки ${tabId}`);
      
      const tabData = this.getTabData(tabId);
      
      // Обновляем данные вкладки
      tabData.botsList = botsList;
      
      this.notifyPopup({ 
        type: 'BOTS_LIST_UPDATE',
        tabId: tabId,
        botsList: botsList
      });
      
    } catch (error) {
      console.error('Ошибка обновления списка ботов:', error);
    }
  }

  async getStats(tabId) {
    try {
      const tabData = this.getTabData(tabId);
      
      return {
        tabId: tabId,
        userCount: tabData.userCount || 0,
        sessionStartTime: tabData.sessionStartTime,
        lastUser: tabData.lastUser,
        lastUpdate: tabData.lastUpdate,
        currentStreamer: tabData.currentStreamer,
        usersList: tabData.usersList || [],
        sessionActive: tabData.sessionActive || false,
        botsList: tabData.botsList || []
      };
    } catch (error) {
      console.error('Ошибка получения статистики:', error);
      return { error: error.message };
    }
  }

  async getAllTabsStats() {
    try {
      console.log('Background: getAllTabsStats вызван, количество вкладок в tabData:', this.tabData.size);
      const allTabs = [];
      
      for (const [tabId, data] of this.tabData) {
        console.log(`Background: Обрабатываем вкладку ${tabId}:`, data);
        allTabs.push({
          tabId: tabId,
          userCount: data.userCount || 0,
          sessionStartTime: data.sessionStartTime,
          lastUser: data.lastUser,
          lastUpdate: data.lastUpdate,
          currentStreamer: data.currentStreamer,
          usersList: data.usersList || [],
          sessionActive: data.sessionActive || false,
          botsList: data.botsList || []
        });
      }
      
      // Получаем глобальную статистику
      const globalStats = await chrome.storage.local.get([
        'globalUserCount',
        'globalUsersList',
        'activeTabsCount'
      ]);
      
      const result = {
        tabs: allTabs,
        global: {
          userCount: globalStats.globalUserCount || 0,
          usersList: globalStats.globalUsersList || [],
          activeTabsCount: globalStats.activeTabsCount || 0
        }
      };
      
      console.log('Background: Возвращаем статистику:', result);
      return result;
    } catch (error) {
      console.error('Ошибка получения статистики всех вкладок:', error);
      return { error: error.message };
    }
  }

  async updateBadgeForActiveTab() {
    try {
      // Получаем активную вкладку Twitch
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      let activeTabUserCount = 0;
      
      if (tabs.length > 0) {
        const activeTab = tabs[0];
        if (activeTab.url && activeTab.url.includes('twitch.tv')) {
          const tabData = this.getTabData(activeTab.id);
          activeTabUserCount = tabData.userCount || 0;
        }
      }
      
      const badgeText = activeTabUserCount > 0 ? activeTabUserCount.toString() : '';
      chrome.action.setBadgeText({ text: badgeText });
      chrome.action.setBadgeBackgroundColor({ color: '#9146ff' }); // Twitch purple
    } catch (error) {
      console.error('Ошибка обновления badge для активной вкладки:', error);
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

  async getTwitchTabs() {
    try {
      const tabs = await chrome.tabs.query({ url: 'https://www.twitch.tv/*' });
      return tabs.map(tab => ({
        id: tab.id,
        title: tab.title,
        url: tab.url,
        active: tab.active
      }));
    } catch (error) {
      console.error('Ошибка получения вкладок Twitch:', error);
      return [];
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
