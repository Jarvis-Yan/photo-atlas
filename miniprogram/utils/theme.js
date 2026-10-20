function initialTheme() {
  const saved = wx.getStorageSync('photo-atlas-theme');
  if (saved === 'light' || saved === 'dark') return saved;
  try {
    const info = typeof wx.getAppBaseInfo === 'function' ? wx.getAppBaseInfo() : {};
    return info.theme === 'dark' ? 'dark' : 'light';
  } catch (_) {
    return 'light';
  }
}

function setTheme(value) {
  const next = value === 'dark' ? 'dark' : 'light';
  wx.setStorageSync('photo-atlas-theme', next);
  wx.setNavigationBarColor({
    frontColor: next === 'dark' ? '#ffffff' : '#000000',
    backgroundColor: next === 'dark' ? '#111927' : '#f3f6fb',
    animation: {duration: 180, timingFunc: 'easeIn'},
  });
  if (wx.setTabBarStyle) wx.setTabBarStyle({color:next==='dark'?'#9caabd':'#52647a',selectedColor:next==='dark'?'#edf1f7':'#182437',backgroundColor:next==='dark'?'#111927':'#f3f6fb',borderStyle:next==='dark'?'black':'white'});
  return next;
}

function pageTheme(page) {
  const value = getApp().globalData.theme || initialTheme();
  setTheme(value);
  if(page.data.theme!==value)page.setData({theme:value});
}

module.exports = {initialTheme, setTheme, pageTheme};
