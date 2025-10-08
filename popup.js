// Twitch Chat Counter - Popup Script
class PopupController {
  constructor() {
    this.userCount = 0;
    this.isActive = false;
    this.isEnabled = false;
    this.currentStreamer = null;
    this.usersList = [];
    this.sessionStartTime = null;
    this.sessionTimer = null;
    this.init();
  }

  init() {
    this.bindEvents();
    this.loadData();
    this.startSessionTimer();
    this.checkCurrentTab();
  }

  bindEvents() {
    document.getElementById('resetButton').addEventListener('click', () => {
      this.resetCounter();
    });

    document.getElementById('refreshButton').addEventListener('click', () => {
      this.refreshData();
    });

    document.getElementById('monitoringToggle').addEventListener('change', (e) => {
      this.toggleMonitoring(e.target.checked);
    });

    document.getElementById('clearUsersButton').addEventListener('click', () => {
      this.clearUsersList();
    });

    document.getElementById('exportUsersButton').addEventListener('click', () => {
      this.exportUsersList();
    });
  }

  async loadData() {
    try {
      // Получаем данные из storage
      const result = await chrome.storage.local.get(['userCount', 'sessionStartTime', 'currentStreamer', 'usersList']);
      
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

      if (result.sessionStartTime) {
        this.sessionStartTime = new Date(result.sessionStartTime);
      } else {
        this.sessionStartTime = new Date();
        await chrome.storage.local.set({ sessionStartTime: this.sessionStartTime.toISOString() });
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
            
            this.updateUserCount();
            this.updateStreamerInfo();
            this.updateUsersList();
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
    } catch (error) {
      console.error('Ошибка проверки вкладки:', error);
      this.updateStatus('Ошибка', 'error');
    }
  }

  updateUserCount() {
    const countElement = document.getElementById('userCount');
    countElement.textContent = this.userCount.toLocaleString();
    
    // Сохраняем в storage
    chrome.storage.local.set({ userCount: this.userCount });
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
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (tab && tab.url && tab.url.includes('twitch.tv')) {
        // Отправляем команду сброса в content script
        await chrome.tabs.sendMessage(tab.id, { type: 'RESET_COUNTER' });
      }

      this.usersList = [];
      this.userCount = 0;
      
      await chrome.storage.local.set({ 
        usersList: [],
        userCount: 0
      });

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

  updateSessionTime() {
    if (!this.sessionStartTime) return;

    const now = new Date();
    const diff = now - this.sessionStartTime;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    document.getElementById('sessionTime').textContent = timeString;
  }

  startSessionTimer() {
    this.sessionTimer = setInterval(() => {
      this.updateSessionTime();
    }, 1000);
  }

  async resetCounter() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (tab && tab.url && tab.url.includes('twitch.tv')) {
        // Отправляем команду сброса в content script
        await chrome.tabs.sendMessage(tab.id, { type: 'RESET_COUNTER' });
      }

      this.userCount = 0;
      this.sessionStartTime = new Date();
      
      await chrome.storage.local.set({ 
        userCount: 0,
        sessionStartTime: this.sessionStartTime.toISOString()
      });

      this.updateUserCount();
      this.updateSessionTime();
      
      // Показываем уведомление
      this.showNotification('Счетчик сброшен');
    } catch (error) {
      console.error('Ошибка сброса счетчика:', error);
      this.showNotification('Ошибка сброса', 'error');
    }
  }

  async toggleMonitoring(enabled) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (tab && tab.url && tab.url.includes('twitch.tv')) {
        if (enabled) {
          await chrome.tabs.sendMessage(tab.id, { type: 'ENABLE_MONITORING' });
          this.showNotification('Мониторинг включен');
        } else {
          await chrome.tabs.sendMessage(tab.id, { type: 'DISABLE_MONITORING' });
          this.showNotification('Мониторинг выключен');
        }
        
        // Обновляем состояние
        setTimeout(async () => {
          await this.checkCurrentTab();
        }, 500);
      } else {
        this.showNotification('Откройте стрим на Twitch', 'error');
        // Возвращаем переключатель в исходное состояние
        this.updateToggleState();
      }
    } catch (error) {
      console.error('Ошибка переключения мониторинга:', error);
      this.showNotification('Ошибка переключения', 'error');
      // Возвращаем переключатель в исходное состояние
      this.updateToggleState();
    }
  }

  async refreshData() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (tab && tab.url && tab.url.includes('twitch.tv')) {
        // Отправляем команду перезапуска мониторинга в content script
        await chrome.tabs.sendMessage(tab.id, { type: 'RESTART_MONITORING' });
        
        // Сбрасываем локальные данные
        this.userCount = 0;
        this.sessionStartTime = new Date();
        
        await chrome.storage.local.set({ 
          userCount: 0,
          sessionStartTime: this.sessionStartTime.toISOString()
        });
        
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
      } else {
        this.showNotification('Откройте стрим на Twitch', 'error');
      }
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
  if (request.type === 'COUNT_UPDATE') {
    const countElement = document.getElementById('userCount');
    if (countElement) {
      countElement.textContent = request.count.toLocaleString();
    }
    
    // Обновляем список пользователей
    if (request.usersList) {
      const popup = window.popupController;
      if (popup) {
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
  } else if (request.type === 'STREAMER_UPDATE') {
    const streamElement = document.getElementById('currentStream');
    if (streamElement && request.streamer) {
      streamElement.textContent = request.streamer;
    }
  } else if (request.type === 'COUNTER_RESET') {
    const popup = window.popupController;
    if (popup) {
      popup.usersList = [];
      popup.updateUsersList();
    }
  }
});
