// Twitch Chat Counter - Popup Script
class PopupController {
  constructor() {
    this.userCount = 0;
    this.isActive = false;
    this.isEnabled = false;
    this.currentStreamer = null;
    this.usersList = [];
    this.botsList = [];
    this.sessionStartTime = null;
    this.sessionActive = false;
    this.sessionTimer = null;
    this.currentTabId = null;
    this.allTabs = [];
    this.allTabsStats = {};
    this.globalUserCount = 0;
    this.init();
  }

  init() {
    console.log('Popup: Инициализация popup');
    this.bindEvents();
    this.loadData();
    this.startSessionTimer();
    
    // Изначально скрываем секцию табов
    const tabsSection = document.getElementById('tabsSection');
    if (tabsSection) {
      tabsSection.style.display = 'none';
      console.log('Popup: Секция табов изначально скрыта');
    } else {
      console.log('Popup: ОШИБКА - секция табов не найдена в DOM');
    }
    
    this.checkCurrentTab();
  }

  bindEvents() {
    document.getElementById('refreshButton').addEventListener('click', () => {
      this.refreshData();
    });

    document.getElementById('monitoringToggle').addEventListener('change', (e) => {
      this.toggleMonitoring(e.target.checked);
    });

    document.getElementById('exportUsersButton').addEventListener('click', () => {
      this.exportUsersList();
    });

    document.getElementById('getBotsButton').addEventListener('click', () => {
      this.getBotsList();
    });

    document.getElementById('exportBotsButton').addEventListener('click', () => {
      this.exportBotsList();
    });

    document.getElementById('refreshTabsButton').addEventListener('click', () => {
      this.refreshTabsList();
    });
  }

  async loadData() {
    try {
      // Получаем данные из storage
      const result = await chrome.storage.local.get(['userCount', 'sessionStartTime', 'currentStreamer', 'usersList', 'sessionActive', 'botsList']);
      
      if (result.userCount) {
        this.userCount = result.userCount;
        this.updateUserCount();
      }

      if (result.currentStreamer) {
        this.currentStreamer = result.currentStreamer;
        this.updateStreamerInfo();
      }

      if (result.usersList) {
        this.usersList = result.usersList;
        this.updateUsersList();
      }

      if (result.botsList) {
        this.botsList = result.botsList;
        this.updateBotsList();
      }

      this.sessionActive = result.sessionActive || false;
      
      if (result.sessionStartTime && this.sessionActive) {
        this.sessionStartTime = new Date(result.sessionStartTime);
      } else {
        this.sessionStartTime = null;
      }

      this.updateSessionTime();
    } catch (error) {
      console.error('Ошибка загрузки данных:', error);
    }
  }

  async checkCurrentTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (tab && tab.url && tab.url.includes('twitch.tv')) {
        this.currentTabId = tab.id;
        this.updateStatus('Активен', 'active');
        
        // Запрашиваем данные у content script
        try {
          const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_COUNT' });
          if (response) {
            this.userCount = response.count;
            this.isActive = response.isActive;
            this.isEnabled = response.isEnabled;
            this.currentStreamer = response.streamer;
            this.usersList = response.usersList || [];
            this.botsList = response.botsList || [];
            
            this.updateUserCount();
            this.updateStreamerInfo();
            this.updateUsersList();
            this.updateBotsList();
            this.updateToggleState();
            this.updateStatus(this.getStatusText(), this.getStatusClass());
          }
        } catch (error) {
          // Content script может быть не загружен
          this.updateStatus('Ожидание загрузки', 'inactive');
        }
      } else {
        this.updateStatus('Не на Twitch', 'inactive');
      }

