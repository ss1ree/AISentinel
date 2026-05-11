import React, { useState, useEffect } from 'react';
import axios from 'axios';
import html2pdf from 'html2pdf.js';
import { 
  Search, History, ShieldCheck, AlertTriangle, Send, Activity, Eye, EyeOff,
  FileUp, FileText, LayoutDashboard, LogOut, User as UserIcon, Lock, Mail, Trash2,
  Settings, CheckCircle2, RotateCcw, HelpCircle, Printer, Users, UserX, ServerCrash,
  ChevronDown, ChevronUp, Database, ArrowUpDown
} from 'lucide-react';

// Настройка Axios для автоматической отправки куки
// axios.defaults.withCredentials = true;

axios.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => Promise.reject(error));

function App() {
  const [settings, setSettings] = useState({
    font_name: 'Times New Roman',
    font_size: 12,
    margin_left: 2.0,
    margin_right: 2.0,
    margin_top: 2.5,
    margin_bottom: 2.5,
    min_references: 3,
    check_translation: true,
    check_abstract: true,
    check_expert: true
  });
  const [initializing, setInitializing] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [activeTab, setActiveTab] = useState('analyzer');
  const [text, setText] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [statusMsg, setStatusMsg] = useState({ text: '', type: '' });
  const [feedbackSent, setFeedbackSent] = useState(false);
  const[isFeedbackLoading, setIsFeedbackLoading] = useState(false);
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminSearch, setAdminSearch] = useState('');
  const [adminSort, setAdminSort] = useState({ key: 'id', direction: 'asc' });
  const [showAllAdminUsers, setShowAllAdminUsers] = useState(false);

  // Состояния авторизации
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const[showCookieWarning, setShowCookieWarning] = useState(
    localStorage.getItem('hideCookieWarning') !== 'true'
  );

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

  // 1. Проверка текущей сессии при загрузке
  useEffect(() => {
    const checkSession = async () => {
      try {
        // Мы используем axios.interceptors, поэтому заголовок Authorization 
        // подставится автоматически, если в localStorage есть токен
        const res = await axios.get(`${API_URL}/me`);
        
        if (res.data && res.data.email) {
          setUser(res.data);
          await fetchSettings();
          await fetchHistory();
          if (res.data.role === 'admin') {
            fetchAdminUsers();
          }
        }
      } catch (err) {
        console.log("Сессия не найдена или истекла");
        setUser(null);
      } finally {
        setInitializing(false);
      }
    };
    checkSession();
  },[]);

  useEffect(() => {
    if (activeTab === 'admin' && user?.role === 'admin') {
      fetchAdminUsers();
    }
  }, [activeTab]);

  const handleDismissCookieWarning = (permanent = false) => {
    if (permanent) {
      localStorage.setItem('hideCookieWarning', 'true');
    }
    setShowCookieWarning(false);
  };

  const fetchAdminUsers = async () => {
    try {
      const res = await axios.get(`${API_URL}/admin/users`);
      setAdminUsers(res.data);
    } catch (e) { console.error("Ошибка загрузки пользователей", e); }
  };

  const adminClearUserHistory = async (id) => {
    if (!window.confirm("Удалить ВСЮ историю сканов этого пользователя?")) return;
    try {
      const BASE_URL = import.meta.env.VITE_API_URL || 'https://aisentinel-production-7cb5.up.railway.app';
      await axios.delete(`${BASE_URL}/admin/users/${id}/history`);
      fetchAdminUsers(); // Обновляем цифры в таблице
    } catch (e) { alert("Ошибка очистки истории"); }
  };

  const toggleSort = (key) => {
    setAdminSort(prev => ({
      key: key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };


  const toggleTool = async (key) => {
    // 1. Сначала обновляем локальный стейт (чтобы кнопка нажалась мгновенно)
    const updatedSettings = { ...settings, [key]: !settings[key] };
    setSettings(updatedSettings);
    
    // 2. Сразу отправляем на сервер для сохранения в БД
    try {
      await axios.post(`${API_URL}/settings`, updatedSettings);
    } catch (e) {
      console.error("Ошибка сохранения тумблера:", e);
    }
  };

  const sendFeedback = async (resultId, isCorrect) => {
    setIsFeedbackLoading(true); // <-- Включаем крутилку
    try {
      await axios.post(`${API_URL}/feedback/${resultId}?correct=${isCorrect}`);
      setFeedbackSent(true); 
    } catch (error) {
      console.error("Ошибка при отправке фидбека:", error);
      alert("Не удалось отправить отзыв. Проверьте подключение.");
    } finally {
      setIsFeedbackLoading(false); // <-- Выключаем крутилку
    }
  };

  const checkUser = async () => {
    try {
      const res = await axios.get(`${API_URL}/me`);
      if (!res.data.error) {
        setUser(res.data);
        fetchHistory();
      }
    } catch (e) { setUser(null); }
  };

  const fetchHistory = async () => {
    try {
      const res = await axios.get(`${API_URL}/history`);
      setHistory(Array.isArray(res.data) ? res.data.reverse() : []);
    } catch (e) { console.error(e); }
  };

  // 2. Логика входа / Регистрации
  const handleAuth = async (e) => {
    e.preventDefault();
    const url = authMode === 'login' ? 'login' : 'register';
    
    try {
      const res = await axios.post(`${API_URL}/${url}?email=${email}&password=${password}`);
      
      if (res.data.error) {
        alert(res.data.error);
        return;
      }

      if (authMode === 'login') {
        // Сохраняем токен в localStorage
        if (res.data.access_token) {
          localStorage.setItem('token', res.data.access_token);
        }
        
        // Устанавливаем пользователя
        setUser(res.data);
        
        // Подгружаем данные
        await fetchSettings();
        await fetchHistory();
        
        if (res.data.role === 'admin') {
          fetchAdminUsers();
        }
      } else {
        alert("Регистрация успешна! Теперь войдите.");
        setAuthMode('login');
      }
    } catch (err) { 
      console.error(err);
      alert("Ошибка авторизации или сервер недоступен"); 
    }
  };

  const handleLogout = async () => {
    localStorage.removeItem('token');
    setUser(null);
    setHistory([]);
    setResult(null);
    setText('');
  };

  // 3. Логика анализа
  const handleAnalyze = async () => {
    setResult(null);
    setFeedbackSent(false);
    if (!text || text.length < 10) return;
    setLoading(true);
    try {
      const response = await axios.post(`${API_URL}/analyze?text=${encodeURIComponent(text)}`);
      setResult(response.data);
      fetchHistory();
    } catch (error) { alert("Ошибка анализа"); }
    setLoading(false);
  };

  const handleFileUpload = async (event) => {
    setResult(null);
    setFeedbackSent(false);
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    setLoading(true);

    try {
      const response = await axios.post(`${API_URL}/analyze-file`, formData);
      setResult(response.data);
      setText(response.data.text_content || "");
      fetchHistory();
    } catch (error) {
      console.error("Ошибка файла:", error);
    } finally {
      setLoading(false);
      event.target.value = ''; 
    }
  };

  const downloadPDF = () => {
    // 1. Создаем виртуальный элемент для PDF
    const element = document.createElement('div');
    
    // 2. Собираем блок с ошибками нормоконтроля (если они есть)
    let formatInfo = '';
    if (result.format_errors && result.format_errors.length > 0) {
      const errs = result.format_errors.map(e => `<li style="margin-bottom: 5px;">${e}</li>`).join('');
      formatInfo = `
        <div style="background-color: #fef2f2; border-left: 6px solid #ef4444; padding: 15px; margin-bottom: 20px;">
          <h3 style="margin: 0 0 10px 0; color: #991b1b; font-family: sans-serif; font-size: 16px;">Найдены ошибки нормоконтроля:</h3>
          <ul style="margin: 0; color: #7f1d1d; font-family: sans-serif; font-size: 14px; padding-left: 20px;">
            ${errs}
          </ul>
        </div>
      `;
    } else if (result.filename?.toLowerCase().match(/\.(docx|rtf)$/)) {
      formatInfo = `
        <div style="background-color: #f0fdf4; border-left: 6px solid #22c55e; padding: 15px; margin-bottom: 20px;">
          <h3 style="margin: 0; color: #166534; font-family: sans-serif; font-size: 16px;">Нормоконтроль АПАК: Пройден успешно</h3>
        </div>
      `;
    }

    // 3. Формируем полную структуру документа
    element.innerHTML = `
      <div style="padding: 20px; color: #1e293b;">
        <!-- Шапка отчета -->
        <div style="border-bottom: 2px solid #e2e8f0; padding-bottom: 15px; margin-bottom: 20px; font-family: sans-serif;">
          <h1 style="color: #2563eb; margin: 0 0 10px 0; font-size: 24px; text-transform: uppercase;">Отчет верификации AI Sentinel</h1>
          <p style="margin: 0; color: #64748b; font-size: 14px;"><b>Аккаунт:</b> ${user?.email} | <b>Дата:</b> ${new Date().toLocaleString('ru-RU')}</p>
          <p style="margin: 5px 0 0 0; color: #64748b; font-size: 14px;"><b>Документ:</b> ${result.filename || 'Введенный текст'}</p>
        </div>
        
        <!-- Вердикт ИИ -->
        <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #e2e8f0; font-family: sans-serif;">
          <h2 style="margin: 0; font-size: 18px; color: ${result.label === 'AI' ? '#ef4444' : '#22c55e'}">
            ВЕРИФИКАЦИЯ АВТОРСТВА: ${result.label === 'AI' ? 'МАШИННАЯ ГЕНЕРАЦИЯ' : 'НАПИСАНО ЧЕЛОВЕКОМ'} (${(result.score * 100).toFixed(1)}%)
          </h2>
        </div>
        
        ${formatInfo}
        
        <!-- Проверенный текст -->
        <h3 style="margin-top: 30px; margin-bottom: 15px; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; font-family: sans-serif; font-size: 16px;">
          Проверенный текст:
        </h3>
        
        <div style="font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.5; text-align: justify;">
          ${result.html_content || `<p style="white-space: pre-wrap;">${text}</p>`}
        </div>
      </div>
    `;

    // 4. Настройки для PDF
    const opt = {
      margin:       10, // Отступы страниц
      filename:     result.filename ? `Отчет_${result.filename}.pdf` : 'Отчет_AI_Sentinel.pdf',
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true }, // Улучшает качество шрифтов
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' } // Разбивка на листы А4
    };

    // 5. Запуск скачивания
    html2pdf().set(opt).from(element).save();
  };

  // --- ЗАГРУЗКА НАСТРОЕК С СЕРВЕРА ---
  const fetchSettings = async () => {
    try {
      const res = await axios.get(`${API_URL}/settings`);
      if (res.data && !res.data.error) {
        setSettings(res.data);
      }
    } catch (e) {
      console.error("Ошибка загрузки настроек:", e);
    }
  };

  // --- СОХРАНЕНИЕ НАСТРОЕК ---
  const showStatus = (text, type = 'success') => {
    setStatusMsg({ text, type });
    setTimeout(() => setStatusMsg({ text: '', type: '' }), 3000);
  };

  const saveSettings = async () => {
    try {
      await axios.post(`${API_URL}/settings`, settings);
      showStatus("Настройки успешно сохранены");
    } catch (e) {
      showStatus("Ошибка при сохранении", "error");
    }
  };

  const resetSettings = async () => {
    try {
      const res = await axios.post(`${API_URL}/settings/reset`);
      setSettings(res.data);
      showStatus("Параметры сброшены до АПАК");
    } catch (e) {
      showStatus("Ошибка при сбросе", "error");
    }
  };

  const deleteHistoryItem = async (id) => {
    try {
      // Используйте ваш API_URL, если он у вас настроен через переменные
      await axios.delete(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/history/${id}`);
    } catch (e) { 
      // Если сервер ответил 404, значит запись УЖЕ удалена (например, двойным кликом). 
      // Просто игнорируем эту ошибку, чтобы не засорять консоль.
      if (e.response && e.response.status === 404) {
        console.log(`Скан #${id} уже был удален из базы.`);
      } else {
        console.error("Ошибка при удалении:", e); 
      }
    } finally {
      // Обновляем историю в любом случае (даже если была ошибка)
      fetchHistory();
    }
  };

  const deleteAllHistory = async () => {
    if (!window.confirm("Вы уверены, что хотите удалить ВСЮ свою историю?")) return;
    try {
      // Явно берем URL из переменной окружения
      const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      await axios.delete(`${BASE_URL}/history/all`);
      setHistory([]); // Мгновенно очищаем локально
      setResult(null);
    } catch (e) { 
      console.error("Ошибка очистки:", e); 
      alert("Не удалось очистить историю");
    }
  };

  const adminDeleteUser = async (id) => {
    if (!window.confirm("Удалить пользователя и все его данные?")) return;
    try {
      await axios.delete(`${API_URL}/admin/users/${id}`);
      fetchAdminUsers();
    } catch (e) { alert("Ошибка удаления"); }
  };

  const adminWipeAllHistory = async () => {
    if (!window.confirm("ВНИМАНИЕ! Это удалит историю ВСЕХ пользователей. Продолжить?")) return;
    try {
      const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      await axios.delete(`${BASE_URL}/admin/history/wipe-all`);
      fetchAdminUsers(); // Обновляем цифры в таблице
      alert("Глобальная база очищена.");
    } catch (e) { 
      alert("Ошибка доступа или сервера"); 
    }
  };

  // --- ЭКРАН ЗАГРУЗКИ (чтобы не мелькал логин) ---
if (initializing) {
    return (
      <div className="fixed inset-0 z-[100] bg-slate-950 flex flex-col items-center justify-center overflow-hidden">
        {/* Фоновое свечение для атмосферности */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[120px]"></div>
        
        <div className="relative z-10 flex flex-col items-center">
          {/* Анимированный логотип */}
          <div className="relative mb-8">
            <ShieldCheck className="text-blue-500 animate-pulse" size={100} strokeWidth={1.5} />
            <div className="absolute inset-0 bg-blue-500 blur-2xl opacity-20 animate-pulse"></div>
          </div>

          {/* Текстовая часть */}
          <div className="text-center">
            <h2 className="text-white text-3xl font-black tracking-[0.3em] uppercase mb-4">
              AI <span className="text-blue-500">Sentinel</span>
            </h2>
            
            {/* Индикатор загрузки (три точки) */}
            <div className="flex justify-center gap-2">
              <div className="w-3 h-3 bg-blue-600 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
              <div className="w-3 h-3 bg-blue-600 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
              <div className="w-3 h-3 bg-blue-600 rounded-full animate-bounce"></div>
            </div>
            
            <p className="mt-8 text-slate-500 text-xs font-bold uppercase tracking-[0.2em]">
              Инициализация защищенного соединения...
            </p>
          </div>
        </div>
      </div>
    );
  }

  // --- ЭКРАН АВТОРИЗАЦИИ ---
  if (!user) {
    return (
      <div className="h-screen w-full flex overflow-hidden bg-white">
        
        {/* ЛЕВАЯ ЧАСТЬ (Брендинг - 50% ширины) */}
        <div className="hidden lg:flex lg:w-1/2 bg-blue-600 p-20 flex-col justify-between text-white relative">
          <div className="relative z-10">
            <div className="flex items-center gap-4 mb-12">
              <ShieldCheck size={56} className="text-white" />
              <span className="text-4xl font-black tracking-tighter uppercase">AI Sentinel</span>
            </div>
            
            {/* ОБНОВЛЕННЫЙ ЗАГОЛОВОК */}
            <h2 className="text-[clamp(2.5rem,2vw,4.5rem)] font-black leading-[1.05] tracking-tight break-words">
              Комплексная система <br /> верификации <br /> и нормоконтроля
            </h2>
            
            {/* ОБНОВЛЕННОЕ ОПИСАНИЕ */}
            <p className="mt-10 text-blue-100 text-xl leading-relaxed max-w-xl font-medium">
              Автоматизированная среда анализа научных публикаций СибГУ им. М.Ф. Решетнева: от технического соответствия АПАК до детекции признаков генерации нейросетями.
            </p>
          </div>
          
          {/* Декоративные элементы */}
          <div className="absolute -bottom-20 -left-20 w-96 h-96 bg-blue-500 rounded-full opacity-50 blur-3xl"></div>
          <div className="absolute top-1/2 -right-20 w-64 h-64 bg-blue-400 rounded-full opacity-30 blur-3xl"></div>
        </div>

        {/* ПРАВАЯ ЧАСТЬ (Форма - 50% ширины) */}
        <div className="w-full lg:w-1/2 h-full flex flex-col justify-center items-center bg-white p-8">
          <div className="w-full max-w-md">
            
            <div className="lg:hidden flex justify-center mb-8">
              <ShieldCheck className="text-blue-600" size={56} />
            </div>
            
            <div className="mb-12 text-center lg:text-left">
              <h2 className="text-4xl font-black text-slate-800 tracking-tight mb-3">
                {authMode === 'login' ? 'С возвращением' : 'Регистрация'}
              </h2>
              <p className="text-slate-400 text-lg font-medium">
                {authMode === 'login' 
                  ? 'Войдите в свой аккаунт для начала работы' 
                  : 'Заполните данные для создания профиля'}
              </p>
            </div>

            <form onSubmit={handleAuth} className="space-y-6">
              <div className="relative">
                <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={24} />
                <input 
                  type="email" placeholder="Email адрес" required
                  className="w-full pl-14 pr-6 py-5 bg-slate-50 border-2 border-transparent focus:border-blue-500 focus:bg-white rounded-2xl transition-all outline-none text-lg text-slate-700 shadow-sm"
                  value={email} onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="relative">
                <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={24} />
                <input 
                  type={showPassword ? "text" : "password"} 
                  placeholder="Ваш пароль" 
                  required
                  className="w-full pl-14 pr-14 py-5 bg-slate-50 border-2 border-transparent focus:border-blue-500 focus:bg-white rounded-2xl transition-all outline-none text-lg text-slate-700 shadow-sm"
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)}
                />
                {/* Кнопка переключения видимости */}
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-600 cursor-pointer p-1 transition-colors"
                >
                  {showPassword ? <EyeOff size={24} /> : <Eye size={24} />}
                </button>
              </div>
              
              <button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-6 rounded-2xl shadow-xl shadow-blue-500/25 transition-all active:scale-[0.98] uppercase tracking-[2px] text-sm mt-4 cursor-pointer">
                {authMode === 'login' ? 'Войти в систему' : 'Зарегистрироваться'}
              </button>
            </form>

            <div className="mt-10 text-center">
              <button 
                type="button"
                onClick={() => setAuthMode(authMode === 'login' ? 'reg' : 'login')}
                className="text-blue-600 font-bold text-base hover:text-blue-800 cursor-pointer transition-colors p-2"
              >
                {authMode === 'login' ? 'Нет аккаунта? Создать' : 'Уже есть аккаунт? Войти'}
              </button>
            </div>
          </div>
        </div>

      </div>
    );
  }

  // --- ОСНОВНОЙ ИНТЕРФЕЙС ---
  return (
    <div className="flex h-screen bg-slate-50 font-sans">
      {/* SIDEBAR */}
      <aside className="w-72 bg-slate-900 text-white flex flex-col shadow-2xl">
        <div className="p-8 text-2xl font-black flex items-center gap-3 border-b border-slate-800">
          <ShieldCheck className="text-blue-400" size={32} />
          <span>AI <span className="text-blue-400">SENTINEL</span></span>
        </div>
        
        <nav className="flex-1 p-6 space-y-4">
          <button 
            onClick={() => setActiveTab('analyzer')}
            className={`flex items-center gap-3 w-full p-4 rounded-2xl text-left transition-all cursor-pointer ${
              activeTab === 'analyzer' ? 'bg-blue-600 text-white shadow-lg' : 'hover:bg-slate-800 text-slate-400'
            }`}
          >
            <LayoutDashboard size={20} /> Панель анализа
          </button>
          <button 
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-3 w-full p-4 rounded-2xl text-left transition-all cursor-pointer ${
              activeTab === 'history' ? 'bg-blue-600 text-white shadow-lg' : 'hover:bg-slate-800 text-slate-400'
            }`}
          >
            <History size={20} /> История сканов
          </button>
          <button 
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-3 w-full p-4 rounded-2xl text-left transition-all cursor-pointer ${
              activeTab === 'settings' ? 'bg-blue-600 text-white shadow-lg' : 'hover:bg-slate-800 text-slate-400'
            }`}
          >
            <Settings size={20} /> Настройки ГОСТ
          </button>
          {user?.role === 'admin' && (
            <button onClick={() => setActiveTab('admin')} className={`flex items-center gap-3 w-full p-4 mt-8 border border-amber-500/30 rounded-2xl text-left transition-all cursor-pointer ${activeTab === 'admin' ? 'bg-amber-600 text-white shadow-lg shadow-amber-900/50' : 'hover:bg-amber-900/30 text-amber-500'}`}>
              <Users size={20} /> Панель Админа
            </button>
          )}
        </nav>

        {/* ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ */}
        <div className="p-6 border-t border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-3 mb-4 px-2">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center border ${user?.role === 'admin' ? 'bg-amber-900/50 border-amber-500' : 'bg-slate-800 border-slate-700'}`}>
              <UserIcon size={20} className={user?.role === 'admin' ? 'text-amber-400' : 'text-blue-400'} />
            </div>
            <div className="overflow-hidden">
              <p className={`text-[10px] font-bold uppercase ${user?.role === 'admin' ? 'text-amber-500' : 'text-slate-500'}`}>
                {user?.role === 'admin' ? 'Администратор' : 'Аккаунт'}
              </p>
              <p className="text-xs font-bold truncate">{user?.email}</p>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="flex items-center cursor-pointer gap-2 w-full p-3 hover:bg-red-500/10 text-red-500 rounded-xl text-xs font-bold transition-all"
          >
            <LogOut size={16} /> Выйти из системы
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 overflow-y-auto p-12">
        <div className="max-w-6xl mx-auto">
          {/* --- ДИНАМИЧЕСКИЙ ЗАГОЛОВОК --- */}
          <header className="mb-12">
            <h1 className="text-5xl font-black text-slate-900 tracking-tight mb-3 transition-all">
              {activeTab === 'analyzer' ? 'Детектор и Верификатор' : 
              activeTab === 'history' ? 'История сканирований' : 'Параметры нормоконтроля'}
            </h1>
            <p className="text-slate-500 text-lg max-w-2xl font-medium">
              {activeTab === 'analyzer' 
                ? 'Комплексный анализ текста на признаки генерации ИИ и соответствие стандартам АПАК.' 
                : activeTab === 'history'
                ? 'Персональный архив проверенных документов и детализированных отчетов.'
                : 'Настройка технических требований к оформлению (шрифты, поля, библиография).'}
            </p>
          </header>

          {/* --- ВКЛАДКА 1: ПАНЕЛЬ АНАЛИЗА --- */}
          {activeTab === 'analyzer' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 animate-in fade-in duration-500">
              {/* Левая колонка: Редактор */}
              <div className="lg:col-span-8 space-y-6">
                <div className="bg-white rounded-[32px] shadow-sm border border-slate-200 overflow-hidden focus-within:ring-4 focus-within:ring-blue-100 transition-all">
                  <div className="flex gap-4 mb-6">
                    {[
                      { id: 'ai_enabled', label: 'Детектор ИИ', icon: <Activity size={18}/> },
                      { id: 'norm_enabled', label: 'Нормоконтроль АПАК', icon: <ShieldCheck size={18}/> }
                    ].map((tool) => (
                      <button
                        key={tool.id}
                        onClick={() => toggleTool(tool.id)}
                        className={`flex items-center gap-3 px-6 py-4 rounded-[20px] font-black uppercase tracking-widest text-[10px] transition-all cursor-pointer border-2 ${
                          settings[tool.id] 
                          ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200' 
                          : 'bg-white border-slate-100 text-slate-400 opacity-60'
                        }`}
                      >
                        {tool.icon}
                        {tool.label}
                        <div className={`w-2 h-2 rounded-full ${settings[tool.id] ? 'bg-green-300 animate-pulse' : 'bg-slate-300'}`}></div>
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => toggleTool('feedback_enabled')}
                    className={`group relative flex items-center gap-3 px-6 py-4 rounded-[20px] font-black uppercase tracking-widest text-[10px] transition-all cursor-pointer border-2 ${
                      settings.feedback_enabled 
                      ? 'bg-amber-500 border-amber-500 text-white shadow-lg shadow-amber-200' 
                      : 'bg-white border-slate-100 text-slate-400 opacity-60'
                    }`}
                  >
                    <span>Активировать обучение</span>

                    {/* КОНТЕЙНЕР ДЛЯ ИКОНКИ И ПОДСКАЗКИ */}
                    <div 
                      className="relative flex items-center justify-center group/tooltip"
                      onClick={(e) => e.stopPropagation()} 
                    >
                      <HelpCircle 
                        size={18} 
                        className={`transition-colors ${settings.feedback_enabled ? 'text-amber-200' : 'text-slate-300'} hover:text-blue-500`} 
                      />

                      {/* САМА ПОДСКАЗКА (ТЕПЕРЬ ВСПЛЫВАЕТ СНИЗУ) */}
                      <div className="absolute top-full mt-4 left-1/2 -translate-x-1/2 w-72 p-5 bg-slate-900 text-white rounded-[24px] shadow-2xl opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all duration-300 z-[100] pointer-events-none normal-case tracking-normal">
                        
                        {/* Стрелочка (ТЕПЕРЬ СВЕРХУ ПОДСКАЗКИ) */}
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 border-8 border-transparent border-b-slate-900"></div>
                        
                        <p className="font-black text-[10px] mb-2 uppercase tracking-[2px] text-amber-400 text-left">Режим Active Learning</p>
                        <p className="text-[11px] leading-relaxed font-medium text-slate-300 text-left">
                          При включении этого режима после каждого анализа появятся кнопки подтверждения. 
                          Ваша разметка поможет дообучить локальную модель <b>AI Sentinel</b>, делая её точнее в распознавании текстов.
                        </p>
                      </div>
                    </div>

                    {/* ИНДИКАТОР СОСТОЯНИЯ (точка) */}
                    <div className={`w-2 h-2 rounded-full ${settings.feedback_enabled ? 'bg-white animate-pulse' : 'bg-slate-300'}`}></div>
                  </button>
                  {result && result.html_content ? (
                    <div id="printable-report" className="relative bg-white min-h-[450px]">
                      {/* Шапка для печати (видна только на бумаге) */}
                      <div className="hidden print:block p-8 border-b-2 border-slate-200 mb-8">
                        <h1 className="text-3xl font-black text-slate-900 uppercase">AI Sentinel Report</h1>
                        <p className="text-slate-500 mt-2 font-bold">Проверено: {user?.email} | Документ: {result.filename || 'Текст'}</p>
                      </div>
                      <div 
                        className="text-left prose max-w-none p-10 text-slate-700 leading-relaxed font-serif print:p-0"
                        dangerouslySetInnerHTML={{ __html: result.html_content }} 
                      />
                    </div>
                  ) : (
                    <textarea 
                      className="w-full h-[450px] p-10 focus:outline-none focus:ring-4 focus:ring-blue-50/50 text-xl leading-relaxed text-slate-700 placeholder-slate-300 resize-none transition-all"
                      placeholder="Вставьте фрагмент текста или загрузите файл (.docx, .rtf) для полной проверки..."
                      value={text} onChange={(e) => setText(e.target.value)}
                    />
                  )}
                  <div className="relative overflow-hidden flex justify-between items-center p-8 bg-slate-50/50 border-t border-slate-100">
                    {loading && (
                      <>
                        <style>{`
                          @keyframes load-slide {
                            0% { transform: translateX(-100%); }
                            100% { transform: translateX(200%); }
                          }
                        `}</style>
                        <div className="absolute top-0 left-0 w-full h-[3px] bg-blue-100/50">
                          <div 
                            className="h-full bg-blue-600 rounded-r-full shadow-[0_0_8px_rgba(37,99,235,0.8)]" 
                            style={{ width: '50%', animation: 'load-slide 1.5s infinite ease-in-out' }} 
                          />
                        </div>
                      </>
                    )}
                    <div className="flex gap-6 text-[12px] font-black text-slate-400 uppercase tracking-widest items-center">
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-300">Слов:</span>
                        <span className="text-slate-600">{(text || "").split(/\s+/).filter(x => x).length}</span>
                      </div>
                      
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-300">Символов:</span>
                        <span className="text-slate-600">{(text || "").length}</span>
                      </div>

                      {/* НОВЫЙ БЛОК: СТРАНИЦЫ */}
                      {result?.page_count > 0 && (
                        <div className="flex items-center gap-1.5 bg-blue-50 px-3 py-1 rounded-full animate-in fade-in zoom-in duration-500">
                          <span className="text-blue-400">Страниц:</span>
                          <span className="text-blue-600 font-black">{result.page_count}</span>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-4">
                      {/* Очистка */}
                      {(text || result) && (
                        <button 
                          onClick={() => {
                            setText(''); 
                            setResult(null);
                            // Сбрасываем input файла, чтобы можно было загрузить тот же файл снова
                            const fileInput = document.getElementById('fup');
                            if (fileInput) fileInput.value = '';
                          }} 
                          className="p-3 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all cursor-pointer" 
                          title="Очистить поле и результаты"
                        >
                          <Trash2 size={22} />
                        </button>
                      )}

                      {/* Загрузка файла */}
                      <input 
                        type="file" 
                        id="fup" 
                        className="hidden" 
                        accept=".pdf,.docx,.doc,.rtf,.txt" 
                        onChange={handleFileUpload} 
                        disabled={loading} 
                      />
                      <label 
                        htmlFor="fup" 
                        className={`flex items-center justify-center w-14 h-14 rounded-2xl border-2 transition-all ${
                          loading 
                            ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed' 
                            : 'bg-white text-blue-600 border-blue-600 hover:bg-blue-50 cursor-pointer active:scale-95'
                        }`}
                      >
                        <FileUp size={24} />
                      </label>

                      {/* Кнопка Анализа */}
                      <button 
                        onClick={handleAnalyze}
                        disabled={loading || !(text && text.length >= 10)}
                        className={`flex items-center justify-center gap-3 h-14 px-10 rounded-2xl font-black uppercase tracking-widest text-sm transition-all shadow-xl active:scale-95 cursor-pointer ${
                          loading || !(text && text.length >= 10) ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none' : 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow-blue-200'
                        }`}
                      >
                        {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Send size={18}/> Анализ</>}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* --- ПРАВАЯ КОЛОНКА: РЕЗУЛЬТАТЫ И АНАЛИТИКА --- */}
              <div className="lg:col-span-4 space-y-6">
                
                {/* 1. КАРТОЧКА ДЕТЕКЦИИ ИИ */}
                {settings.ai_enabled && (
                  <div className="bg-white rounded-[32px] shadow-sm border border-slate-200 p-10 animate-in zoom-in duration-500">
                    <h3 className="text-slate-900 font-black text-xs uppercase tracking-[3px] mb-8 flex items-center gap-2">
                      <Activity size={18} className="text-blue-600" /> Верификация автора
                    </h3>
                    
                    {result && result.label !== "Disabled" ? (
                      <div className="text-center">
                        {/* Круговой индикатор вероятности */}
                        <div className="relative inline-flex mb-6">
                          <svg className="w-40 h-40 transform -rotate-90">
                            <circle className="text-slate-100" strokeWidth="10" stroke="currentColor" fill="transparent" r="70" cx="80" cy="80" />
                            <circle 
                              className={result.label === 'AI' ? 'text-red-500' : 'text-green-500'}
                              strokeWidth="10" 
                              strokeDasharray={440}
                              strokeDashoffset={440 - (440 * (result.score || 0))}
                              strokeLinecap="round" stroke="currentColor" fill="transparent" r="70" cx="80" cy="80" 
                            />
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center text-4xl font-black italic text-slate-800">
                            {((result.score || 0) * 100).toFixed(0)}%
                          </div>
                        </div>

                        <h2 className={`text-xl font-black uppercase mb-2 ${result.label === 'AI' ? 'text-red-600' : 'text-green-600'}`}>
                          {result.label === 'AI' ? 'Машинный текст' : 'Человек'}
                        </h2>

                        
                        {settings.feedback_enabled && result && result.id && (
                          <div className="mt-6 border-t border-slate-100 pt-6">
                            {!feedbackSent ? (
                              <div className="feedback-section flex flex-col items-center">
                                <p className="text-[10px] font-black uppercase text-slate-400 mb-3">Результат верный?</p>
                                <div className="feedback-section flex flex-col items-center">
                                <p className="text-[10px] font-black uppercase text-slate-400 mb-3">Результат верный?</p>
                                
                                {isFeedbackLoading ? (
                                  <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase tracking-widest h-[32px]">
                                    <div className="w-4 h-4 border-2 border-slate-200 border-t-blue-500 rounded-full animate-spin"></div>
                                    Запись в датасет...
                                  </div>
                                ) : (
                                  <div className="flex gap-4">
                                    <button 
                                      onClick={() => sendFeedback(result.id, true)}
                                      className="px-6 py-2 bg-green-50 text-green-600 rounded-xl font-bold text-xs hover:bg-green-100 transition-all cursor-pointer"
                                    >
                                      ✅ Да
                                    </button>
                                    <button 
                                      onClick={() => sendFeedback(result.id, false)}
                                      className="px-6 py-2 bg-red-50 text-red-600 rounded-xl font-bold text-xs hover:bg-red-100 transition-all cursor-pointer"
                                    >
                                      ❌ Нет
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                            ) : (
                              <div className="feedback-thanks text-center animate-in fade-in zoom-in">
                                <p className="text-blue-600 font-black text-[10px] uppercase tracking-widest">
                                  ✨ Спасибо! Данные учтены для обучения
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-3 mt-8">
                          <button onClick={() => window.print()} className="py-4 bg-slate-100 text-slate-700 rounded-2xl font-bold text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-slate-200 transition-all cursor-pointer">
                            <Printer size={16} /> Печать
                          </button>
                          <button onClick={downloadPDF} className="py-4 bg-slate-900 text-white rounded-2xl font-bold text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-slate-800 transition-all cursor-pointer">
                            <FileText size={16} /> PDF
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="py-16 text-center text-slate-200 border-4 border-dashed border-slate-50 rounded-[32px]">
                        <Activity size={48} className="mx-auto mb-4 opacity-10" />
                        <p className="text-[9px] font-black uppercase tracking-widest">Ожидание анализа ИИ</p>
                      </div>
                    )}
                  </div>
                )}

                {/* 2. КАРТОЧКА НОРМОКОНТРОЛЯ (APAC Standards) */}
                {settings.norm_enabled && (
                  <div className={`bg-white rounded-[32px] shadow-sm border border-slate-200 p-8 animate-in slide-in-from-bottom-4 duration-500 transition-all ${
                    result && result.filename?.toLowerCase().endsWith('.docx') 
                      ? (result.format_errors?.length > 0 ? 'border-l-8 border-l-amber-500' : 'border-l-8 border-l-green-500') 
                      : ''
                  }`}>
                    <h4 className="text-slate-900 font-black text-xs uppercase tracking-[2px] mb-6 flex items-center gap-2">
                      <ShieldCheck 
                        size={18} 
                        className={
                          !result || !result.filename?.toLowerCase().endsWith('.docx')
                            ? "text-slate-300" // Серый, если файла нет или это PDF
                            : result.format_errors?.length > 0 
                              ? "text-amber-500" 
                              : "text-green-500"
                        } 
                      /> 
                      Нормоконтроль АПАК
                    </h4>

                    {!result || !result.filename?.toLowerCase().endsWith('.docx') ? (
                      // 1. СОСТОЯНИЕ: Файл еще не загружен ИЛИ это не docx (например, txt или pdf)
                      <div className="py-10 text-center text-slate-200 border-4 border-dashed border-slate-50 rounded-[24px]">
                        <p className="text-[9px] font-black uppercase tracking-widest">Ждем файл .docx или .rtf</p>
                      </div>
                    ) : result.format_errors && result.format_errors.length > 0 ? (
                      // 2. СОСТОЯНИЕ: Файл docx загружен и найдены ошибки
                      <div className="space-y-3">
                        {result.format_errors.map((err, i) => {
                          const category = err.match(/\[(.*?)\]/)?.[1] || "Общее";
                          const message = err.replace(/\[.*?\]/, "").trim();
                          return (
                            <div key={i} className="flex flex-col gap-1 pb-3 border-b border-slate-50 last:border-0">
                              <span className="text-[8px] font-black text-amber-600 uppercase tracking-tighter">{category}</span>
                              <p className="text-[11px] text-slate-600 font-bold leading-tight">{message}</p>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      // 3. СОСТОЯНИЕ: Файл docx загружен и ошибок нет
                      <div className="bg-green-50 p-5 rounded-[20px] text-green-700 text-center shadow-inner">
                        <CheckCircle2 size={24} className="mx-auto mb-2 opacity-50" />
                        <p className="text-[10px] font-black uppercase tracking-wider text-green-600">Оформление соответствует</p>
                        <p className="text-[9px] font-medium mt-1 opacity-70 italic text-green-800">Проверка АПАК пройдена успешно</p>
                      </div>
                    )}
                  </div>
                )}

                {/* 3. ИНФОРМАЦИОННЫЙ БЛОК */}
                <div className="bg-blue-600 rounded-[32px] p-8 text-white shadow-xl shadow-blue-500/20 relative overflow-hidden group">
                  {/* Декоративный элемент на фоне */}
                  <div className="absolute -right-4 -bottom-4 opacity-10 group-hover:scale-110 transition-transform">
                    <ShieldCheck size={120} />
                  </div>
                  
                  <h4 className="font-black text-[10px] uppercase tracking-widest mb-4 flex items-center gap-2 relative z-10">
                    <AlertTriangle size={16} className="text-blue-200" /> Справка системы
                  </h4>
                  <div className="space-y-4 relative z-10">
                    <p className="text-blue-100 text-[11px] leading-relaxed font-medium">
                      <b>AI Sentinel</b> — это локально развернутая нейросеть, дообученная на разноформатных текстах.
                    </p>
                    <div className="h-px bg-blue-500/50 w-full" />
                    <p className="text-blue-100 text-[11px] leading-relaxed font-medium">
                      Для корректной проверки полей и шрифтов используйте формат <b>Microsoft Word (.docx)</b>.
                    </p>
                  </div>
                </div>

                {/* ФУТЕР КОЛОНКИ */}
                {!settings.ai_enabled && !settings.norm_enabled && (
                  <div className="p-10 text-center bg-slate-50 rounded-[32px] border-2 border-dashed border-slate-200">
                    <p className="text-[10px] font-black text-slate-400 uppercase">Все инструменты отключены</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* --- ВКЛАДКА 2: ИСТОРИЯ --- */}
          {activeTab === 'history' && (
            <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
              
              {/* Верхняя панель с кнопкой удаления (выровнена по ширине будущей таблицы) */}
              <div className="flex justify-end items-center">
                <button 
                  onClick={deleteAllHistory} 
                  className="flex items-center gap-2 px-6 py-3 bg-red-50 text-red-600 hover:bg-red-100 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all cursor-pointer active:scale-95 border border-red-100"
                >
                  <Trash2 size={16} /> Очистить историю сканов
                </button>
              </div>

              {/* Основная карточка таблицы */}
              {/* Скругление rounded-[32px] теперь совпадает с карточками анализатора */}
              <div className="bg-white rounded-[32px] shadow-sm border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse table-fixed">
                    <thead>
                      <tr className="bg-slate-50/50 border-b border-slate-100">
                        <th className="p-8 text-[10px] font-black uppercase tracking-[2px] text-slate-400 w-[120px]">Дата</th>
                        <th className="p-8 text-[10px] font-black uppercase tracking-[2px] text-slate-400 w-1/3">Документ</th>
                        <th className="p-8 text-[10px] font-black uppercase tracking-[2px] text-slate-400 w-[100px]">Вердикт</th>
                        <th className="p-8 text-[10px] font-black uppercase tracking-[2px] text-slate-400">Оформление</th>
                        <th className="p-8 text-[10px] font-black uppercase tracking-[2px] text-slate-400 w-[100px] text-right">Точность</th>
                        <th className="p-8 text-[10px] font-black uppercase tracking-[2px] text-slate-400 w-[100px] text-right">Удалить</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {history.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50/30 transition-all group">
                          <td className="p-8 text-xs text-slate-500 font-mono">
                            {new Date(item.created_at).toLocaleDateString('ru-RU')}
                          </td>
                          <td className="p-8">
                            <div className="flex items-center gap-3">
                              {item.filename ? (
                                <FileText size={18} className="text-blue-500 shrink-0" />
                              ) : (
                                <Send size={16} className="text-slate-400 shrink-0" />
                              )}
                              <p className="text-sm text-slate-700 font-bold truncate italic">
                                {item.filename || `"${item.text_content.substring(0, 50)}..."`}
                              </p>
                            </div>
                          </td>
                          <td className="p-8">
                            <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                              item.label === 'AI' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'
                            }`}>
                              {item.label === 'AI' ? 'AI' : 'Human'}
                            </span>
                          </td>
                          
                          <td className="p-8">
                            {item.format_errors === null ? (
                              <span className="text-slate-300 text-[10px] font-bold uppercase">Нет данных</span>
                            ) : item.format_errors.length === 0 ? (
                              <div className="flex items-center gap-2 text-green-600 font-black text-[10px] uppercase tracking-widest">
                                <CheckCircle2 size={14} /> ГОСТ OK
                              </div>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                {[...new Set(item.format_errors.map(err => err.match(/\[(.*?)\]/)?.[1] || 'Инфо'))].slice(0, 2).map((cat, idx) => (
                                  <span key={idx} className="bg-amber-100 text-amber-700 px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-tighter">
                                    {cat}
                                  </span>
                                ))}
                                {item.format_errors.length > 2 && <span className="text-slate-400 text-[9px] font-bold">...</span>}
                              </div>
                            )}
                          </td>

                          <td className="p-8 text-right font-black text-slate-700 text-sm tracking-tighter">
                            {(item.score * 100).toFixed(1)}%
                          </td>

                          <td className="p-8 text-right">
                            <button 
                              onClick={() => deleteHistoryItem(item.id)} 
                              className="p-3 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all cursor-pointer"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  
                  {history.length === 0 && (
                    <div className="p-32 text-center text-slate-300 font-black uppercase tracking-widest bg-white">
                      История сканирований пуста
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'admin' && user?.role === 'admin' && (
            <div className="space-y-10 animate-in fade-in slide-in-from-right-4 duration-500">
              
              {/* ВЕРХНЯЯ ПАНЕЛЬ: ПОИСК И ГЛОБАЛЬНАЯ ОЧИСТКА */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                <div className="lg:col-span-8 relative">
                  <div className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400">
                    <Search size={22} />
                  </div>
                  <input 
                    type="text"
                    placeholder="Поиск по email пользователя..."
                    className="w-full pl-16 pr-8 py-6 bg-white border border-slate-200 rounded-[32px] outline-none focus:ring-4 focus:ring-blue-100/50 transition-all font-bold text-slate-700 shadow-sm"
                    value={adminSearch}
                    onChange={(e) => setAdminSearch(e.target.value)}
                  />
                </div>
                <button 
                  onClick={() => window.open(`${API_URL}/admin/export-dataset`, '_blank')}
                  className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-700 transition-all cursor-pointer active:scale-95"
                >
                  <Database size={16} /> Скачать датасет (CSV)
                </button>
                <div className="lg:col-span-4">
                  <button 
                    onClick={adminWipeAllHistory} 
                    className="w-full flex items-center justify-center gap-3 px-8 py-6 bg-red-600 text-white hover:bg-red-700 rounded-[32px] font-black uppercase tracking-widest text-[11px] shadow-xl shadow-red-500/20 transition-all cursor-pointer active:scale-95"
                  >
                    <ServerCrash size={20} /> Очистить базу сканов
                  </button>
                </div>
              </div>

              {/* ТАБЛИЦА ПОЛЬЗОВАТЕЛЕЙ */}
              <div className="bg-white rounded-[32px] shadow-sm border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/50 border-b border-slate-100">
                        {[
                          { label: 'ID', key: 'id' },
                          { label: 'Пользователь', key: 'email' },
                          { label: 'Роль', key: 'role' },
                          { label: 'Сканирований', key: 'scans_count' }
                        ].map((col) => (
                          <th 
                            key={col.key}
                            onClick={() => toggleSort(col.key)}
                            className="p-8 text-[10px] font-black uppercase tracking-[2px] text-slate-400 cursor-pointer hover:text-blue-600 transition-colors"
                          >
                            <div className="flex items-center gap-2">
                              {col.label} <ArrowUpDown size={12} className="opacity-30" />
                            </div>
                          </th>
                        ))}
                        <th className="p-8 text-[10px] font-black uppercase tracking-[2px] text-slate-400 text-right">Управление</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {adminUsers
                        .filter(u => u.email.toLowerCase().includes(adminSearch.toLowerCase()))
                        .sort((a, b) => {
                          const factor = adminSort.direction === 'asc' ? 1 : -1;
                          return a[adminSort.key] > b[adminSort.key] ? factor : -factor;
                        })
                        .slice(0, showAllAdminUsers ? undefined : 5)
                        .map((u) => (
                          <tr key={u.id} className="hover:bg-slate-50/30 transition-all group">
                            <td className="p-8 text-xs text-slate-400 font-mono">#{u.id}</td>
                            <td className="p-8 font-black text-slate-800">{u.email}</td>
                            <td className="p-8">
                              <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest ${u.role === 'admin' ? 'bg-amber-100 text-amber-700' : 'bg-blue-50 text-blue-600'}`}>
                                {u.role}
                              </span>
                            </td>
                            <td className="p-8 font-mono text-slate-500 font-bold">{u.scans_count} шт.</td>
                            <td className="p-8 text-right">
                              <div className="flex justify-end gap-3">
                                <button 
                                  onClick={() => adminClearUserHistory(u.id)}
                                  className="p-3 bg-white border border-slate-100 text-slate-300 hover:text-amber-600 hover:bg-amber-50 rounded-2xl cursor-pointer transition-all active:scale-90"
                                  title="Очистить сканы"
                                >
                                  <Database size={18} />
                                </button>
                                <button 
                                  onClick={() => adminDeleteUser(u.id)} 
                                  disabled={u.id === user.id} 
                                  className={`p-3 rounded-2xl transition-all ${u.id === user.id ? 'opacity-10 grayscale cursor-not-allowed' : 'bg-white border border-slate-100 text-slate-300 hover:text-red-500 hover:bg-red-50 cursor-pointer active:scale-90'}`} 
                                  title="Удалить аккаунт"
                                >
                                  <UserX size={18} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>

                {/* КНОПКА РАСКРЫТИЯ */}
                {adminUsers.length > 5 && (
                  <button 
                    onClick={() => setShowAllAdminUsers(!showAllAdminUsers)}
                    className="w-full p-8 bg-slate-50/50 border-t border-slate-100 text-[10px] font-black uppercase tracking-[3px] text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all flex items-center justify-center gap-3 cursor-pointer"
                  >
                    {showAllAdminUsers ? (
                      <><ChevronUp size={18}/> Свернуть список</>
                    ) : (
                      <><ChevronDown size={18}/> Показать всех пользователей ({adminUsers.length})</>
                    )}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* --- ВКЛАДКА 4: НАСТРОЙКИ --- */}
          {activeTab === 'settings' && (
            <div className="bg-white rounded-[40px] shadow-sm border border-slate-200 p-12 animate-in fade-in slide-in-from-right-4 duration-500">
              
              {/* ХЕДЕР НАСТРОЕК */}
              <div className="flex items-center justify-between mb-12">
                <div>
                  <h2 className="text-3xl font-black text-slate-800 tracking-tight">Параметры верификации</h2>
                  <p className="text-slate-500 mt-1 font-medium italic text-sm">Конфигурация правил автоматизированного нормоконтроля</p>
                </div>
                
                <div className="flex items-center gap-6">
                  {/* ИНЛАЙН СТАТУС СООБЩЕНИЕ */}
                  {statusMsg.text && (
                    <div className={`text-xs font-black uppercase tracking-widest px-4 py-2 rounded-full animate-in zoom-in duration-300 ${
                      statusMsg.type === 'error' ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-600'
                    }`}>
                      {statusMsg.text}
                    </div>
                  )}

                  <div className="flex items-center gap-3">
                    <button 
                      onClick={resetSettings}
                      className="flex items-center gap-2 px-6 py-4 border-2 border-slate-100 text-slate-400 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-slate-50 hover:text-slate-600 transition-all cursor-pointer active:scale-95"
                    >
                      <RotateCcw size={16} /> Сбросить
                    </button>

                    <button 
                      onClick={saveSettings} 
                      className="flex items-center gap-3 px-10 py-5 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl shadow-blue-500/20 hover:bg-blue-700 transition-all cursor-pointer active:scale-95"
                    >
                      <CheckCircle2 size={18} /> Сохранить профиль
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
                
                {/* ЛЕВАЯ КОЛОНКА: ТЕХНИЧЕСКИЕ ПАРАМЕТРЫ */}
                <div className="lg:col-span-7 space-y-10">
                  
                  {/* ШРИФТЫ */}
                  <section className="space-y-6">
                    <div className="flex items-center gap-3">
                      <div className="w-1.5 h-6 bg-blue-600 rounded-full"></div>
                      <h4 className="text-slate-800 font-black text-xs uppercase tracking-[2px]">Типографика и текст</h4>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-8 bg-slate-50/50 p-8 rounded-[32px] border border-slate-100">
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider ml-1">Гарнитура (Шрифт)</label>
                        <select 
                          className="w-full p-4 bg-white rounded-2xl border-none outline-none shadow-sm focus:ring-2 focus:ring-blue-500 font-bold text-slate-700 cursor-pointer"
                          value={settings.font_name}
                          onChange={(e) => setSettings({...settings, font_name: e.target.value})}
                        >
                          <option>Times New Roman</option>
                          <option>PT Astra Serif</option>
                          <option>Liberation Serif</option>
                          <option>Arial</option>
                          <option>Calibri</option>
                          <option>Inter</option>
                        </select>
                      </div>
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider ml-1">Размер (pt)</label>
                        <input 
                          type="number" 
                          className="w-full p-4 bg-white rounded-2xl border-none outline-none shadow-sm focus:ring-2 focus:ring-blue-500 font-bold text-slate-700"
                          value={settings.font_size}
                          onChange={(e) => setSettings({...settings, font_size: parseInt(e.target.value) || 0})}
                        />
                      </div>
                      <div className="col-span-2 space-y-3 pt-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider ml-1">Минимальное кол-во источников в списке литературы</label>
                        <div className="flex items-center gap-4">
                          <input 
                            type="range" min="1" max="20"
                            className="flex-1 accent-blue-600 cursor-pointer"
                            value={settings.min_references}
                            onChange={(e) => setSettings({...settings, min_references: parseInt(e.target.value)})}
                          />
                          <span className="w-12 text-center font-black text-blue-600 bg-blue-50 py-2 rounded-lg">{settings.min_references}</span>
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* ПОЛЯ СТРАНИЦЫ */}
                  <section className="space-y-6">
                    <div className="flex items-center gap-3">
                      <div className="w-1.5 h-6 bg-blue-600 rounded-full"></div>
                      <h4 className="text-slate-800 font-black text-xs uppercase tracking-[2px]">Разметка страницы (см)</h4>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-50/50 p-8 rounded-[32px] border border-slate-100">
                      {[
                        { label: 'Верхнее', key: 'margin_top' },
                        { label: 'Нижнее', key: 'margin_bottom' },
                        { label: 'Левое', key: 'margin_left' },
                        { label: 'Правое', key: 'margin_right' },
                      ].map((item) => (
                        <div key={item.key} className="space-y-2">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center block">{item.label}</label>
                          <input 
                            type="number" step="0.1"
                            className="w-full p-4 bg-white rounded-xl border-none outline-none shadow-sm focus:ring-2 focus:ring-blue-500 font-mono font-bold text-center text-slate-600"
                            value={settings[item.key]}
                            onChange={(e) => setSettings({...settings, [item.key]: parseFloat(e.target.value) || 0})}
                          />
                        </div>
                      ))}
                    </div>
                  </section>
                </div>

                {/* ПРАВАЯ КОЛОНКА: NLP ПРОВЕРКИ */}
                <div className="lg:col-span-5 space-y-10">
                  <section className="space-y-6">
                    <div className="flex items-center gap-3">
                      <div className="w-1.5 h-6 bg-blue-600 rounded-full"></div>
                      <h4 className="text-slate-800 font-black text-xs uppercase tracking-[2px]">Интеллектуальный анализ (NLP)</h4>
                    </div>

                    <div className="space-y-4">
                      {[
                        { label: 'Верификация перевода (RU/EN)', key: 'check_translation', desc: 'Сравнение смысла названия организации на двух языках' },
                        { label: 'Релевантность аннотации', key: 'check_abstract', desc: 'Проверка соответствия краткого содержания основному тексту' },
                        { label: 'Поиск экспертных заключений', key: 'check_expert', desc: 'Автоматическое обнаружение разрешительных формулировок' },
                        { label: 'Стандарты АПАК (строго)', key: 'check_apak', desc: 'Специфические правила шрифтов (11/12pt) и отступов СибГУ' },
                      ].map((item) => (
                        <div 
                          key={item.key} 
                          onClick={() => setSettings({...settings, [item.key]: !settings[item.key]})}
                          className={`p-6 rounded-[32px] border-2 transition-all cursor-pointer flex items-center justify-between group ${
                            settings[item.key] ? 'border-blue-100 bg-blue-50/30' : 'border-slate-50 bg-slate-50/20 opacity-60'
                          }`}
                        >
                          <div className="max-w-[80%]">
                            <p className={`font-black text-sm uppercase tracking-tight ${settings[item.key] ? 'text-blue-900' : 'text-slate-500'}`}>
                              {item.label}
                            </p>
                            <p className="text-[10px] text-slate-400 font-medium mt-1 leading-relaxed">{item.desc}</p>
                          </div>
                          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${
                            settings[item.key] ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'bg-slate-200 text-slate-400'
                          }`}>
                            <Activity size={20} className={settings[item.key] ? 'animate-pulse' : ''} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  {/* ПРЕДУПРЕЖДЕНИЕ */}
                  <div className="bg-amber-50 p-8 rounded-[32px] border border-amber-100/50">
                    <div className="flex items-center gap-3 text-amber-600 mb-3">
                      <AlertTriangle size={24} />
                      <span className="font-black text-xs uppercase tracking-widest">Обратите внимание</span>
                    </div>
                    <p className="text-[11px] text-amber-800/70 font-bold leading-relaxed uppercase">
                      Все изменения применяются ко всем последующим сканированиям в реальном времени. 
                      Прошлые результаты в истории останутся без изменений.
                    </p>
                  </div>
                </div>

              </div>
            </div>
          )}
        </div>
      </main>
      {/* {showCookieWarning && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[200] w-[90%] max-w-2xl animate-in fade-in slide-in-from-bottom-8 duration-500">
          <div className="bg-slate-900 border-2 border-blue-500/50 shadow-2xl rounded-[32px] p-8 text-white relative overflow-hidden">
            <div className="flex items-start gap-6 relative z-10">
              <div className="bg-blue-600 p-4 rounded-2xl shrink-0">
                <ShieldCheck size={32} />
              </div>
              <div>
                <h4 className="text-xl font-black uppercase tracking-tight mb-2">Настройка доступа</h4>
                <p className="text-slate-300 text-sm leading-relaxed mb-6">
                  Ваш браузер блокирует куки для защиты. Чтобы не «вылетать» из системы: <br />
                  1. Нажмите на иконку щита в адресной строке.<br />
                  2. Зайдите в <b>«Дополнительно» -`&gt;` «Настройки сайтов»</b>.<br />
                  3. Разрешите использование куки для этого сайта.
                </p>
                <div className="flex gap-4">
                  <button 
                    onClick={() => handleDismissCookieWarning(true)} // Кнопка "Я всё настроил"
                    className="px-8 py-3 bg-blue-600 hover:bg-blue-700 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all cursor-pointer"
                  >
                    Я всё настроил
                  </button>
                  <button 
                    onClick={() => handleDismissCookieWarning(false)} // Просто закрыть
                    className="px-8 py-3 bg-slate-800 text-slate-400 rounded-xl font-black text-[10px] uppercase tracking-widest"
                  >
                    Закрыть
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )} */}
    </div>
  );
}

export default App;