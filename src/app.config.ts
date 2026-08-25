export default defineAppConfig({
  pages: [
    'pages/branches/index',
    'pages/members/index',
    'pages/training/index',
    'pages/mine/index',
    'pages/addTraining/index'
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#d43030',
    navigationBarTitleText: '党员培训记录',
    navigationBarTextStyle: 'white'
  },
  tabBar: {
    color: '#86909c',
    selectedColor: '#d43030',
    backgroundColor: '#ffffff',
    borderStyle: 'white',
    list: [
      {
        pagePath: 'pages/branches/index',
        text: '党支部'
      },
      {
        pagePath: 'pages/members/index',
        text: '党员'
      },
      {
        pagePath: 'pages/training/index',
        text: '培训'
      },
      {
        pagePath: 'pages/mine/index',
        text: '我的'
      }
    ]
  }
})