      // Загружаем список всех вкладок Twitch
      await this.loadAllTabs();
      
    } catch (error) {
      console.error('Ошибка проверки вкладки:', error);
      this.updateStatus('Ошибка', 'error');
    }
  }

  updateUserCount() {
    const countElement = document.getElementById('userCount');
    countElement.textContent = this.userCount.toLocaleString();
    
    // Обновляем глобальный счетчик
    this.updateGlobalUserCount();
  }

  updateGlobalUserCount() {
    const globalCountElement = document.getElementById('globalUserCount');
    if (globalCountElement) {
      globalCountElement.textContent = this.globalUserCount.toLocaleString();
    }
  }

  updateStatus(text, status) {
    const statusText = document.querySelector('.status-text');
    const statusDot = document.querySelector('.status-dot');
    
    statusText.textContent = text;
    statusDot.className = `status-dot ${status}`;
  }

  updateStreamerInfo() {
    const streamElement = document.getElementById('currentStream');
    if (streamElement) {
      streamElement.textContent = this.currentStreamer || 'Не определен';
    }
  }

  updateToggleState() {
    const toggle = document.getElementById('monitoringToggle');
    if (toggle) {
      toggle.checked = this.isEnabled;
    }
  }

  getStatusText() {
    if (!this.isEnabled) return 'Выключен';
    if (this.isActive) return 'Мониторинг';
    return 'Ожидание';
  }

  getStatusClass() {
    if (!this.isEnabled) return 'inactive';
    if (this.isActive) return 'active';
    return 'inactive';
  }

  updateUsersList() {
    const usersListElement = document.getElementById('usersList');
    if (!usersListElement) return;

    if (this.usersList.length === 0) {
      usersListElement.innerHTML = '<div class="users-empty">Список пуст</div>';
      return;
    }

    // Сортируем пользователей по алфавиту
    const sortedUsers = [...this.usersList].sort();
    
    usersListElement.innerHTML = sortedUsers.map(username => 
      `<span class="user-tag" title="${username}">${username}</span>`
    ).join('');
  }

  async clearUsersList() {
    try {
      if (!this.currentTabId) {
        this.showNotification('Откройте стрим на Twitch', 'error');
        return;
      }
      
      // Отправляем команду сброса в content script
      await chrome.tabs.sendMessage(this.currentTabId, { type: 'RESET_COUNTER' });

      this.usersList = [];
      this.userCount = 0;

      this.updateUsersList();
      this.updateUserCount();
      this.showNotification('Список пользователей очищен');
    } catch (error) {
      console.error('Ошибка очистки списка:', error);
      this.showNotification('Ошибка очистки', 'error');
    }
  }

  exportUsersList() {
    if (this.usersList.length === 0) {
      this.showNotification('Список пуст', 'error');
      return;
    }

    try {
      const sortedUsers = [...this.usersList].sort();
      const exportText = sortedUsers.join('\n');
      
      // Создаем временный элемент для копирования
      const textArea = document.createElement('textarea');
      textArea.value = exportText;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      
      this.showNotification(`Список из ${sortedUsers.length} пользователей скопирован`);
    } catch (error) {
      console.error('Ошибка экспорта:', error);
      this.showNotification('Ошибка экспорта', 'error');
    }
  }

  async getBotsList() {
    try {
      if (!this.currentTabId) {
        this.showNotification('Откройте стрим на Twitch', 'error');
        return;
      }
      
      // Отправляем команду поиска ботов в content script
      await chrome.tabs.sendMessage(this.currentTabId, { type: 'GET_BOTS_LIST' });
      this.showNotification('Поиск ботов...', 'success');
    } catch (error) {
      console.error('Ошибка получения списка ботов:', error);
      this.showNotification('Ошибка получения списка ботов', 'error');
    }
  }

  updateBotsList() {
    const botsListElement = document.getElementById('botsList');
    if (!botsListElement) return;

    if (this.botsList.length === 0) {
      botsListElement.innerHTML = '<div class="bots-empty">Список пуст</div>';
      return;
    }

    // Сортируем ботов по алфавиту
    const sortedBots = [...this.botsList].sort();
    
    botsListElement.innerHTML = sortedBots.map(botName => 
      `<span class="bot-tag" title="${botName}">${botName}</span>`
    ).join('');
  }

  exportBotsList() {
    if (this.botsList.length === 0) {
      this.showNotification('Список ботов пуст', 'error');
      return;
    }

    try {
      const sortedBots = [...this.botsList].sort();
      const exportText = sortedBots.join('\n');
      
      // Создаем временный элемент для копирования
      const textArea = document.createElement('textarea');
      textArea.value = exportText;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      
      this.showNotification(`Список из ${sortedBots.length} ботов скопирован`);
    } catch (error) {
      console.error('Ошибка экспорта ботов:', error);
      this.showNotification('Ошибка экспорта ботов', 'error');
    }
  }

  updateSessionTime() {
    const sessionTimeElement = document.getElementById('sessionTime');
    if (!sessionTimeElement) return;

    if (!this.sessionStartTime || !this.sessionActive) {
      sessionTimeElement.textContent = '00:00:00';
      return;
    }

    const now = new Date();
    const diff = now - this.sessionStartTime;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    sessionTimeElement.textContent = timeString;
  }

  startSessionTimer() {
    this.sessionTimer = setInterval(() => {
      this.updateSessionTime();
    }, 1000);
  }


  async toggleMonitoring(enabled) {
    try {
      if (!this.currentTabId) {
        this.showNotification('Откройте стрим на Twitch', 'error');
        this.updateToggleState();
        return;
      }
      
      if (enabled) {
        await chrome.tabs.sendMessage(this.currentTabId, { type: 'ENABLE_MONITORING' });
        this.showNotification('Мониторинг включен');
      } else {
        await chrome.tabs.sendMessage(this.currentTabId, { type: 'DISABLE_MONITORING' });
        this.showNotification('Мониторинг выключен');
      }
      
      // Обновляем состояние
      setTimeout(async () => {
        await this.checkCurrentTab();
      }, 500);
    } catch (error) {
      console.error('Ошибка переключения мониторинга:', error);
      this.showNotification('Ошибка переключения', 'error');
      // Возвращаем переключатель в исходное состояние
      this.updateToggleState();
    }
  }

  async refreshData() {
    try {
      if (!this.currentTabId) {
        this.showNotification('Откройте стрим на Twitch', 'error');
        return;
      }
      
      // Проверяем, включен ли мониторинг
      if (!this.isEnabled) {
        this.showNotification('Включите мониторинг чата для анализа', 'error');
        return;
      }
      
      // Отправляем команду перезапуска мониторинга в content script
      await chrome.tabs.sendMessage(this.currentTabId, { type: 'RESTART_MONITORING' });
      
      // Сбрасываем локальные данные
      this.userCount = 0;
      this.sessionStartTime = new Date();
      
      this.updateUserCount();
      this.updateSessionTime();
      this.updateStatus('Анализ истории...', 'inactive');
      
      // Ждем немного и проверяем статус несколько раз
      setTimeout(async () => {
        await this.checkCurrentTab();
        this.updateStatus('Мониторинг...', 'active');
      }, 2000);
      
      setTimeout(async () => {
        await this.checkCurrentTab();
      }, 5000);
      
      this.showNotification('Анализ чата перезапущен');
    } catch (error) {
      console.error('Ошибка обновления:', error);
      this.showNotification('Ошибка обновления', 'error');
    }
  }

  showNotification(message, type = 'success') {
    // Создаем временное уведомление
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.remove();
    }, 2000);
  }

  async loadAllTabs() {
    try {
      console.log('Popup: Начинаем загрузку вкладок Twitch');
      
      // Получаем все вкладки Twitch
      const tabs = await chrome.tabs.query({ url: 'https://www.twitch.tv/*' });
      this.allTabs = tabs;
      console.log('Popup: Найдено вкладок Twitch:', tabs.length);
      if (tabs.length > 0) {
        console.log('Popup: Вкладки Twitch:', tabs.map(t => ({ id: t.id, title: t.title, url: t.url })));
      }

      // Получаем статистику всех вкладок
      console.log('Popup: Запрашиваем статистику вкладок');
      const response = await chrome.runtime.sendMessage({ type: 'GET_ALL_TABS_STATS' });
      if (response && !response.error) {
        console.log('Popup: Получена статистика вкладок:', response);
        this.allTabsStats = response;
        this.globalUserCount = response.global.userCount;
        this.updateGlobalUserCount();
        this.updateTabsList();
        this.updateGlobalStatsVisibility();
      } else {
        console.log('Popup: Ошибка получения статистики вкладок:', response);
        // Все равно обновляем список табов, даже если нет статистики
        this.updateTabsList();
      }
    } catch (error) {
      console.error('Ошибка загрузки вкладок:', error);
      // Все равно обновляем список табов при ошибке
      this.updateTabsList();
    }
  }

  updateTabsList() {
    const tabsSection = document.getElementById('tabsSection');
    const tabsList = document.getElementById('tabsList');
    
    console.log('Popup: updateTabsList вызван, количество вкладок:', this.allTabs.length);
    
    // Показываем секцию табов если есть хотя бы одна вкладка Twitch
    if (this.allTabs.length === 0) {
      console.log('Popup: Скрываем секцию табов - нет вкладок');
      tabsSection.style.display = 'none';
      return;
    }

    console.log('Popup: Показываем секцию табов');
    tabsSection.style.display = 'block';

    console.log('Popup: Создаем HTML для табов, количество:', this.allTabs.length);
    tabsList.innerHTML = this.allTabs.map(tab => {
      const stats = this.allTabsStats.tabs?.find(t => t.tabId === tab.id) || {};
      const isActive = tab.id === this.currentTabId;
      
      return `
        <div class="tab-item ${isActive ? 'active' : ''}" data-tab-id="${tab.id}">
          <div class="tab-info">
            <div class="tab-title" title="${tab.title}">${this.getTabTitle(tab.title)}</div>
            <div class="tab-url" title="${tab.url}">${this.getTabUrl(tab.url)}</div>
          </div>
          <div class="tab-stats">
            <div class="tab-count">${stats.userCount || 0}</div>
            <div class="tab-status ${stats.sessionActive ? 'active' : ''}">
              ${stats.sessionActive ? 'Активен' : 'Неактивен'}
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Добавляем обработчики кликов
    tabsList.querySelectorAll('.tab-item').forEach(item => {
      item.addEventListener('click', () => {
        const tabId = parseInt(item.dataset.tabId);
        this.switchToTab(tabId);
      });
    });
    
    console.log('Popup: updateTabsList завершен, создано элементов табов:', tabsList.querySelectorAll('.tab-item').length);
  }

  getTabTitle(title) {
    if (!title) return 'Без названия';
    if (title.length > 30) {
      return title.substring(0, 30) + '...';
    }
    return title;
  }

  getTabUrl(url) {
    if (!url) return '';
    try {
      const urlObj = new URL(url);
      return urlObj.pathname;
    } catch {
      return url;
    }
  }

  async switchToTab(tabId) {
    try {
      await chrome.tabs.update(tabId, { active: true });
      await chrome.windows.update((await chrome.tabs.get(tabId)).windowId, { focused: true });
      
      // Обновляем данные после переключения
      setTimeout(() => {
        this.checkCurrentTab();
      }, 500);
    } catch (error) {
      console.error('Ошибка переключения на вкладку:', error);
      this.showNotification('Ошибка переключения на вкладку', 'error');
    }
  }

  async refreshTabsList() {
    await this.loadAllTabs();
    this.showNotification('Список вкладок обновлен');
  }

  updateGlobalStatsVisibility() {
    const globalStatsCard = document.getElementById('globalStatsCard');
    if (this.allTabs.length > 1) {
      globalStatsCard.style.display = 'block';
    } else {
      globalStatsCard.style.display = 'none';
    }
  }

  destroy() {
    if (this.sessionTimer) {
      clearInterval(this.sessionTimer);
    }
  }
}

// Инициализируем popup при загрузке
document.addEventListener('DOMContentLoaded', () => {
  const popup = new PopupController();
  window.popupController = popup; // Делаем доступным глобально
  
  // Очищаем при закрытии popup
  window.addEventListener('beforeunload', () => {
    popup.destroy();
  });
});

// Слушаем сообщения от background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const popup = window.popupController;
  if (!popup) return;

  if (request.type === 'COUNT_UPDATE') {
    // Обновляем только если это текущая вкладка
    if (request.tabId === popup.currentTabId) {
      const countElement = document.getElementById('userCount');
      if (countElement) {
        countElement.textContent = request.count.toLocaleString();
      }
      
      // Обновляем список пользователей
      if (request.usersList) {
        popup.usersList = request.usersList;
        popup.updateUsersList();
        
        // Подсвечиваем нового пользователя
        if (request.isNewUser && request.username) {
          const userTag = document.querySelector(`[title="${request.username}"]`);
          if (userTag) {
            userTag.classList.add('new');
            setTimeout(() => {
              userTag.classList.remove('new');
            }, 2000);
          }
        }
      }
    }
    
    // Обновляем список вкладок
    popup.loadAllTabs();
    
  } else if (request.type === 'STREAMER_UPDATE') {
    // Обновляем только если это текущая вкладка
    if (request.tabId === popup.currentTabId) {
      const streamElement = document.getElementById('currentStream');
      if (streamElement && request.streamer) {
        streamElement.textContent = request.streamer;
      }
    }
  } else if (request.type === 'COUNTER_RESET') {
    // Обновляем только если это текущая вкладка
    if (request.tabId === popup.currentTabId) {
      popup.usersList = [];
      popup.updateUsersList();
    }
    
    // Обновляем список вкладок
    popup.loadAllTabs();
    
  } else if (request.type === 'PAGE_CHANGE_CLEAR') {
    // Обновляем только если это текущая вкладка
    if (request.tabId === popup.currentTabId) {
      popup.userCount = 0;
      popup.usersList = [];
      // Обновляем список ботов если он был передан
      if (request.botsList) {
        popup.botsList = request.botsList;
        popup.updateBotsList();
      }
      popup.sessionStartTime = null;
      popup.sessionActive = false;
      
      popup.updateUserCount();
      popup.updateUsersList();
      popup.updateSessionTime();
    }
    
    // Обновляем список вкладок
    popup.loadAllTabs();
    
  } else if (request.type === 'SESSION_START') {
    // Обновляем только если это текущая вкладка
    if (request.tabId === popup.currentTabId && request.sessionStartTime) {
      popup.sessionStartTime = new Date(request.sessionStartTime);
      popup.sessionActive = true;
      popup.updateSessionTime();
    }
    
    // Обновляем список вкладок
    popup.loadAllTabs();
    
  } else if (request.type === 'SESSION_STOP') {
    // Обновляем только если это текущая вкладка
    if (request.tabId === popup.currentTabId) {
      popup.sessionActive = false;
      popup.updateSessionTime();
    }
    
    // Обновляем список вкладок
    popup.loadAllTabs();
    
  } else if (request.type === 'SESSION_RESTART') {
    // Обновляем только если это текущая вкладка
    if (request.tabId === popup.currentTabId && request.sessionStartTime) {
      popup.sessionStartTime = new Date(request.sessionStartTime);
      popup.sessionActive = true;
      popup.updateSessionTime();
    }
    
    // Обновляем список вкладок
    popup.loadAllTabs();
    
  } else if (request.type === 'BOTS_LIST_UPDATE') {
    // Обновляем только если это текущая вкладка
    if (request.tabId === popup.currentTabId && request.botsList) {
      popup.botsList = request.botsList;
      popup.updateBotsList();
      
      // НЕ сохраняем список ботов в глобальный storage - он должен быть уникальным для каждой вкладки
      
      popup.showNotification(`Найдено ${request.botsList.length} ботов`);
    }
  }
});
