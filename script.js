(() => {
  const VALID_EMAIL = 'isubrat@icloud.com';
  const VALID_PASSWORD = 'subrat@1234';
  const STORAGE_KEY = 'smsSyncCredentials';

  const loginView = document.getElementById('loginView');
  const inboxView = document.getElementById('inboxView');
  const loginForm = document.getElementById('loginForm');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const rememberCheckbox = document.getElementById('remember');
  const userEmailDisplay = document.getElementById('userEmail');
  const feedback = document.getElementById('feedback');
  const logoutButton = document.getElementById('logoutButton');
  const chatThread = document.getElementById('chatThread');
  const messageForm = document.getElementById('messageForm');
  const messageInput = document.getElementById('messageInput');

  let toastTimeout;

  const storedCredentials = getStoredCredentials();
  if (storedCredentials) {
    emailInput.value = storedCredentials.email;
    passwordInput.value = storedCredentials.password;
    rememberCheckbox.checked = true;
    showInbox(storedCredentials.email, true);
  } else {
    window.setTimeout(() => emailInput.focus(), 150);
  }

  loginForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (authenticate(email, password)) {
      if (rememberCheckbox.checked) {
        setStoredCredentials({ email, password });
      } else {
        clearStoredCredentials();
      }
      showInbox(email, false);
    } else {
      showToast('Incorrect email or password. Try again.', 'error');
      triggerShake();
    }
  });

  logoutButton.addEventListener('click', () => {
    clearStoredCredentials();
    passwordInput.value = '';
    rememberCheckbox.checked = false;
    showLogin();
    showToast('You have been logged out safely.', 'info');
  });

  if (messageForm) {
    messageForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const text = messageInput.value.trim();
      if (!text) return;

      appendMessage(text, 'outgoing');
      messageInput.value = '';
      messageInput.focus();

      setTimeout(() => {
        appendMessage('Received loud and clear! We will take it from here.', 'incoming');
      }, 900);
    });
  }

  function authenticate(email, password) {
    return email === VALID_EMAIL && password === VALID_PASSWORD;
  }

  function showInbox(email, isAutoLogin) {
    loginView.classList.remove('active');
    loginView.setAttribute('aria-hidden', 'true');
    inboxView.classList.add('active');
    inboxView.setAttribute('aria-hidden', 'false');
    userEmailDisplay.textContent = email;
    if (messageInput) {
      messageInput.focus();
    }

    const message = isAutoLogin
      ? 'Welcome back! You were signed in automatically.'
      : 'Login successful. Conversations synced.';
    showToast(message, 'success');
  }

  function showLogin() {
    inboxView.classList.remove('active');
    inboxView.setAttribute('aria-hidden', 'true');
    loginView.classList.add('active');
    loginView.setAttribute('aria-hidden', 'false');
    emailInput.focus();
  }

  function triggerShake() {
    loginForm.classList.remove('shake');
    // Force reflow so the animation can restart
    void loginForm.offsetWidth;
    loginForm.classList.add('shake');
  }

  function showToast(message, type) {
    feedback.textContent = message;
    feedback.dataset.type = type;
    feedback.classList.add('visible');

    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      feedback.classList.remove('visible');
    }, 4000);
  }

  function appendMessage(text, variant) {
    if (!chatThread) return;
    const bubble = document.createElement('div');
    bubble.className = `bubble bubble--${variant}`;

    const paragraph = document.createElement('p');
    paragraph.innerHTML = escapeHtml(text);

    const time = document.createElement('time');
    time.textContent = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });

    bubble.append(paragraph, time);
    chatThread.appendChild(bubble);
    chatThread.scrollTop = chatThread.scrollHeight;
  }

  function escapeHtml(str) {
    const temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML;
  }

  function setStoredCredentials(credentials) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(credentials));
  }

  function getStoredCredentials() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (
        parsed &&
        typeof parsed.email === 'string' &&
        typeof parsed.password === 'string'
      ) {
        if (authenticate(parsed.email, parsed.password)) {
          return parsed;
        }
      }
      return null;
    } catch (error) {
      console.error('Unable to access stored credentials', error);
      return null;
    }
  }

  function clearStoredCredentials() {
    localStorage.removeItem(STORAGE_KEY);
  }
})();
