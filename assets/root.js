(() => {
  const saved = localStorage.getItem('alm-language');
  const browser = (navigator.language || '').toLowerCase();
  const language = saved === 'ja' || saved === 'en'
    ? saved
    : (browser.startsWith('ja') ? 'ja' : 'en');

  window.location.replace(new URL(`/${language}/`, window.location.origin).href);
})();
