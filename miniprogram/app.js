const theme = require('./utils/theme');

App({
  globalData: {
    theme: 'light',
  },
  onLaunch() {
    this.globalData.theme = theme.initialTheme();
  },
  setTheme(value) {
    this.globalData.theme = theme.setTheme(value);
  },
});
